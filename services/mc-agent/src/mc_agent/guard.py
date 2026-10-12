"""Honesty checks on the model's output before it reaches the TV.

The guard never writes MC words (honesty rule 5). It formats and trims the model's own text, and it
rejects an answer that breaks a checkable rule, with a reason the model is given on its one retry:
- a number in the MC's words that the payload cannot produce, written in digits or in words ("forty-seven",
  "one point two", "a hundred and seventy"), or an unfilled [placeholder]. A number said with a hedge ("about
  fifteen", "nearly fifteen", "just over one", "fifteen or so") may be an honest spoken rounding of a measured one:
  to one or two significant figures, the nearest whole number or half, within 15% (half a unit for numbers of one
  or more), never to zero, and "under" / "over" must point the right way. "Nearly" / "just over" (and the other
  hedges that claim nearness) also need the measured number strictly on that side and the said one to be its nearest
  rounding: 4.1 is "just over four", never "nearly four and a half". Times in seconds may be said in minutes;
- `spoken` (read aloud) carrying a clock time, a decimal in digits or a unit abbreviation;
- words were off and the answer does not say pace and fillers were not measured (debrief, or a chat
  question about pace or fillers);
- a `next` venue other than the house rule's, unless the line says "my call", or anything above the Arena;
- a content pattern named anywhere in the words (headline, line, fix, spoken; a card; a green-room answer) that the
  payload never counted ("wordplay carried the room" when no wordplay was found), unless it is negated ("no
  wordplay") or offered in the fix as something to try;
- a room move in the debrief's words that contradicts its `next` ("try the next room up" with `next` 'again', or at
  the Arena, where nothing is above).
A debrief that breaks several of these is rejected with every reason at once, so the one retry can fix them all.
Lengths are trimmed at a sentence or word boundary; markdown and quoting brackets are dropped.
"""

import math
import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from .facts import clock, history_parts, next_venue, reaction_features, rounds
from .models import (
    ChatRequest, Debrief, DebriefRequest, GreenRoomReply, McLineDraft, McLineRequest, McNoteDraft, McReplyDraft,
    MomentLine, Scorecard,
)

# The show's own thresholds and targets (stated in the prompt rules); quoting them is not a claim about the set.
HOUSE_NUMBERS = {"0", "1", "2", "3", "4", "5", "60", "70", "100", "120", "160", "170", "185", "0.45", "0.5", "1.2"}
NUMBER = re.compile(r"\d+:\d{2}|\d+(?:\.\d+)?")
PLACEHOLDER = re.compile(r"\[[^\]\d]*[a-zA-Z][^\]\d]*\]")
NOT_MEASURED = re.compile(r"not measured|weren'?t measured|wasn'?t measured|words (were|was) off|no words", re.I)
ASKS_PACE_OR_FILLERS = re.compile(r"\b(pace|fast|slow|speed|rush\w*|wpm|quick|fillers?|ums?|uh|like|basically)\b", re.I)


# A question about a single bit or line, which the green room is never given numbers for.
SINGLE_UNIT = re.compile(
    r"\bbits?\s*\d+|\b(that|the|this|my|last|first|second|third|opening|closing) (bit|line|joke|punchline|closer|opener)\b"
    r"|\bhow did (it|that) (feel|sound)\b",
    re.I,
)
SCOPE_SAID = re.compile(
    r"didn'?t measure|not measured|wasn'?t measured|aren'?t measured|isn'?t in what|not in what|wasn'?t given|not given|"
    r"don'?t have|no numbers? for|only (have|got|measured)|whole[- ]set|whole set|per[- ]bit|single bits?|by bit",
    re.I,
)


# Written for the ear: short sentences, so a few more of them (the 320 characters still bound the length).
SPOKEN_SENTENCES = 4
# The debrief is heard as the cut sheet comes up: about ten seconds (three short sentences), not the 17.8 s it ran on
# the Google TV (2026-10-12).
DEBRIEF_SPOKEN_SENTENCES = 3
DEBRIEF_SPOKEN_MAX = 180
# The intro is heard before the set starts, and the set waits for it: two short sentences, about four seconds.
INTRO_SENTENCES = 2
INTRO_MAX = 90

