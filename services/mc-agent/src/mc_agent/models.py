"""Wire contract. Mirrors `packages/crowd/src/types.ts` (Scorecard, SetRecord, McNote, McReply).

Field names are camelCase on the wire and snake_case in Python; both are accepted on input and
camelCase is produced on output. `None` means "not measured", never zero: `wpm` and `fillers`
are None when words were off, `inTunePct` and `longestHoldSec` when the act is not singing or no pitch was heard.
Keep this file in step with the TypeScript producer.
"""

import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from pydantic.alias_generators import to_camel

ActId = Literal["standup", "singing", "poetry", "speech"]
VenueId = Literal["openmic", "club", "theatre", "arena"]
PersonaId = Literal["warm", "sarcastic", "strict", "deadpan"]
ReactionKind = Literal["laugh", "snap", "applause", "cheer", "murmur", "heckle", "silence"]
NextVenue = Literal["again", "up", "down"]
Source = Literal["ai"]  # every MC word is the model's; there is no rule-based source
McMoment = Literal["intro", "between", "heckle", "end"]
# What the room listens for beyond timing (packages/crowd/src/content.ts): deterministic patterns, never opinions.
ContentFeature = Literal[
    "callback", "wordplay", "triad", "reversal", "tag", "specific", "endRhyme", "internalRhyme", "alliteration",
    "meter", "anaphora", "volta", "contrast", "question", "callToAction", "quotable", "heldNote", "finalNote", "range",
]
McUnavailableReason = Literal["timeout", "model-error", "rejected", "no-credentials", "unreachable"]


class Wire(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, validate_by_alias=True, serialize_by_alias=True
    )


class FillerStat(Wire):
    word: str
    n: int = Field(ge=0)


class Fillers(Wire):
    count: int = Field(ge=0)
    top: list[FillerStat] = Field(default_factory=list)


class RhymedEnds(Wire):
    rhymed: int = Field(ge=0)
    of: int = Field(ge=0)


class JudgeStats(Wire):
    """The MC model's estimates over the set: an opinion of the words, never a measurement."""

    in_time: int = Field(ge=0, description="Candidate lines the model judged before the room decided.")
    missed: int = Field(ge=0, description="Candidate lines decided without it (too late or unavailable).")
    early: int = Field(default=0, ge=0, description="Decided before it answered because the next line began (not late).")
    mean_score: float | None = Field(default=None, ge=0, le=1)


class ContentMeasures(Wire):
    """What the words (or, for singing, the pitch) showed across the set: counted patterns."""

    lines: int = Field(ge=0, description="Lines whose words were checked (singing: phrases).")
    features: dict[ContentFeature, int] = Field(default_factory=dict, description="Lines showing each pattern.")
    rhymed_ends: RhymedEnds | None = Field(default=None, description="Poetry only.")
    range_semitones: int | None = Field(default=None, ge=0, description="Singing only.")
    judge: JudgeStats | None = Field(default=None, description="None when the model judge was not used.")


class Scorecard(Wire):
    """The difficulty-independent ledger: everything measured, nothing judged."""

    act: ActId
    venue: VenueId
    duration_sec: float = Field(ge=0)
    landed: int = Field(ge=0, description="Lines that cleared the house standard.")
    candidates: int = Field(ge=0, description="Lines that ended with a beat.")
    landed_per_min: float = Field(ge=0)
    room_reactions: int = Field(ge=0, description="What this room gave; depends on the venue, never the score.")
    longest_dead_air_sec: float = Field(ge=0)
    longest_dead_air_at: float | None = None
    wpm: float | None = Field(default=None, description="Over spoken time; None when words were off.")
    peak_wpm: float | None = Field(default=None, description="Over any 20 s window; None when words were off.")
    fillers: Fillers | None = Field(default=None, description="None when words were off.")
    in_tune_pct: float | None = Field(
        default=None, description="Singing only; None otherwise or when no pitch was heard."
    )
    longest_hold_sec: float | None = Field(
        default=None, description="Singing only; None otherwise or when no pitch was heard (never 0 for not measured)."
    )
    unsure: int = Field(ge=0, description="Lines the detector could not judge; never counted against anyone.")
    content: ContentMeasures | None = Field(
        default=None,
        description="What the words (singing: the pitch) showed; None when not measured (words off; singing with no "
        "pitch heard) or on older records.",
    )

    @property
    def words_on(self) -> bool:
        return self.wpm is not None or self.fillers is not None

    @property
    def sung(self) -> bool:
        return self.in_tune_pct is not None


