"""Measured analysis the MC's prompt is given. Nothing here is ever shown or spoken: every MC word is the
model's (honesty rule 5). These functions turn the payload into plain facts, with the arithmetic done
(m:ss times, the biggest problem, the next-venue rule, the trend over past sets, and the honest spoken
rounding of each number, "nearly fifteen seconds" for 14.7), so the model quotes numbers instead of
computing them. `rounds` is the rule the guard checks spoken roundings with.
"""

from __future__ import annotations

import math
from typing import Literal

from .models import Line, McLineRequest, MomentFacts, NextVenue, Reaction, Scorecard, SetRecord, VenueId
from .personas import ACTS, house, tier, venue_above

Problem = Literal["dead_air", "pace", "fillers", "landing", "tune", "none"]

DEAD_AIR_S = 4.0
PEAK_WPM = 185
FILLERS = 5
LANDING_RATIO = 0.4
IN_TUNE_PCT = 60
UP_LPM = 3.0
DOWN_LPM = 1.0
POSITIVE = {"laugh", "snap", "applause", "cheer"}


def diagnose(sc: Scorecard) -> Problem:
    """The biggest measured problem, in the order the product ranks them."""
    if sc.longest_dead_air_sec >= DEAD_AIR_S:
        return "dead_air"
    if sc.peak_wpm is not None and sc.peak_wpm >= PEAK_WPM:
        return "pace"
    if sc.fillers is not None and sc.fillers.count >= FILLERS:
        return "fillers"
    if sc.candidates == 0 or sc.landed / sc.candidates < LANDING_RATIO:
        return "landing"
    if sc.in_tune_pct is not None and sc.in_tune_pct < IN_TUNE_PCT:
        return "tune"
    return "none"


def next_venue(sc: Scorecard, venue: VenueId) -> NextVenue:
    """up: >= 3 landed a minute and no gap of 4 s (nothing above the Arena); down: < 1 a minute above Open Mic."""
    if sc.landed_per_min >= UP_LPM and sc.longest_dead_air_sec < DEAD_AIR_S:
        return "up" if venue_above(venue) else "again"
    if sc.landed_per_min < DOWN_LPM and venue != "openmic":
        return "down"
    return "again"


def clock(t: float | None) -> str:
    if t is None:
        return "mid-set"
    m, s = divmod(int(round(t)), 60)
    return f"{m}:{s:02d}"


# --- numbers said out loud -------------------------------------------------------------------------------


def rounds(n: float, x: float, hedge: str) -> bool:
    """Whether `n`, said with a hedge, is an honest spoken rounding of the measured `x`: x rounded to one or two
    significant figures, or to the nearest whole number or half; "nearly" and "just under" ("below") may also round
    up and "just over" ("above") down, and each must point the right way. It stays within 15% of x, or half a unit
    for x of one or more (so 1.2 is "about one"), and nothing is ever rounded to or from zero."""
    if x <= 0 or n <= 0:
        return False
    if (hedge == "below" and x > n) or (hedge == "above" and x < n):
        return False
    if abs(n - x) > max(0.5 if x >= 1 else 0.0, 0.15 * x):
        return False
    e = math.floor(math.log10(x))
    steps = {0.5, 1.0, 10.0**e, 10.0 ** (e - 1)}
    ops = [lambda v: math.floor(v + 0.5)]
    if hedge == "below":
        ops.append(math.ceil)
    elif hedge == "above":
        ops.append(math.floor)
    return any(math.isclose(op(x / q) * q, n, rel_tol=1e-9, abs_tol=1e-9) for q in steps for op in ops)


_UNITS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
          "seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def in_words(n: int) -> str:
    """172 -> 'a hundred and seventy-two' (whole numbers under a million)."""
    if n < 20:
        return _UNITS[n]
    if n < 100:
        t, u = divmod(n, 10)
        return _TENS[t] + (f"-{_UNITS[u]}" if u else "")
    if n < 1000:
        h, r = divmod(n, 100)
        return ("a hundred" if h == 1 else f"{_UNITS[h]} hundred") + (f" and {in_words(r)}" if r else "")
    k, r = divmod(n, 1000)
    return ("a thousand" if k == 1 else f"{in_words(k)} thousand") + ((" and " if r < 100 else " ") + in_words(r) if r else "")


def say_number(x: float) -> str:
    """A measured number as it is said out loud, with the hedge that keeps it honest: 14.7 -> 'nearly fifteen',
    1.2 -> 'just over one', 2.5 -> 'two and a half', 0.4 -> 'less than one', 172 -> 'a hundred and seventy-two'."""
    if x == int(x):
        return in_words(int(x))
    if x < 1:
        return "less than one"
    if x * 2 == int(x * 2):
        return f"{in_words(int(x))} and a half"
    n = math.floor(x + 0.5)
    return f"{'nearly' if n > x else 'just over'} {in_words(n)}"