COMPARATIVE = re.compile(r"\b(best|worst|ever|yet|than last)\b", re.I)
NEGATION = re.compile(r"\b(not|no|never|nothing)\b|n't", re.I)


class Rejected(ValueError):
    """The answer breaks a checkable honesty rule; the message says which, for the retry."""


def fit(text: str, limit: int) -> str:
    """Trim to `limit` characters at the last sentence end, else the last word, without breaking a word."""
    text = re.sub(r"[*_`#]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    ends = [m.end() for m in re.finditer(r"[.!?](?=\s|$)", cut)]
    if ends and ends[-1] >= limit * 0.5:
        return cut[: ends[-1]].strip()
    space = cut.rfind(" ")
    head = cut[: space if space > 0 else limit - 1].rstrip(" ,;:-")
    return head[: limit - 1] + "…"


def clean(text: str, limit: int, sentences: int | None = None) -> str:
    """Reject unfilled [placeholders]; drop [4.1]-style brackets and wrapping quotes; capitalise; trim."""
    if PLACEHOLDER.search(text):
        raise Rejected(f"it contains an unfilled placeholder ({PLACEHOLDER.search(text).group(0)}); use the real numbers")
    text = re.sub(r"\[([^\]]*)\]", r"\1", text).strip().strip('"“”').strip()
    if sentences:
        text = " ".join(re.split(r"(?<=[.!?])(?<!\.\.\.)\s+", text)[:sentences])
    text = fit(text, limit)
    return text[:1].upper() + text[1:]


# --- numbers, in digits and in words -----------------------------------------------------------------------

UNITS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
    "eighteen nineteen".split())}
TENS = {w: 10 * i for i, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split(), start=2)}
SCALES = {"hundred": 100, "thousand": 1000, "million": 1_000_000}
# Ordinals count too ("your seventh line"). "second" is left out: it is also the unit of time.
ORDINALS = {"first": "one", "third": "three", "fourth": "four", "fifth": "five", "sixth": "six", "seventh": "seven",
            "eighth": "eight", "ninth": "nine", "tenth": "ten", "eleventh": "eleven", "twelfth": "twelve",
            "hundredth": "hundred", "thousandth": "thousand", "millionth": "million",
            **{w + "th": w for w in UNITS if UNITS[w] >= 13}, **{w[:-1] + "ieth": w for w in TENS}}
TIMES = {"once": 1, "twice": 2}
NUMBER_WORDS = set(UNITS) | set(TENS) | set(SCALES) | set(ORDINALS) | set(TIMES) | {"half"}
TOKEN = re.compile(r"\d+:\d{2}|\d+(?:\.\d+)?|[A-Za-z]+")
JOINED = re.compile(r"[\s-]*")  # what may sit between the words of one number ("seventy-two", "a hundred and six")

# Hedges that claim nearness as well as a direction ("nearly fifteen" is close to fifteen, from below); the rest only
# bound the number ("under five seconds").
CLOSE_BELOW = ("nearly", "almost", "not quite", "just under", "a little under", "a bit under", "just shy of")
CLOSE_ABOVE = ("just over", "a little over", "a bit over", "just past", "just above", "a little above")
BELOW = CLOSE_BELOW + ("under", "less than", "shy of", "short of", "below")
ABOVE = CLOSE_ABOVE + ("over", "more than", "upwards of", "north of", "above")
EITHER = ("about", "around", "roughly", "approximately", "some", "close to", "something like")
HEDGE_BEFORE = re.compile(r"\b(" + "|".join(sorted(BELOW + ABOVE + EITHER, key=len, reverse=True)) + r")\s+$", re.I)
HEDGE_AFTER = re.compile(r"^(?:-?ish\b|\s+or so\b)", re.I)
# Fields that hold a time in seconds; said in minutes, they are divided by 60.
TIME_KEYS = {"durationSec", "duration_sec", "longestDeadAirAt", "longest_dead_air_at", "at", "t", "t0", "t1",
             "elapsedSec", "elapsed_sec"}


