"""The Android TV emulator QA pass of 2026-10-12 (docs/android-emu/qa-2026-10-12/qa-report.md), issues 3, 4, 5 and 6,
with the words the MC actually wrote that day: the guard rejects unmeasured pattern names, room moves against `next`
and hedges that round the wrong way; the prompt states the words-off sentence and the house rule's direction first."""

import pytest

from mc_agent.facts import debrief_checklist, next_venue, rounds, set_facts
from mc_agent.guard import Rejected, check_line, check_note, check_reply
from mc_agent.models import ChatRequest, Debrief, DebriefRequest, GreenRoomReply, MomentLine
from mc_agent.personas import RULES
from payloads import debrief_payload, debrief_req, line_req, record


def arena_set() -> DebriefRequest:
    """QA set 2 (18-s2-cut.jpg): stand-up at The Bowl, Arena, deadpan; 4 of 4 landed, 4.4 a minute, 2.8 s of dead air
    at 0:52, 157 wpm (peak 166), no fillers; the words showed 6 specific details, 2 tags and 1 callback, no wordplay."""
    p = debrief_payload(persona="deadpan", venue="arena", durationSec=54.6, landed=4, candidates=4, landedPerMin=4.4,
                        roomReactions=4, longestDeadAirSec=2.8, longestDeadAirAt=52, wpm=157, peakWpm=166,
                        fillers={"count": 0, "top": []},
                        content={"lines": 10, "features": {"callback": 1, "wordplay": 0, "triad": 0, "reversal": 0,
                                                           "tag": 2, "specific": 6},
                                 "judge": {"inTime": 4, "missed": 0}})
    p["reactions"] = [{"kind": "laugh", "at": 21.0, "strength": 0.6, "why": "a tag", "features": ["tag", "specific"]},
                      {"kind": "laugh", "at": 40.1, "strength": 0.8, "why": "a callback", "features": ["callback"]}]
    return DebriefRequest.model_validate(p)


def keynote_set() -> DebriefRequest:
    """QA set 6 (25-sp-cut.jpg): speech at The Keynote, Arena, warm; 8 of 9 landed, 7.0 a minute."""
    p = debrief_payload(persona="warm", act="speech", venue="arena", durationSec=69, landed=8, candidates=9,
                        landedPerMin=7.0, roomReactions=6, longestDeadAirSec=1.5, longestDeadAirAt=30.4, wpm=147,
                        peakWpm=153, fillers={"count": 0, "top": []},
                        content={"lines": 11, "features": {"triad": 2, "anaphora": 0, "contrast": 2, "question": 0,
                                                           "callToAction": 3, "quotable": 0}})
    p["reactions"] = []
    return DebriefRequest.model_validate(p)


def open_mic_words_off() -> DebriefRequest:
    """QA set 3 (20-s3-cut.jpg): stand-up at The Back Room, Open Mic, warm, words off; 2 of 5, 2.7 a minute, 2.8 s
    of dead air at 0:41. The house rule says 'again' (under 3 a minute)."""
    p = debrief_payload(persona="warm", venue="openmic", durationSec=44.4, landed=2, candidates=5, landedPerMin=2.7,
                        roomReactions=3, longestDeadAirSec=2.8, longestDeadAirAt=41, wpm=None, peakWpm=None,
                        fillers=None, unsure=0)
    p["reactions"] = [{"kind": "laugh", "at": 20.1, "strength": 0.5, "why": "a beat after the line"}]
    p["lines"] = [{"t": 18.4, "landed": True}]
    return DebriefRequest.model_validate(p)


ARENA_LINE = "4.4 landed a minute. The room gave 4 laughs. Longest dead air 2.8 seconds at 0:52. 157 words per minute, peak 166. No fillers."
ARENA_SPOKEN = "Just over four a minute. Four laughs. Nearly three seconds of dead air... that is the number."