def say_seconds(x: float) -> str:
    """14.7 -> 'nearly fifteen seconds', 1.2 -> 'just over one second', 0.4 -> 'less than a second'."""
    if x < 1:
        return "less than a second"
    return f"{say_number(x)} second{'' if math.floor(x + 0.5) == 1 else 's'}"


def say_at(t: float | None) -> str | None:
    """When something happened, said out loud: 18.2 -> 'about twenty seconds in', 125 -> 'about two minutes in'."""
    if t is None:
        return None
    if t < 1:
        return "right at the start"
    if t < 60:
        n = next((n for n in (math.floor(t / 5 + 0.5) * 5, math.floor(t + 0.5)) if rounds(n, t, "either")), t)
        said = f"{in_words(int(n))} second{'' if n == 1 else 's'} in"
        return said if n == t else f"about {said}"
    m = t / 60
    n = math.floor(m * 2 + 0.5) / 2
    said = in_words(int(n)) + (" and a half" if n != int(n) else "")
    unit = "minute" if n == 1 else "minutes"
    return f"{said} {unit} in" if n == m else f"about {said} {unit} in"


def slot(seconds: float) -> str:
    m, s = divmod(int(round(seconds)), 60)
    mins = f"{m} minute{'s' if m != 1 else ''}" if m else ""
    secs = f"{s} seconds" if s else ""
    return " ".join(x for x in (mins, secs) if x) or "0 seconds"