@dataclass(frozen=True)
class Said:
    """One number in the MC's words: as written, its value, and the hedge it carries ("below", "above", "either")."""

    text: str
    value: float | None  # None for a clock time
    hedge: str | None = None
    close: bool = False  # the hedge claims nearness too ("nearly", "just over"), not only a direction


def _word_value(words: list[str]) -> float:
    """'a hundred and seventy-two' -> 172, 'one point two' -> 1.2, 'two and a half' -> 2.5, 'twenty-first' -> 21,
    'one seventy-two' (the way a speed is said) -> 172."""
    if "point" in words:
        i = words.index("point")
        decimals = "".join(str(UNITS[w]) for w in words[i + 1 :] if UNITS.get(w, 10) < 10)
        return _word_value(words[:i]) + (float("0." + decimals) if decimals else 0.0)
    total = current = 0.0
    half = False
    prev = None
    for w in (ORDINALS.get(w, w) for w in words):
        if w in ("and", "a"):
            continue
        if w == "half":
            half = True
        elif w in TIMES:
            current += TIMES[w]
        elif w in SCALES:
            if SCALES[w] == 100:
                current = max(current, 1) * 100
            else:
                total, current = total + max(current, 1) * SCALES[w], 0.0
        elif w in TENS and prev in UNITS and 0 < UNITS[prev] < 10 and current < 10:
            current = current * 100 + TENS[w]  # "one seventy" = 170
        else:
            current += UNITS.get(w, TENS.get(w, 0))
        prev = w
    return total + current + (0.5 if half else 0.0)


def _composes(last: str, w: str) -> bool:
    """Whether number word `w` continues the number that ends in `last` ("seventy" + "two", "two" + "hundred",
    "one" + "seventy"), rather than starting a new one ("one two three" are three numbers)."""
    if last in ORDINALS or last in TIMES or w in TIMES or last == "half":
        return False
    c = ORDINALS.get(w, w)
    if c in SCALES:
        return last in UNITS or last in TENS or last == "a" or (last in SCALES and SCALES[last] < SCALES[c])
    if c in TENS:
        return last in SCALES or last == "and" or (last in UNITS and 1 <= UNITS[last] <= 9)
    if c in UNITS:
        return last in TENS or last in SCALES or last == "and"
    return c == "half" and last == "a"


def numbers_in(text: str) -> list[Said]:
    """Every number in `text`, in digits or in words, with its hedge."""
    tokens = [(m.group(0), m.start(), m.end()) for m in TOKEN.finditer(text)]

    def word(k: int) -> str:
        return tokens[k][0].lower() if k < len(tokens) else ""

    def joined(a: int, b: int) -> bool:
        return b < len(tokens) and JOINED.fullmatch(text[tokens[a][2] : tokens[b][1]]) is not None

    out: list[Said] = []
    i = 0
    while i < len(tokens):
        tok, start, _ = tokens[i]
        low = tok.lower()
        if tok[0].isdigit():
            j, said, value = i + 1, tok, (None if ":" in tok else float(tok))
        elif low in NUMBER_WORDS or (low == "a" and joined(i, i + 1) and word(i + 1) in SCALES):
            j, words, decimals = i + 1, [low], False
            while joined(j - 1, j):
                w, last, after = word(j), words[-1], word(j + 1)
                digit_next = UNITS.get(after, 10) < 10 and joined(j, j + 1)
                if decimals:
                    ok = UNITS.get(w, 10) < 10
                elif w == "point":
                    ok = decimals = last in NUMBER_WORDS and last not in TIMES and digit_next
                elif w == "and":
                    ok = joined(j, j + 1) and (
                        (after in NUMBER_WORDS and after not in TIMES and last in SCALES)
                        or (after == "a" and word(j + 2) == "half")
                    )
                elif w == "a":
                    ok = last == "and" and after == "half"
                else:
                    ok = w in NUMBER_WORDS and _composes(last, w)
                if not ok:
                    break
                words.append(w)
                j += 1
            said, value = text[start : tokens[j - 1][2]], _word_value(words)
        else:
            i += 1
            continue
        head = HEDGE_BEFORE.search(text[:start])
        tail = HEDGE_AFTER.search(text[tokens[j - 1][2] :])
        hedge, close = None, False
        if head:
            h = re.sub(r"\s+", " ", head.group(1).lower())
            hedge = "below" if h in BELOW else "above" if h in ABOVE else "either"
            close = h in CLOSE_BELOW or h in CLOSE_ABOVE
        elif tail:
            hedge = "either"
        out.append(Said(said, value, hedge, close))
        i = j
    return out