def arena_note(fix: str, line: str = ARENA_LINE, spoken: str = ARENA_SPOKEN, nxt: str = "again", req=None):
    out = Debrief(headline="Four of four.", line=line, fix=fix, spoken=spoken, next=nxt)
    return check_note(out, req or arena_set())


# --- issue 3: the debrief claims only counted patterns, and moves only the way `next` says --------------------------


def test_the_arena_debrief_from_the_qa_is_rejected_for_both_claims():
    with pytest.raises(Rejected) as err:
        arena_note("Nothing to fix. Tags and wordplay carried the room. Try the next room up.")
    reason = str(err.value)
    assert "fix names 'wordplay', but no wordplay were counted" in reason
    assert "(the counted patterns: callback, specific, tag)" in reason
    assert "'next room up'" in reason and "the Arena is the top room" in reason
    assert reason.startswith("(1) ") and "; and (2) " in reason  # every reason at once, for the one retry


def test_the_keynote_debrief_from_the_qa_is_rejected_for_the_next_tier():
    with pytest.raises(Rejected, match="'next tier up', but the Arena is the top room"):
        check_note(Debrief(headline="Eight of nine.", line="8 of 9 lines landed, 7 a minute; 6 rounds of applause.",
                           fix="Nothing to fix. The room is ready for the next tier up.",
                           spoken="Eight of nine landed. Six rounds of applause.", next="again"), keynote_set())


def test_the_retry_that_passed_on_the_day_is_rejected_now():
    """Set 6's first answer said next 'up' and was rejected; the retry set next 'again' but kept "next tier up" in the
    words, and passed, because the guard read only the field."""
    with pytest.raises(Rejected, match="next tier up"):
        check_note(Debrief(headline="Clean.", line="8 of 9 landed.", fix="The room is ready for the next tier up.",
                           spoken="Eight of nine landed.", next="again"), keynote_set())


@pytest.mark.parametrize("fix", [
    "Nothing to fix. Tags and a callback carried the room. Go again here.",
    "Nothing to fix. Six specific details and two tags. Same room, same standard.",
    "No wordplay tonight, but two tags. Go again here.",  # a true absence
    "Try some wordplay on the landlord line next time.",  # advice in the fix, not a claim
    "Not the next room yet: there is nothing above this one. Go again here.",
    "Nothing to fix. Stay at The Bowl.",
])
def test_honest_arena_debriefs_pass(fix):
    assert arena_note(fix).fix == fix


@pytest.mark.parametrize("field, text, bad", [
    ("line", "4 of 4 landed; the wordplay carried it.", "line names 'wordplay'"),
    ("spoken", "Four laughs. The puns did the work... that is the number.", "spoken names 'puns'"),
    ("line", "4 of 4 landed on a list of three.", "line names 'list of three'"),
    ("spoken", "Four laughs, all on rhymes.", "spoken names 'rhymes'"),
])
def test_unmeasured_patterns_are_rejected_in_every_field(field, text, bad):
    kw = {"line": text} if field == "line" else {"spoken": text}
    with pytest.raises(Rejected, match=bad):
        arena_note("Nothing to fix.", **kw)


def test_advice_is_only_advice_in_the_fix():
    with pytest.raises(Rejected, match="line names 'wordplay'"):
        arena_note("Nothing to fix.", line="4 of 4 landed. Try some wordplay.")


@pytest.mark.parametrize("fix, nxt, ok", [
    ("Try the next room up.", "up", True),
    ("Go up a room: the Theatre.", "up", True),
    ("Try the next room up.", "again", False),
    ("Move up.", "again", False),
    ("Take it to a bigger room.", "again", False),
    ("Go down a room and rebuild.", "down", True),
    ("Go down a room and rebuild.", "again", False),
    ("Try the next room up.", "down", False),
    ("Take it to the next level.", "again", True),  # an idiom, not a room
    ("The gap should go down to two seconds.", "again", True),  # a number going down, not a room
])
def test_room_moves_follow_next(fix, nxt, ok):
    lpm = {"up": 3.4, "down": 0.6, "again": 2.0}[nxt]
    req = debrief_req(venue="club", landedPerMin=lpm, longestDeadAirSec=2.0, longestDeadAirAt=30)
    out = Debrief(headline="A set.", line="5 of 8 landed.", fix=fix, spoken="Five of eight landed.", next=nxt)
    if ok:
        assert check_note(out, req).fix == fix
    else:
        with pytest.raises(Rejected, match=f"next is '{nxt}'"):
            check_note(out, req)