class RecordedReaction(Wire):
    """One of the room's moments, kept on a SetRecord so the MC can say "the landlord line at 0:08"."""

    kind: ReactionKind
    at: float = Field(ge=0)
    strength: float = Field(ge=0)
    line_id: int | None = None
    word: str | None = Field(default=None, description="The line's key word when words were on.")
    features: list[ContentFeature] = Field(default_factory=list, description="The line's content patterns (words on).")


class SetRecord(Wire):
    """One past set, as the TV keeps it (the MC's memory is the last six of these)."""

    set_id: str
    ended_at: str
    act: ActId
    venue: VenueId
    persona: PersonaId
    performer: str
    scorecard: Scorecard
    summary: str = ""
    # Records from before this field was added lack it.
    reactions: list[RecordedReaction] = Field(default_factory=list)


class Line(Wire):
    t: float = Field(ge=0)
    landed: bool
    text: str | None = None


class Reaction(Wire):
    kind: ReactionKind
    at: float = Field(ge=0)
    strength: float = Field(ge=0)
    why: str
    line_id: int | None = None
    text: str | None = None
    features: list[ContentFeature] = Field(default_factory=list, description="The line's content patterns, strongest first.")
    judge: float | None = Field(default=None, ge=0, le=1, description="The MC model's estimate for the line, if in time.")


class DebriefRequest(Wire):
    kind: Literal["debrief"]
    persona: PersonaId
    performer: str
    act: ActId
    venue: VenueId
    scorecard: Scorecard
    lines: list[Line] = Field(default_factory=list)
    reactions: list[Reaction] = Field(default_factory=list)
    history: list[SetRecord] = Field(default_factory=list, max_length=6, description="Past sets, newest last.")
    speak: bool = Field(default=False, description="Also return the MC's voice (Amazon Polly).")


class ChatRequest(Wire):
    kind: Literal["chat"]
    persona: PersonaId
    performer: str
    question: str = Field(min_length=1, max_length=1000)
    history: list[SetRecord] = Field(default_factory=list, max_length=6)
    last_scorecard: Scorecard | None = None
    speak: bool = False


class MomentFacts(Wire):
    """What the MC may know at a moment during the set: measured facts only."""

    at: float = Field(ge=0, description="Seconds since t = 0 (0 for the intro).")
    bit: int | None = Field(default=None, ge=1, description="1-based number of the bit that just closed.")
    bit_reactions: int | None = Field(default=None, ge=0, description="Positive reactions in that bit (between).")
    dead_bits: int | None = Field(default=None, ge=0, description="Bits in a row that got nothing (heckle).")
    landed: int = Field(ge=0)
    candidates: int = Field(ge=0)
    room_reactions: int = Field(ge=0)
    longest_dead_air_sec: float = Field(ge=0)
    elapsed_sec: float = Field(ge=0)


class McLineRequest(Wire):
    """POST /invocations with kind 'line': the words for one moment's title card."""

    kind: Literal["line"]
    moment: McMoment
    persona: PersonaId
    performer: str
    act: ActId
    venue: VenueId
    duration_sec: float = Field(gt=0)
    facts: MomentFacts
    history: list[SetRecord] = Field(default_factory=list, max_length=6)
    speak: bool = False


JudgeAct = Literal["standup", "poetry", "speech"]


class JudgeRequest(Wire):
    """POST /invocations with kind 'judge': one model estimate of a line's words (words on only; never singing)."""

    kind: Literal["judge"]
    act: JudgeAct
    line_id: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=400, description="The line as the phone's recogniser heard it.")
    context: list[str] = Field(
        default_factory=list, max_length=4, description="Earlier lines of the set, oldest first (the setup)."
    )


class JudgeVerdict(Wire):
    """The judge's estimate for one line. An opinion of the words, never a measurement; the screen says so."""

    line_id: int = Field(ge=1)
    act: JudgeAct
    score: float = Field(
        ge=0, le=1,
        description="Stand-up: a percentile among held-out Reddit jokes (0.7 humour model + 0.3 LLM). Poetry and "
        "speech: the rubric's weighted mean of `dims`. The engine weighs it above the act's floor.",
    )
    dims: dict[str, float] = Field(
        description="standup punch, surprise (+ humor when the humour model answered); poetry imagery, sound, turn; "
        "speech point, rhetoric, call."
    )
    reason: str | None = Field(default=None, max_length=60, description="A few of the model's words, no numbers.")
    model: str
    ms: int = Field(ge=0, description="How long the judge took on the service.")
    source: Source