def _numbers(value: object) -> Iterable[float]:
    if isinstance(value, bool):
        return
    if isinstance(value, int | float):
        yield float(value)
    elif isinstance(value, str):
        for n in numbers_in(value):
            if n.value is not None:
                yield n.value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _numbers(v)
    elif isinstance(value, list):
        for v in value:
            yield from _numbers(v)


def _times(value: object, key: str = "") -> Iterable[float]:
    """The payload's times in seconds (set times, the slot length), so a number said in minutes can be checked."""
    if isinstance(value, bool):
        return
    if isinstance(value, int | float) and key in TIME_KEYS:
        yield float(value)
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from _times(v, k)
    elif isinstance(value, list):
        for v in value:
            yield from _times(v, key)


def _forms(x: float) -> set[str]:
    forms = {f"{x:.1f}", f"{x:.0f}", f"{x:g}", clock(x)}
    if x == int(x):
        forms.add(str(int(x)))
    return forms


@dataclass
class Allowed:
    """What the MC may say: every exact number form the payload supports (`forms`, digits as the screen writes
    them), and the measured values an honest hedged rounding may come from (`values`)."""

    forms: set[str] = field(default_factory=set)
    values: set[float] = field(default_factory=set)

    def __contains__(self, form: str) -> bool:
        return form in self.forms

    def exact(self, n: Said) -> bool:
        if n.value is None:
            return n.text in self.forms
        return n.text in self.forms or f"{n.value:g}" in self.forms

    def rounds(self, n: Said) -> bool:
        return n.value is not None and n.hedge is not None and any(
            rounds(n.value, x, n.hedge, n.close) for x in self.values
        )

    def near(self, n: Said, other: bool = False) -> float | None:
        """The measured value `n` was cut from ("fourteen" for 14.7): one that a directional hedge would round to n.
        `other` skips a value equal to n (for "nearly five" when five is some other count)."""
        if n.value is None:
            return None
        for x in sorted(self.values, key=lambda x: abs(x - n.value)):
            if other and math.isclose(x, n.value):
                continue
            if rounds(n.value, x, "above") or rounds(n.value, x, "below"):
                return x
        return None

    def ok(self, n: Said) -> bool:
        """An unhedged or "about" number: any exact form (as the screen's digits always were). "Nearly" and "just
        over" also claim a direction, so they need a house number, a measured value as it is, or a rounding that
        points the right way: the screen's rounded forms ("15" for 14.7) would let "just over fifteen" through."""
        if n.close and n.value is not None:
            # "Nearly X" says the set came close to X from below: only a measured number that rounds to X that way
            # makes it true (a house number or the measured number itself does not).
            return self.rounds(n)
        if n.hedge in ("below", "above") and n.value is not None:
            return f"{n.value:g}" in HOUSE_NUMBERS or n.value in self.values or self.rounds(n)
        return self.exact(n) or self.rounds(n)


