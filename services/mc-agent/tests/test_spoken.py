"""Written for the ear: the guard reads numbers in words as well as digits, lets an honest hedged rounding through
("about fifteen seconds" for 14.7) and nothing looser, and keeps clock times and decimals out of what is said."""

import pytest

from mc_agent.guard import Rejected, Said, check_line, check_note, check_reply, check_spoken, numbers_in, rounds
from mc_agent.models import DebriefRequest, Debrief, GreenRoomReply, MomentLine
from mc_agent.personas import PERSONAS, SPOKEN, system_prompt
from payloads import chat_req, debrief_payload, debrief_req, line_req

# What the TV read out on 2026-10-12, and the user's verdict on it: "way too AIsh".
READ_TODAY = (
    "1.2 landed a minute, 1 laugh at 0:18, then 14.7 seconds of dead air at 0:20. "
    "The murmurs were the room checking if you were still there."
)


def real_set(**over) -> DebriefRequest:
    """The set behind that line: an open-mic stand-up, 1.2 landed a minute, one laugh at 0:18, 14.7 s of dead air
    at 0:20."""
    p = debrief_payload(persona="sarcastic", venue="openmic", landed=1, candidates=3, durationSec=50,
                        landedPerMin=1.2, roomReactions=1, longestDeadAirSec=14.7, longestDeadAirAt=20, **over)
    p["lines"] = [{"t": 17.6, "landed": True}, {"t": 34.9, "landed": False}]
    p["reactions"] = [{"kind": "laugh", "at": 18.2, "strength": 0.5, "why": "a beat after the line"},
                      {"kind": "murmur", "at": 30.1, "strength": 0.3, "why": "dead air"}]
    return DebriefRequest.model_validate(p)


def note(spoken: str, req: DebriefRequest | None = None):
    line = "1 laugh at 0:18, then 14.7 s of dead air at 0:20." if req is None else "5 of 8 landed."
    out = Debrief(headline="One laugh.", line=line, fix="Keep every gap under 4 seconds.", spoken=spoken, next="again")
    return check_note(out, req or real_set())


# --- the debrief, said out loud ------------------------------------------------------------------------------


def test_what_the_tv_read_today_is_sent_back_to_be_written_for_the_ear():
    with pytest.raises(Rejected, match="read aloud.*clock time.*'0:18'.*nearly fifteen seconds"):
        note(READ_TODAY)


@pytest.mark.parametrize("spoken", [
    "One laugh, about twenty seconds in. Lovely. Then nearly fifteen seconds of silence... which isn't so much a "
    "pause as a lease.",
    "You landed about one line a minute. One laugh. Then nearly fifteen seconds of nothing... I'd have fewer "
    "seconds of nothing.",
    "One laugh. Then nearly fifteen seconds of dead air, straight after it. Next set, nothing over four seconds.",
    "Priyanka, your first laugh came early, about twenty seconds in. Then it went quiet for nearly fifteen "
    "seconds. Keep every gap under four seconds.",
    "Just over one line a minute, one laugh, and almost fifteen seconds of silence. Fifteen or so, anyway.",
])
def test_ear_written_debriefs_pass_with_their_rounded_numbers(spoken):
    assert note(spoken).spoken == spoken


@pytest.mark.parametrize("spoken, why", [
    ("Then about forty seconds of silence.", "with a hedge.*rounds to 40"),  # nothing measured is near forty
    ("Then nearly fourteen seconds of silence.", "with a hedge.*rounds to 14"),  # 14.7 is not "nearly" fourteen
    ("Then just over fifteen seconds of silence.", "with a hedge.*rounds to 15"),  # nor "just over" fifteen
    ("Then about ten seconds of silence.", "with a hedge.*rounds to 10"),  # too coarse: 32% off
    ("About twelve seconds of silence.", "with a hedge.*rounds to 12"),
    ("Forty-seven people walked out.", "'Forty-seven'"),
    ("Then fourteen seconds of silence.", "'fourteen', but the measured number is 14.7.*'nearly' rounds up"),
    ("A hundred and eighty words a minute.", "'A hundred and eighty'"),
])
def test_roundings_are_verified_not_waved_through(spoken, why):
    with pytest.raises(Rejected, match=why):
        note(spoken)


def test_numbers_in_words_are_checked_like_digits():
    req = debrief_req()  # 5 of 8 landed, 62%, 172 words a minute, peak 196, 7 fillers, 4 "basically"
    for spoken in ("Five of eight landed. That's sixty-two percent.", "A hundred and seventy-two words a minute.",
                   "One seventy-two a minute, and about two hundred at the peak.", "Seven fillers, four of them basically."):
        assert note(spoken, req).spoken == spoken
    for spoken, said in (("Nine of eight landed.", "'Nine'"), ("Seventy-two percent landed.", "'Seventy-two'"),
                         ("Your eleventh line was the one.", "'eleventh'"), ("One point nine a minute.", "'One point nine'")):
        with pytest.raises(Rejected, match=said):
            note(spoken, req)
    with pytest.raises(Rejected, match="'nine'"):
        check_line(MomentLine(text="Bit three closed with nine laughs."), line_req())  # a card's words count too
    assert check_line(MomentLine(text="Bit three closed with two laughs."), line_req())