def test_nothing_is_above_the_arena_even_on_my_call():
    with pytest.raises(Rejected, match="nothing is above the Arena"):
        arena_note("Nothing to fix.", line=f"{ARENA_LINE} My call: go up.", nxt="up")


def test_cards_and_the_green_room_name_no_uncounted_pattern():
    with pytest.raises(Rejected, match="the card names 'wordplay'"):
        check_line(MomentLine(text="Bit three closed on your wordplay. Two laughs."), line_req())
    assert check_line(MomentLine(text="Bit three closed with two laughs."), line_req())
    req = ChatRequest.model_validate({"kind": "chat", "persona": "warm", "performer": "Priyanka",
                                      "question": "What worked?", "lastScorecard": arena_set().scorecard.model_dump()})
    with pytest.raises(Rejected, match="text names 'callbacks'|text names 'wordplay'"):
        check_reply(GreenRoomReply(text="Your wordplay worked.", spoken="Your wordplay worked."), req)
    ok = GreenRoomReply(text="Six specific details and two tags; the room laughed on the tags.",
                        spoken="Six specific details, two tags. The room liked the tags.")
    assert check_reply(ok, req).text == ok.text


def test_the_prompts_no_longer_tell_the_model_to_suggest_the_next_room_up():
    for req in (arena_set(), keynote_set(), open_mic_words_off()):
        facts = set_facts(req.scorecard, req.history, req.venue, None, req.reactions)
        assert "suggest the next room up" not in facts
        assert "house rule for the next venue: 'again' (go again here at" in facts
    assert "Name only the counted patterns" in RULES and "Never suggest a room move other than `next`" in RULES
    arena = set_facts(arena_set().scorecard, [], "arena", None, arena_set().reactions)
    assert "the top room, with nothing above it" in arena
    assert "not found (so never name these, not even as praise): wordplay, triads, reversals" in arena


# --- issue 4: words off, the checklist says what the line must carry ------------------------------------------


def test_the_words_off_checklist_states_the_sentence_and_the_direction():
    req = open_mic_words_off()
    assert next_venue(req.scorecard, "openmic") == "again"
    checklist = debrief_checklist(req.scorecard, req.venue, req.reactions)
    assert checklist.startswith("Checklist")
    assert '1. `next` is "again": go again here at The Back Room; suggest no other room.' in checklist
    assert 'never write "next room", "room up", "next tier", "move up"' in checklist
    assert '2. Words were off: `line` itself must say that pace and fillers were not measured, with the words "not measured"' in checklist
    assert "3. No content pattern was counted: name none" in checklist


def test_a_words_off_note_that_says_it_passes_and_one_that_misses_both_hears_both():
    req = open_mic_words_off()
    good = Debrief(headline="Two of five.", line="2 of 5 landed, 2.7 a minute; pace and fillers not measured, words were off.",
                   fix="Leave a full second after each punchline.", spoken="Two of five landed. Nearly three a minute.",
                   next="again")
    assert check_note(good, req).next == "again"
    bad = good.model_copy(update={"line": "2 of 5 landed, 2.7 a minute.", "fix": "Nothing to fix. Try the next room up."})
    with pytest.raises(Rejected) as err:
        check_note(bad, req)
    assert "pace and fillers were not measured" in str(err.value) and "'next room up'" in str(err.value)


def test_the_checklist_lists_only_the_counted_patterns():
    checklist = debrief_checklist(arena_set().scorecard, "arena", arena_set().reactions)
    assert "The only content patterns you may name: callbacks, specific details, tags." in checklist
    assert "the top room, with nothing above it" in checklist
    keynote = debrief_checklist(keynote_set().scorecard, "arena", [])
    assert "calls to action, contrasts, triads" in keynote and "(wordplay or rhymes included" in keynote