def allowed_numbers(payload: dict, cards: list[Scorecard], extra: Iterable[float] = ()) -> Allowed:
    """Every number form the payload supports, plus simple derived ones (misses, landed %, off-tune %), and times
    in minutes (exact forms only for whole and half minutes; any of them may be rounded with a hedge)."""
    values = set(_numbers(payload)) | set(extra)
    for sc in cards:
        values.add(max(sc.candidates - sc.landed, 0))
        if sc.candidates:
            values.add(round(100 * sc.landed / sc.candidates))
        if sc.in_tune_pct is not None:
            values.add(100 - round(sc.in_tune_pct))
    lpms = [sc.landed_per_min for sc in cards]
    values.update(round(abs(a - b), 1) for a in lpms for b in lpms)
    minutes = {t / 60 for t in _times(payload)}
    out = Allowed(forms=set(HOUSE_NUMBERS), values=values | minutes)
    for v in values | {m for m in minutes if (m * 2) == int(m * 2)}:
        out.forms |= _forms(v)
    return out


def check_numbers(texts: Iterable[str], allowed: Allowed) -> None:
    for text in texts:
        for n in numbers_in(text):
            if allowed.ok(n):
                continue
            if n.hedge and n.value is not None:
                if n.close:
                    near = allowed.near(n, other=True)
                    if near is not None:
                        raise Rejected(
                            f"it says {n.text!r} with a hedge, but no measured number rounds to {n.value:g} that way "
                            f"(the measured one is {near:g}): 'nearly' needs the measured number just below the one "
                            "said and 'just over' just above it, at its nearest rounding (4.1 is 'just over four', "
                            "never 'nearly four and a half'); use the facts' 'said aloud' form"
                        )
                raise Rejected(
                    f"it says {n.text!r} with a hedge, but no measured number rounds to {n.value:g}; round only a "
                    "number the facts give, to the nearest whole number (or five or ten for big ones)"
                )
            if n.value is not None and allowed.rounds(Said(n.text, n.value, "either")):
                raise Rejected(
                    f"it says {n.text!r}, a rounded number, as if it were exact; say 'about' or 'nearly' before it, "
                    "or quote the measured number"
                )
            near = allowed.near(n)
            if near is not None:
                raise Rejected(
                    f"it says {n.text!r}, but the measured number is {near:g}; say it with a hedge that points the "
                    "right way ('nearly' rounds up, 'just over' rounds down) or quote it exactly"
                )
            raise Rejected(f"it quotes {n.text!r}, a number the payload does not contain; quote only measured numbers")


SPOKEN_CLOCK = re.compile(r"\b\d+:\d{2}\b")
SPOKEN_DECIMAL = re.compile(r"\d\.\d")
SPOKEN_SHORT = re.compile(r"\bwpm\b|\blpm\b|\d\s?(?:s|secs?|mins?)\b", re.I)


def check_spoken(spoken: str) -> None:
    """`spoken` is heard once, not read: no clock times, decimals in digits or unit abbreviations, which a voice
    reads out like a spreadsheet ("one point two landed a minute at zero colon eighteen")."""
    for pattern, what in ((SPOKEN_CLOCK, "a clock time"), (SPOKEN_DECIMAL, "a decimal"), (SPOKEN_SHORT, "an abbreviation")):
        m = pattern.search(spoken)
        if m:
            raise Rejected(
                f"spoken is read aloud, and it has {what} ({m.group(0)!r}); write numbers in words and round them "
                "with 'about' or 'nearly' (\"nearly fifteen seconds\"), say when it happened in words (\"right after "
                "your first laugh\", \"about twenty seconds in\"), and spell units out"
            )


def check_comparatives(texts: Iterable[str], trend: bool) -> None:
    """'best', 'worst', 'ever', 'yet', 'than last' compare with past sets: only allowed when the facts carry a
    trend. 'Not yet' (readiness, not a comparison) is fine."""
    if trend:
        return
    for text in texts:
        for m in COMPARATIVE.finditer(text):
            if m.group(1).lower() == "yet" and NEGATION.search(text[max(0, m.start() - 40) : m.start()]):
                continue
            raise Rejected(
                f"it says {m.group(0)!r}, a comparison with past sets, but the facts give no trend; compare nothing, "
                "and say 'longest' or 'strongest' for this set's own extremes"
            )


# --- what the words claim was in the set ----------------------------------------------------------------------