McRequest = Annotated[DebriefRequest | ChatRequest | McLineRequest | JudgeRequest, Field(discriminator="kind")]
_REQUEST = TypeAdapter(McRequest)


def parse_request(payload: object) -> DebriefRequest | ChatRequest | McLineRequest | JudgeRequest:
    """Validate an /invocations payload; raises pydantic.ValidationError."""
    return _REQUEST.validate_python(payload)


def error_detail(err: ValidationError) -> list:
    """`err.errors()` can carry raw exceptions in `ctx`; `err.json()` renders them safely."""
    return json.loads(err.json(include_url=False))


PollyEngine = Literal["neural", "generative", "long-form"]


class McAudio(Wire):
    """The MC's voice: Amazon Polly reading the spoken text (or a line's text) in the persona's voice. The TV streams
    it from Polly: `url` is a presigned SynthesizeSpeech GET (HTTPS, valid 600 s), never logged."""

    format: Literal["mp3"]
    url: str
    fallback_url: str | None = Field(
        default=None, description="The same words on the neural engine, when `url` is a premium engine."
    )
    voice: str
    engine: PollyEngine


class McNoteDraft(Wire):
    """The guard-checked note (the model's words, trimmed); `McNote` adds the source."""

    headline: str = Field(max_length=60, description="The verdict in the MC's voice.")
    line: str = Field(max_length=180, description="The in-character line, quoting the measured numbers.")
    fix: str = Field(max_length=220, description="The one thing to fix: concrete and measurable.")
    spoken: str = Field(max_length=320, description="Said out loud: up to four short sentences written for the ear.")
    next: NextVenue


class McNote(McNoteDraft):
    source: Source
    audio: McAudio | None = None


class McReplyDraft(Wire):
    text: str = Field(max_length=280, description="The answer, in character.")
    spoken: str = Field(max_length=320, description="Said out loud: up to four short sentences written for the ear.")


class McReply(McReplyDraft):
    source: Source
    audio: McAudio | None = None


# What the model fills in (the structured-output tool's schema). The hard limits are stated in the
# descriptions but enforced loosely here, so an overrun is trimmed by `guard.py` instead of costing a
# retry cycle against the 8 s budget; the wire models above stay strict.


class Debrief(Wire):
    """The MC's note on the cut sheet after a set. Call this exactly once with the finished note."""

    headline: str = Field(max_length=120, description="The verdict in your voice. At most 60 characters.")
    line: str = Field(
        max_length=360, description="Your in-character line, quoting the measured numbers. At most 180 characters."
    )
    fix: str = Field(max_length=440, description="The one thing to fix, concrete and measurable. At most 200 characters.")
    spoken: str = Field(
        max_length=640,
        description=(
            "What you say out loud, written for the ear: up to three short sentences (about ten seconds), numbers in "
            "words and rounded with 'about' or 'nearly', no digits, clock times, symbols or abbreviations. At most 180 "
            "characters."
        ),
    )
    next: NextVenue = Field(description="again, up or down: the house rule's value unless `line` says 'my call' and why.")


class GreenRoomReply(Wire):
    """The MC's answer in the green room. Call this exactly once with the finished answer."""

    text: str = Field(max_length=560, description="Your answer, in character. At most 260 characters.")
    spoken: str = Field(
        max_length=640,
        description=(
            "What you say out loud, written for the ear: up to four short sentences, numbers in words and rounded "
            "with 'about' or 'nearly', no digits, clock times, symbols or abbreviations. At most 300 characters."
        ),
    )


class MomentLine(Wire):
    """The MC's words for one title card during the set. Call this exactly once with the finished line."""

    text: str = Field(max_length=240, description="One short line in your voice. At most 110 characters.")


class McLineDraft(Wire):
    text: str = Field(max_length=120)


class McLine(McLineDraft):
    source: Source
    audio: McAudio | None = None


class McUnavailable(Wire):
    """Why the MC could not answer; the screen says so in plain words instead of showing a substitute line."""

    reason: McUnavailableReason
    detail: str | None = None