# --- issue 5 (MC side): singing with no pitch measured nothing ------------------------------------------------


def test_singing_without_pitch_is_not_measured_and_moves_nowhere():
    req = debrief_req(act="singing", venue="arena", landed=0, candidates=0, landedPerMin=0, roomReactions=0,
                      inTunePct=None, longestHoldSec=None)
    assert next_venue(req.scorecard, "arena") == "again"
    facts = set_facts(req.scorecard, [], "arena")
    assert "phrases held: NOT MEASURED" in facts and "in tune: not measured" in facts and "hold: not measured" in facts
    assert "no pitch reached the TV" in facts
    checklist = debrief_checklist(req.scorecard, "arena")
    assert "No pitch reached the TV" in checklist
    # The old rule sent a pitchless Arena set down a room for its zero.
    assert next_venue(debrief_req(act="singing", venue="theatre", landedPerMin=0, inTunePct=None).scorecard,
                      "theatre") == "again"


# --- issue 6: "nearly" and "just over" claim nearness -----------------------------------------------------------


def test_the_qa_hedge_is_rejected_and_the_honest_one_passes():
    req = debrief_req()  # longest dead air 4.1 s
    base = Debrief(headline="5 of 8.", line="5 of 8 landed; 4.1 s of nothing at 2:05.", fix="Cut the gap under 2 s.",
                   spoken="", next="again")
    with pytest.raises(Rejected, match=r"'four and a half' with a hedge.*measured one is 4\.1.*just over four"):
        check_note(base.model_copy(update={"spoken": "Then nearly four and a half seconds of silence."}), req)
    for spoken in ("Then just over four seconds of silence.", "Then about four seconds of silence.",
                   "Then under five seconds of silence, still too long."):
        assert check_note(base.model_copy(update={"spoken": spoken}), req).spoken == spoken
    for spoken in ("Then nearly five seconds of silence.",  # 5 is a house number, but "nearly" claims nearness
                   "Then nearly four seconds of silence.",  # 4.1 is over four, not under
                   "Then just over six seconds of silence."):
        with pytest.raises(Rejected, match="with a hedge"):
            check_note(base.model_copy(update={"spoken": spoken}), req)


@pytest.mark.parametrize("n, x, hedge, ok", [
    (4.5, 4.1, "below", False),  # the QA's "nearly four and a half"
    (4, 4.1, "above", True), (5, 4.1, "below", False), (4, 4.1, "below", False),
    (15, 14.7, "below", True), (14, 14.7, "above", False), (14.5, 14.7, "above", True),
    (1, 1.2, "above", True), (3, 2.7, "below", True), (3, 2.6, "below", True), (4.5, 4.4, "below", True),
    (200, 196, "below", True), (170, 172, "above", True), (15, 15, "below", False),  # not "nearly" what it was
])
def test_close_hedges(n, x, hedge, ok):
    assert rounds(n, x, hedge, close=True) is ok


def test_loose_bounds_keep_their_wider_rule():
    """"Under five seconds" for 4.1 is a true bound, not a claim of nearness; "under four" is false."""
    assert rounds(5, 4.1, "below") is False  # still more than half a unit off
    assert rounds(4.5, 4.1, "below") is True and rounds(4, 4.1, "below") is False


def test_history_patterns_may_be_named():
    """A past set's counted callback may be recalled ("your callback last time")."""
    past = {**record(1, venue="arena"), "performer": "Priyanka",
            "reactions": [{"kind": "laugh", "at": 40.0, "strength": 0.8, "word": "landlord", "features": ["wordplay"]}]}
    req = DebriefRequest.model_validate({**arena_set().model_dump(), "history": [past]})
    assert arena_note("Nothing to fix. The wordplay from last time is gone; the tags carried it.", req=req)