# Each content pattern as the MC might name it, and the features that make naming it true (packages/crowd
# content.ts). Only the pattern's own name or its plain synonyms: everyday words ("turn", "question", "range") are
# left out, so ordinary sentences are never taken for claims.
PATTERN_WORDS: tuple[tuple[re.Pattern, frozenset[str], str], ...] = tuple(
    (re.compile(rx, re.I), frozenset(fs), name) for rx, fs, name in (
        (r"\bcall-?backs?\b", {"callback"}, "callbacks"),
        (r"\bword-?play\b|\bpuns?\b|\bpunning\b|\bdouble meanings?\b|\bdouble entendres?\b", {"wordplay"}, "wordplay"),
        (r"\btriads?\b|\blists? of three\b|\brule of three\b|\bthree-part lists?\b|\btricolons?\b", {"triad"}, "triads"),
        (r"\breversals?\b|\bmisdirection\b", {"reversal"}, "reversals"),
        (r"\btags?\b|\btag-?lines?\b", {"tag"}, "tags"),
        (r"\bspecific details?\b|\bspecifics\b", {"specific"}, "specific details"),
        (r"\bend[- ]rhymes?\b", {"endRhyme"}, "end rhymes"),
        (r"\binternal rhymes?\b", {"internalRhyme"}, "internal rhymes"),
        (r"\brhym(?:e|es|ed|ing)\b", {"endRhyme", "internalRhyme", "rhymedEnds"}, "rhymes"),
        (r"\balliterat\w*", {"alliteration"}, "alliteration"),
        (r"\bmet(?:er|re)\b|\biambic\b", {"meter"}, "steady meter"),
        (r"\banaphora\b|\brepeated openings?\b|\brepeated openers?\b", {"anaphora"}, "repeated openings"),
        (r"\bvoltas?\b", {"volta"}, "a turn (volta)"),
        (r"(?<!\bin )\bcontrasts?\b|\bantithes[ie]s\b", {"contrast"}, "contrasts"),
        (r"\brhetorical questions?\b", {"question"}, "questions"),
        (r"\bcalls? to action\b", {"callToAction"}, "calls to action"),
        (r"\bquotable\b|\bshort lines? after (?:a )?long(?:er)? ones?\b", {"quotable"}, "short lines after long ones"),
        (r"\bheld notes?\b|\bheld (?:a|the|one) note\b", {"heldNote", "longestHold"}, "held notes"),
        (r"\bheld endings?\b|\bend(?:ed|ing)? on a held note\b", {"finalNote"}, "held endings"),
        (r"\bwide[- ]range\b|\bvocal range\b", {"range", "rangeSemitones"}, "range"),
    )
)
# A clause that says the pattern was absent ("no wordplay", "not a callback in sight", "without a tag").
NEGATED = re.compile(r"\b(?:no|not|never|without|zero|none|nothing|nor|lacked|missing)\b|n't\b", re.I)
CLAUSE_END = re.compile(r"[.;:!?,(—–]|\bbut\b|\band\b|\bthough\b", re.I)
# Advice in the fix ("add a callback to the landlord line", "try a tag") is not a claim about the set.
ADVICE = re.compile(r"\b(?:add|try|write|work in|use|build|give it|aim for|plant|end on|go for|find)\b", re.I)


def _clause_before(text: str, start: int) -> str:
    """The words of the clause leading up to `start` (back to the last comma, full stop, 'but' or 'and')."""
    head = text[max(0, start - 60) : start]
    ends = list(CLAUSE_END.finditer(head))
    return head[ends[-1].end() :] if ends else head


def counted_features(cards: Iterable[Scorecard | None], reactions: Iterable[object] = ()) -> set[str]:
    """Every pattern the payload counted above zero, on this set or a past one, plus the pitch measures that name a
    held note or range (`longestHold`, `rangeSemitones`) and poetry's rhymed line ends (`rhymedEnds`)."""
    found: set[str] = set()
    for sc in cards:
        if sc is None:
            continue
        if sc.longest_hold_sec:
            found.add("longestHold")
        c = sc.content
        if c is None:
            continue
        found |= {f for f, n in c.features.items() if n > 0}
        if c.rhymed_ends is not None and c.rhymed_ends.rhymed > 0:
            found.add("rhymedEnds")
        if c.range_semitones is not None:
            found.add("rangeSemitones")
    for r in reactions:
        found |= set(getattr(r, "features", None) or [])
    return found