def test_times_can_be_said_in_minutes_but_a_rounded_one_needs_its_hedge():
    req = debrief_req(durationSec=545)  # 9.08 minutes
    assert note("About nine minutes up there, and five of eight landed.", req)
    with pytest.raises(Rejected, match="rounded number, as if it were exact.*'about' or 'nearly'"):
        note("Nine minutes up there, and five of eight landed.", req)
    exact = debrief_req(durationSec=150)  # two and a half minutes, exactly
    assert note("Two and a half minutes, five of eight landed.", exact)
    assert note("Two minutes in, the gap.", debrief_req())  # the gap at 2:05: two minutes in, near enough (2 is a house number)


def test_the_green_room_is_checked_the_same_way():
    ok = GreenRoomReply(text="Not yet: 1.2 landed a minute; the club wants 3.",
                        spoken="Not yet. You landed about one line a minute, and the club wants three.")
    req = chat_req(landedPerMin=1.2, longestDeadAirSec=14.7, longestDeadAirAt=20)
    assert check_reply(ok, req).spoken == ok.spoken
    with pytest.raises(Rejected, match="clock time"):
        check_reply(ok.model_copy(update={"spoken": "Your gap at 0:20 was the problem."}), req)
    with pytest.raises(Rejected, match="with a hedge"):
        check_reply(ok.model_copy(update={"spoken": "Not yet. You landed nearly nine a minute."}), req)


@pytest.mark.parametrize("spoken, bad", [
    ("Silence at 0:20.", "'0:20'"), ("Just 14.7 seconds.", "'4.7'"), ("You hit 196 wpm.", "'wpm'"),
    ("A 4 s gap.", "'4 s'"), ("A 4s gap.", "'4s'"), ("Four mins in.", None),
])
def test_spoken_keeps_out_clock_times_decimals_and_abbreviations(spoken, bad):
    if bad is None:
        check_spoken(spoken)  # "mins" after a word is a style slip the prompt handles, not a reading hazard
        return
    with pytest.raises(Rejected, match="read aloud"):
        check_spoken(spoken)
    with pytest.raises(Rejected, match=bad.replace(".", r"\.")):
        check_spoken(spoken)
    for fine in ("Four seconds.", "Sixty-two percent.", "62% landed.", "5 of 8 landed."):
        check_spoken(fine)


def test_the_debrief_keeps_three_short_sentences_and_a_beat_is_not_a_full_stop():
    out = note("One laugh. Lovely. Then silence... which isn't a pause. It's a lease. Honestly.")
    assert out.spoken == "One laugh. Lovely. Then silence... which isn't a pause."


# --- the rounding rule itself ------------------------------------------------------------------------------


@pytest.mark.parametrize("n, x, hedge, ok", [
    (15, 14.7, "either", True), (15, 14.7, "below", True), (14, 14.7, "above", True),
    (14, 14.7, "below", False), (15, 14.7, "above", False), (10, 14.7, "either", False), (14.5, 14.7, "either", True),
    (20, 18.2, "either", True), (170, 172, "either", True), (175, 172, "either", False), (180, 172, "either", False),
    (200, 172, "either", False), (200, 196, "either", True), (150, 172, "either", False),
    (1, 1.2, "either", True), (1, 1.2, "above", True), (1, 1.2, "below", False), (1, 1.4, "either", True),
    (2, 1.4, "either", False), (3, 2.6, "below", True), (0, 0.4, "either", False), (1, 0.6, "either", False),
    (0.5, 0.6, "either", False), (2.5, 155 / 60, "either", True), (60, 62, "either", True), (70, 71.5, "either", True),
])
def test_rounds(n, x, hedge, ok):
    assert rounds(n, x, hedge) is ok