def same_performer(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


def own_history(history: list[SetRecord], performer: str) -> list[SetRecord]:
    """Only the performer's own past sets (the TV filters too): the MC never credits one performer's numbers to the
    next one at the mic."""
    return [r for r in history if same_performer(r.performer, performer)]


def best_moment(record: SetRecord) -> str | None:
    """'your best laugh last time came at 0:41 (the landlord line)', from the record's strongest reaction."""
    best = max((r for r in record.reactions if r.kind in POSITIVE), key=lambda r: r.strength, default=None)
    if best is None:
        return None
    phrase = f"your best {ACTS[record.act].noun} last time came at {clock(best.at)}"
    return f"{phrase} (the '{best.word}' line)" if best.word else phrase


def history_parts(current: Scorecard, history: list[SetRecord]) -> list[str]:
    """What at least two past sets say: the trend, a repeat filler, the best venue, last set's best moment."""
    if len(history) < 2:
        return []
    unit = ACTS[current.act].unit
    prev, cur = history[-1].scorecard.landed_per_min, current.landed_per_min
    if cur > prev + 0.05:
        parts = [f"up from {prev:.1f} landed a minute last {unit}"]
    elif cur < prev - 0.05:
        parts = [f"down from {prev:.1f} landed a minute last {unit}"]
    else:
        parts = [f"level with last {unit} at {prev:.1f} landed a minute"]
    tops = [r.scorecard.fillers.top[0].word for r in history if r.scorecard.fillers and r.scorecard.fillers.top]
    if current.fillers and current.fillers.top and current.fillers.top[0].word in tops:
        parts.append(f"'{current.fillers.top[0].word}' was the top filler before too")
    best = max(history, key=lambda r: r.scorecard.landed_per_min)
    if best.scorecard.landed_per_min > cur:
        parts.append(f"the best so far is {best.scorecard.landed_per_min:.1f} landed a minute at {house(best.act, best.venue)}")
    moment = best_moment(history[-1])
    if moment:
        parts.append(moment)
    return parts


PROBLEM_WORDS: dict[Problem, str] = {
    "dead_air": "dead air (the longest gap)",
    "pace": "pace (the peak words per minute)",
    "fillers": "fillers (the top filler word)",
    "landing": "lines not landing (no beat left after them)",
    "tune": "holding notes in tune",
    "none": "nothing: praise it and suggest the next room up",
}


# How each content pattern is named to the MC (singular, plural); packages/crowd FEATURE_NAMES says the same.
FEATURE_NAMES: dict[str, tuple[str, str]] = {
    "callback": ("callback", "callbacks"), "wordplay": ("wordplay", "wordplay"), "triad": ("triad", "triads"),
    "reversal": ("reversal", "reversals"), "tag": ("tag", "tags"), "specific": ("specific detail", "specific details"),
    "endRhyme": ("end rhyme", "end rhymes"), "internalRhyme": ("internal rhyme", "internal rhymes"),
    "alliteration": ("alliteration", "alliterations"), "meter": ("steady-meter line", "steady-meter lines"),
    "anaphora": ("repeated opening", "repeated openings"), "volta": ("turn", "turns"),
    "contrast": ("contrast", "contrasts"), "question": ("question", "questions"),
    "callToAction": ("call to action", "calls to action"),
    "quotable": ("short line after a long one", "short lines after long ones"),
    "heldNote": ("held note", "held notes"), "finalNote": ("held ending", "held endings"),
    "range": ("wide-range phrase", "wide-range phrases"),
}


def feature_count(feature: str, n: int) -> str:
    one, many = FEATURE_NAMES.get(feature, (feature, feature))
    return f"{n} {one if n == 1 else many}"


def reaction_features(reactions: list[Reaction]) -> dict[str, int]:
    """How many of the room's positive reactions came on a line with each pattern, plus "none" for lines without one:
    the numbers behind "which kinds of lines worked" (the guard allows them as derived counts)."""
    out: dict[str, int] = {}
    for r in reactions:
        if r.kind not in POSITIVE:
            continue
        for f in r.features or ["none"]:
            out[f] = out.get(f, 0) + 1
    return out


def moments(reactions: list[Reaction], lines: list[Line]) -> str:
    """The room's moments with times in m:ss. A reaction follows its line by about half a second, so each is
    matched to the last line that ended within 3 s before it (the contract's lines carry no id). A line's content
    patterns follow it ("a callback"), and the MC model's estimate is named as one, never as a measurement."""
    lines = sorted(lines, key=lambda ln: ln.t)
    out = []
    for r in reactions[:12]:
        before = [ln for ln in lines if ln.t <= r.at and r.at - ln.t <= 3.0]
        said = f" after '{before[-1].text}'" if before and before[-1].text else ""
        kinds = ", ".join(FEATURE_NAMES.get(f, (f, f))[0] for f in r.features)
        pattern = f", on {kinds}" if kinds else ""
        estimate = ", and the MC's model rated the words above ordinary (an estimate)" if (r.judge or 0) > 0.5 else ""
        out.append(f"{r.kind} at {clock(r.at)}{said}{pattern}{estimate} (said aloud: {say_at(r.at)})")
    return "; ".join(out) or "none"


def content_facts(sc: Scorecard, reactions: list[Reaction] = ()) -> list[str]:
    """What the words (or the pitch) showed, as facts: counted patterns and which kinds of lines got the room."""
    act = ACTS[sc.act]
    c = sc.content
    if c is None:
        if sc.act == "singing":
            return []
        if not sc.words_on:
            return ["- what was said: NOT MEASURED (words were off), so the room heard timing only; never talk about the "
                    "material or which kinds of lines worked"]
        return ["- content patterns: not measured on this set; never talk about which kinds of lines worked"]
    found = sorted(((f, n) for f, n in c.features.items() if n > 0), key=lambda x: -x[1])
    missing = [FEATURE_NAMES.get(f, (f, f))[1] for f, n in c.features.items() if n == 0]
    said = ", ".join(feature_count(f, n) for f, n in found) or "none of the patterns"
    aloud = _aloud(*(f"{in_words(n)} {FEATURE_NAMES.get(f, (f, f))[n != 1]}" for f, n in found[:3]))
    unit = "phrases" if sc.act == "singing" else "lines"
    out = [f"- patterns the room listened for in the {'pitch' if sc.act == 'singing' else 'words'} "
           f"(counted over {c.lines} {unit}): {said}{aloud}"]
    if missing:
        out.append(f"- not found: {', '.join(missing)}")
    if c.rhymed_ends is not None and c.rhymed_ends.of > 0:
        out.append(f"- line ends that rhyme with one of the two before: {c.rhymed_ends.rhymed} of {c.rhymed_ends.of}")
    if c.range_semitones is not None:
        out.append(f"- range: {c.range_semitones} semitones between the lowest and highest held notes")
    worked = reaction_features(list(reactions))
    if worked:
        parts = [f"{'no pattern found' if f == 'none' else FEATURE_NAMES.get(f, (f, f))[1]}: {n}"
                 for f, n in sorted(worked.items(), key=lambda x: -x[1])]
        out.append(f"- the room's {act.plural} by the kind of {unit[:-1]} they came on: {'; '.join(parts)} (one "
                   f"{act.noun} can count under several patterns)")
    if c.judge is not None:
        out.append(
            f"- the content judge (a fast model behind the MC) read {c.judge.in_time} candidate {unit} in time to count "
            f"and missed {c.judge.missed}; its scores are estimates, an opinion of the words: never quote them as "
            "numbers or as measurements"
        )
    return out


def _aloud(*said: str | None) -> str:
    """' (said aloud: "nearly fifteen seconds", "about twenty seconds in")': the honest spoken form for `spoken`."""
    parts = [f'"{x}"' for x in said if x]
    return f" (said aloud: {', '.join(parts)})" if parts else ""


def set_facts(
    sc: Scorecard,
    history: list[SetRecord] = (),
    venue: str | None = None,
    reactions: str | None = None,
    content_reactions: list[Reaction] = (),
) -> str:
    """A finished set's measured numbers in words, including what was not measured."""
    act = ACTS[sc.act]
    out = [
        f"- landed {sc.landed} of {sc.candidates} lines at the house standard: {sc.landed_per_min:g} landed a minute"
        f" (said aloud: \"{say_number(sc.landed_per_min)} a minute\")",
        f"- the room gave {act.count(sc.room_reactions)} (the room's own count, never the score)",
        f"- longest dead air {sc.longest_dead_air_sec:g} seconds, at {clock(sc.longest_dead_air_at)}"
        + _aloud(say_seconds(sc.longest_dead_air_sec), say_at(sc.longest_dead_air_at)),
        f"- lines too quiet or short to judge: {sc.unsure} (never counted against the performer)",
    ]
    if sc.act == "singing":
        tune = f"{sc.in_tune_pct:g}% in tune" if sc.in_tune_pct is not None else "in tune: not measured"
        hold = f"longest hold {sc.longest_hold_sec:g} seconds" if sc.longest_hold_sec is not None else "hold: not measured"
        aloud = _aloud(
            f"{say_number(sc.in_tune_pct)} percent" if sc.in_tune_pct is not None else None,
            say_seconds(sc.longest_hold_sec) if sc.longest_hold_sec is not None else None,
        )
        out.append(f"- {tune}, {hold}{aloud}")
    else:
        if sc.wpm is None:
            out.append("- pace: NOT MEASURED (words were off); say it was not measured")
        else:
            peak = f", peak {sc.peak_wpm:g}" if sc.peak_wpm is not None else ""
            out.append(f"- pace {sc.wpm:g} words per minute{peak}")
        if sc.fillers is None:
            out.append("- fillers: NOT MEASURED (words were off); say they were not measured")
        else:
            top = ", ".join(f"'{f.word}' {f.n}" for f in sc.fillers.top) or "none named"
            out.append(f"- fillers {sc.fillers.count} in total; top: {top}")
        out.append("- pitch: not a singing act; do not mention it")
    out.extend(content_facts(sc, content_reactions))
    if reactions is not None:
        out.append(f"- the room's moments: {reactions}")
    out.append(f"- biggest measured problem (the fix goes here): {PROBLEM_WORDS[diagnose(sc)]}")
    out.append(f"- house rule for the next venue: {next_venue(sc, venue or sc.venue)!r}")
    parts = history_parts(sc, list(history))
    out.append(f"- from the past sets: {'; '.join(parts)}" if parts else "- past sets: fewer than two; do not mention a past")
    return "\n".join(out)


def moment_facts(req: McLineRequest) -> str:
    """What the MC may know at a moment during the set."""
    f: MomentFacts = req.facts
    act = ACTS[req.act]
    out = [
        f"- {req.performer}, {act.name.lower()}, at {house(req.act, req.venue)} ({tier(req.venue)})",
        f"- the slot is {slot(req.duration_sec)}",
    ]
    if req.moment != "intro":
        out.append(f"- the card shows now, {round(f.elapsed_sec)} seconds into the {act.unit}")
        if f.bit is not None:
            gave = f", and the room gave {act.count(f.bit_reactions)} in it" if f.bit_reactions is not None else ""
            out.append(f"- bit {f.bit} just closed{gave}")
        if f.dead_bits is not None:
            out.append(f"- {f.dead_bits} bit{'s' if f.dead_bits != 1 else ''} in a row got nothing")
        out.append(
            f"- so far: landed {f.landed} of {f.candidates} lines, the room gave {act.count(f.room_reactions)}, "
            f"longest dead air {f.longest_dead_air_sec:g} seconds (when it happened is not known)"
        )
    if req.history:
        last = req.history[-1]
        out.append(
            f"- {len(req.history)} past set{'s' if len(req.history) != 1 else ''} on record; the last one: "
            f"{last.scorecard.landed_per_min:g} landed a minute at {house(last.act, last.venue)}"
        )
    else:
        out.append("- no past sets on record: this is their first")
    return "\n".join(out)


def chat_scope(sc: Scorecard | None) -> str:
    """What the green room was not given, so the MC can say so instead of answering with something else."""
    words = "the words of any line (words were off)" if sc is not None and not sc.words_on else "the words of any line"
    return f"- not in what you were given: numbers for a single bit or a single line; {words}; how anything felt"