def check_patterns(texts: Iterable[tuple[str, str]], counted: set[str]) -> None:
    """Reject a content pattern named in the MC's words that the payload never counted. `texts` are (field, text);
    in `fix`, a pattern offered as something to try is advice, not a claim. A negated mention ("no wordplay") is a
    true statement about the set and passes."""
    for field_name, text in texts:
        for rx, licensed, name in PATTERN_WORDS:
            for m in rx.finditer(text):
                if licensed & counted:
                    continue
                clause = _clause_before(text, m.start())
                if NEGATED.search(clause) or (field_name == "fix" and ADVICE.search(clause)):
                    continue
                found = sorted(counted - {"longestHold", "rangeSemitones", "rhymedEnds"})
                listed = ", ".join(found) if found else "none"
                raise Rejected(
                    f"{field_name} names {m.group(0)!r}, but no {name} were counted in this set (the counted patterns: "
                    f"{listed}); name only patterns the facts count above zero"
                )


# A move to another room, in the MC's words, and the way it points.
# Only phrases about rooms: "next level", "the gap should go down to two seconds" or "you warmed the room up" are not
# moves.
ROOM = r"(?:room|tier|venue|house)"
MOVES = re.compile(
    rf"\bnext {ROOM}(?:\s+(?:up|down))?\b"
    rf"|\b(?:a|one)\s+{ROOM}\s+(?:up|down)\b"
    rf"|\b(?:move|step|go|moving|stepping|going|head|heading)\s+(?:up|down)"
    rf"(?=\s+(?:a|one)\s+(?:{ROOM}|notch|rung)\b|\s+to\s+(?:the\s+)?(?:open mic|comedy club|club|theatre|arena)\b|\s*[.!;,]|\s*$)"
    rf"|\b(?:bigger|tougher|harder|smaller|easier|softer|gentler)\s+{ROOM}\b",
    re.I,
)
DOWNWARD = re.compile(r"\b(?:down|smaller|easier|softer|gentler)\b", re.I)
HOLD_OFF = re.compile(r"\b(?:no|not|never|before|until|yet)\b|n't\b", re.I)


def check_moves(texts: Iterable[tuple[str, str]], nxt: str, venue: str) -> None:
    """Reject a room move in the words that contradicts `next`: up when it says 'again' or 'down' (and anything above
    the Arena), down when it says 'again' or 'up'. "Not the next room yet" holds off a move and passes."""
    for field_name, text in texts:
        for m in MOVES.finditer(text):
            way = "down" if DOWNWARD.search(m.group(0)) else "up"
            if HOLD_OFF.search(_clause_before(text, m.start())):
                continue
            if way == "up" and venue == "arena":
                raise Rejected(
                    f"{field_name} says {m.group(0)!r}, but the Arena is the top room and nothing is above it; say go "
                    "again here"
                )
            if way != nxt:
                said = {"again": "go again at this house", "up": "go up a room", "down": "go down a room"}[nxt]
                raise Rejected(
                    f"{field_name} says {m.group(0)!r}, but next is {nxt!r}: {said}, and suggest no other room move"
                )