@pytest.mark.parametrize("text, said", [
    ("forty-seven", [("forty-seven", 47, None)]),
    ("a hundred and seventy-two words", [("a hundred and seventy-two", 172, None)]),
    ("one seventy-two a minute", [("one seventy-two", 172, None)]),
    ("one point two landed", [("one point two", 1.2, None)]),
    ("two and a half minutes", [("two and a half", 2.5, None)]),
    ("half a minute", [("half", 0.5, None)]),
    ("the twenty-first line", [("twenty-first", 21, None)]),
    ("nearly fifteen seconds", [("fifteen", 15, "below", True)]),
    ("just over one a minute", [("one", 1, "above", True)]),
    ("under five seconds", [("five", 5, "below")]),  # a bound, not a claim of nearness
    ("fifteen or so, about 20", [("fifteen", 15, "either"), ("20", 20, "either")]),
    ("twenty-ish", [("twenty", 20, "either")]),
    ("one, two, three", [("one", 1, None), ("two", 2, None), ("three", 3, None)]),
    ("at one point the room", [("one", 1, None)]),
    ("a second of air, twice", [("twice", 2, None)]),  # "second" is the unit of time, never an ordinal here
    ("someone often tonight", []),
    ("4.1 s at 2:05", [("4.1", 4.1, None), ("2:05", None, None)]),
])
def test_numbers_in(text, said):
    assert numbers_in(text) == [Said(*s) for s in said]


# --- the prompts ask for it ----------------------------------------------------------------------------------


def test_prompts_ask_for_spoken_words_written_for_the_ear():
    assert "No digits" in SPOKEN and "No clock times" in SPOKEN and '"nearly fifteen seconds"' in SPOKEN
    assert "not measured" in SPOKEN  # the honesty rules come along
    for persona in PERSONAS.values():
        for kind in ("debrief", "chat"):
            prompt = system_prompt(persona.id, "standup", "openmic", "Priyanka", kind=kind)
            # The debrief's spoken part is shorter (about ten seconds); the rest of the rules are the same.
            rules = SPOKEN if kind == "chat" else SPOKEN.replace("Up to four sentences.", "Up to three short sentences")
            assert rules.split("Up to")[0] in prompt and persona.ear in prompt and persona.heard in prompt
            if kind == "debrief":
                assert "about ten seconds out loud" in prompt
        intro_prompt = system_prompt(persona.id, "standup", "openmic", "Priyanka", kind="line", moment="intro")
        assert "under four seconds out loud" in intro_prompt
        intro = system_prompt(persona.id, "standup", "openmic", "Priyanka", kind="line", moment="intro")
        assert "said out loud" in intro and persona.ear in intro and SPOKEN not in intro
        between = system_prompt(persona.id, "standup", "openmic", "Priyanka", kind="line", moment="between")
        assert persona.ear not in between  # cards that are only shown keep their own rules
        assert not any(ch.isdigit() for ch in persona.heard + persona.ear), persona.id


# --- the facts give each number's honest spoken form, and the guard agrees with it ---------------------------


@pytest.mark.parametrize("x", [14.7, 1.2, 0.4, 0.8, 2.5, 2.6, 3.1, 4.1, 9.9, 12.9, 18.2, 59.6, 61, 71.5, 95, 125, 172, 196])
def test_the_facts_spoken_forms_always_pass_the_guard(x):
    from mc_agent.facts import say_at, say_number, say_seconds
    from mc_agent.guard import allowed_numbers

    allowed = allowed_numbers({"value": x, "at": x}, [])
    for said in (say_number(x), say_seconds(x), say_at(x)):
        assert not any(ch.isdigit() for ch in said)
        check_spoken(said)
        assert all(allowed.ok(n) for n in numbers_in(said)), said
    assert numbers_in(say_number(x))
    assert say_seconds(1.2) == "just over one second" and say_seconds(0.4) == "less than a second"
    assert say_at(1) == "one second in" and say_at(0.4) == "right at the start"


def test_the_real_sets_facts_carry_their_spoken_forms():
    from mc_agent.facts import moments, set_facts

    req = real_set()
    facts = set_facts(req.scorecard, [], req.venue, moments(req.reactions, req.lines))
    assert '(said aloud: "just over one a minute")' in facts
    assert '14.7 seconds, at 0:20 (said aloud: "nearly fifteen seconds", "twenty seconds in")' in facts
    assert "laugh at 0:18 (said aloud: about twenty seconds in)" in facts


def test_the_guard_keeps_the_debrief_to_three_sentences_and_the_intro_to_two():
    from mc_agent.guard import check_line, check_note
    from mc_agent.models import Debrief, DebriefRequest, McLineRequest, MomentLine
    from payloads import debrief_payload, line_payload

    req = DebriefRequest.model_validate(debrief_payload())
    long = "Five of eight landed. The room gave three laughs. The gap was long. Fix the gap. Then go up."
    note = check_note(Debrief(headline="5 of 8.", line="5 of 8 landed.", fix="Cut the gap under 2 seconds.",
                              spoken=long, next="again"), req)
    assert note.spoken.count(".") <= 3 and len(note.spoken) <= 180
    intro = check_line(MomentLine(text="Welcome, Priyanka. Five minutes. Make them count. Go."),
                       McLineRequest.model_validate(line_payload(moment="intro")))
    assert intro.text == "Welcome, Priyanka. Five minutes."