def check_note(out: Debrief, req: DebriefRequest) -> McNoteDraft:
    """Every check runs, and a rejection carries every reason at once, so the one retry can fix all of them."""
    cards = [req.scorecard, *(r.scorecard for r in req.history)]
    headline, line, fix = clean(out.headline, 60), clean(out.line, 180), clean(out.fix, 220)
    spoken = clean(out.spoken, DEBRIEF_SPOKEN_MAX, sentences=DEBRIEF_SPOKEN_SENTENCES)
    sc = req.scorecard
    rule = next_venue(sc, req.venue)
    worked = reaction_features(req.reactions).values()  # "two of your laughs came on callbacks"
    fields = [("headline", headline), ("line", line), ("fix", fix), ("spoken", spoken)]
    reactions = [*req.reactions, *(r for rec in req.history for r in rec.reactions)]

    def words_off() -> None:
        if not sc.words_on and sc.act != "singing" and not NOT_MEASURED.search(f"{line} {fix}"):
            raise Rejected("words were off, and the line must say that pace and fillers were not measured")

    def next_rule() -> None:
        if out.next == "up" and req.venue == "arena":
            raise Rejected("next is 'up', but nothing is above the Arena; next is 'again' there")
        if out.next != rule and "my call" not in line.lower():
            raise Rejected(
                f"next is {out.next!r} but the house rule gives {rule!r}; use it, or say 'my call' and why in line"
            )

    checks = (
        lambda: check_spoken(spoken),
        lambda: check_numbers([headline, line, spoken], allowed_numbers(req.model_dump(), cards, worked)),
        lambda: check_comparatives([headline, line, fix, spoken], bool(history_parts(sc, req.history))),
        words_off,
        next_rule,
        lambda: check_patterns(fields, counted_features(cards, reactions)),
        lambda: check_moves(fields, out.next, req.venue),
    )
    reasons = []
    for check in checks:
        try:
            check()
        except Rejected as err:
            reasons.append(str(err))
    if reasons:
        raise Rejected(reasons[0] if len(reasons) == 1 else "; and ".join(f"({i}) {r}" for i, r in enumerate(reasons, 1)))
    return McNoteDraft(headline=headline, line=line, fix=fix, spoken=spoken, next=out.next)


def check_reply(out: GreenRoomReply, req: ChatRequest) -> McReplyDraft:
    cards = ([req.last_scorecard] if req.last_scorecard else []) + [r.scorecard for r in req.history]
    text, spoken = clean(out.text, 280), clean(out.spoken, 320, sentences=SPOKEN_SENTENCES)
    check_spoken(spoken)
    check_numbers([text, spoken], allowed_numbers(req.model_dump(), cards))
    last = cards[0] if cards else None
    earlier = req.history if req.last_scorecard else req.history[:-1]
    check_comparatives([text, spoken], bool(last and history_parts(last, earlier)))
    if SINGLE_UNIT.search(req.question) and not SCOPE_SAID.search(text):
        raise Rejected(
            "the question is about a single bit or line, which you were not given numbers for; say so plainly first, "
            "then answer with the whole-set numbers"
        )
    if last and not last.words_on and last.act != "singing" and ASKS_PACE_OR_FILLERS.search(req.question):
        if not NOT_MEASURED.search(text):
            raise Rejected("words were off, so the answer must say pace and fillers were not measured")
    reactions = [r for rec in req.history for r in rec.reactions]
    check_patterns([("text", text), ("spoken", spoken)], counted_features(cards, reactions))
    return McReplyDraft(text=text, spoken=spoken)


CLOCK = re.compile(r"\b\d+:\d{2}\b")


def check_line(out: MomentLine, req: McLineRequest) -> McLineDraft:
    text = clean(out.text, INTRO_MAX, sentences=INTRO_SENTENCES) if req.moment == "intro" else clean(out.text, 120)
    if CLOCK.search(text):
        raise Rejected(f"a title card carries no clock times ({CLOCK.search(text).group(0)}); the facts give no time for anything")
    cards = [r.scorecard for r in req.history]
    f = req.facts
    extra = [req.duration_sec / 60, max(f.candidates - f.landed, 0)]
    check_numbers([text], allowed_numbers(req.model_dump(), cards, extra))
    check_comparatives([text], trend=False)  # a card's facts carry no trend
    # A card's facts carry no patterns: naming one claims what nobody told the MC (past sets' counts excepted).
    check_patterns([("the card", text)], counted_features(cards, [r for rec in req.history for r in rec.reactions]))
    if not text:
        raise Rejected("the line is empty")
    return McLineDraft(text=text)
