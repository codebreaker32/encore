"""The content judge (`kind: judge`) and the content facts the debrief is given. No network: the model is patched."""

import asyncio
import json
import time

import httpx
import openai
import pytest
from pydantic import ValidationError

from mc_agent import forward, judge
from mc_agent.app import invoke
from mc_agent.facts import content_facts, moments, reaction_features, set_facts
from mc_agent.guard import Rejected, check_note
from mc_agent.models import Debrief, DebriefRequest, JudgeRequest, JudgeVerdict, Line, Reaction, Scorecard, parse_request
from payloads import debrief_payload, scorecard

JOKE = {"kind": "judge", "act": "standup", "lineId": 7, "text": "He didn't say which winter.",
        "context": ["My landlord said he'd fix the heating by winter."]}


def req(**over) -> JudgeRequest:
    return parse_request({**JOKE, **over})


# --- the request ---------------------------------------------------------------------------------


def test_a_judge_request_validates_and_singing_is_never_judged():
    r = req()
    assert isinstance(r, JudgeRequest) and r.line_id == 7 and r.context == JOKE["context"]
    for bad in ({"act": "singing"}, {"text": ""}, {"lineId": 0}, {"context": ["a", "b", "c", "d", "e"]}):
        with pytest.raises(ValidationError):
            parse_request({**JOKE, **bad})


def test_the_prompt_is_the_acts_rubric_and_at_most_three_earlier_lines():
    msgs = judge.messages(req(context=["one", "two", "three", "four"]))
    assert [m["role"] for m in msgs] == ["system", "user"]
    assert '"punch"' in msgs[0]["content"] and '"surprise"' in msgs[0]["content"]
    assert msgs[1]["content"] == "Earlier: two\nEarlier: three\nEarlier: four\nLine: He didn't say which winter."
    assert '"imagery"' in judge.messages(req(act="poetry"))[0]["content"]
    assert '"call"' in judge.messages(req(act="speech"))[0]["content"]
    assert judge.messages(req(context=[]))[1]["content"] == "Line: He didn't say which winter."


# --- parsing the model's answer ----------------------------------------------------------------------


def test_parse_reads_fenced_json_strings_and_ten_point_scales():
    dims, reason = judge.parse("standup", '```json\n{"punch": "0.9", "surprise": 8, "reason": "a twist on a promise."}\n```')
    assert dims == {"punch": 0.9, "surprise": 0.8} and reason == "a twist on a promise"


def test_parse_clamps_and_rejects_a_partial_verdict():
    assert judge.parse("standup", '{"punch": -1, "surprise": 0.4}')[0] == {"punch": 0.0, "surprise": 0.4}
    for raw in ("no json here", '{"punch": 0.5}', '{"punch": "high", "surprise": 0.2}', "[1, 2]"):
        with pytest.raises(ValueError):
            judge.parse("standup", raw)


def test_an_answer_cut_off_by_the_token_cap_keeps_its_numbers_and_drops_the_reason():
    raw = '{"imagery": 0.9, "sound": 0.85, "turn": 0.7, "reason": "vivid monsoon imagery with a quiet tur'
    assert judge.parse("poetry", raw) == ({"imagery": 0.9, "sound": 0.85, "turn": 0.7}, None)
    with pytest.raises(ValueError):  # cut off before every number arrived: still no verdict
        judge.parse("poetry", '{"imagery": 0.9, "sound": 0.8')


def test_a_reason_with_a_number_is_dropped_and_a_long_one_trimmed():
    assert judge.parse("standup", '{"punch": 1, "surprise": 1, "reason": "3 laughs at least"}')[1] is None
    long = "word " * 30
    reason = judge.parse("standup", json.dumps({"punch": 1, "surprise": 1, "reason": long}))[1]
    assert reason is not None and len(reason) <= judge.REASON_MAX and reason.endswith("…")


def test_each_acts_weights_sum_to_one_and_make_the_score():
    for act, weights in judge.SCORE_WEIGHTS.items():
        assert set(weights) == set(judge.DIMS[act]) and sum(weights.values()) == pytest.approx(1.0)
    assert judge.combine("standup", {"punch": 1.0, "surprise": 0.5}) == 0.8
    assert judge.combine("speech", {"point": 1.0, "rhetoric": 0.0, "call": 0.0}) == 0.5


# --- the call and its budget ---------------------------------------------------------------------------


def patch_ask(monkeypatch, answer=None, delay=0.0, error=None):
    seen = {}

    async def fake(r, mid, timeout_s):
        seen.update(model=mid, timeout=timeout_s, line=r.line_id)
        await asyncio.sleep(delay)
        if error is not None:
            raise error
        return answer

    monkeypatch.setattr(judge, "_ask", fake)
    return seen


@pytest.fixture(autouse=True)
def no_humour(monkeypatch):
    """The humour model is optional; each test says whether it is installed."""
    monkeypatch.setattr(judge, "_humor_state", {"on": False})


def test_a_verdict_carries_the_score_dims_model_and_time(monkeypatch):
    seen = patch_ask(monkeypatch, '{"punch": 0.9, "surprise": 0.6, "reason": "turns the promise"}')
    out = judge.verdict(req())
    v = JudgeVerdict.model_validate(out["verdict"])
    # Stand-up is on the percentile scale: the calibrated LLM's 0.78 sits at the 46th percentile of Reddit jokes.
    assert (v.line_id, v.act, v.score, v.dims, v.source) == (7, "standup", 0.457, {"punch": 0.9, "surprise": 0.6}, "ai")
    assert v.model == judge.DEFAULT_JUDGE_MODEL == judge.CALIBRATED_LLM == seen["model"]
    assert v.ms >= 0 and v.reason == "turns the promise" and seen["timeout"] == judge.JUDGE_TIMEOUT_S == 0.35
    assert set(out["verdict"]) >= {"lineId", "act", "score", "dims", "model", "ms", "source"}


def test_the_judge_model_comes_from_the_environment_and_an_uncalibrated_one_keeps_its_scale(monkeypatch):
    seen = patch_ask(monkeypatch, '{"punch": 0.9, "surprise": 0.6}')
    monkeypatch.setenv("MC_JUDGE_MODEL_ID", "qwen.qwen3-32b")
    out = judge.verdict(req())["verdict"]
    assert out["model"] == "qwen.qwen3-32b" == seen["model"] and out["score"] == 0.78


def test_the_llm_percentile_map_is_monotone_and_spans_zero_to_one():
    xs = [i / 100 for i in range(101)]
    ps = [judge.llm_percentile(x, judge.CALIBRATED_LLM) for x in xs]
    assert ps == sorted(ps) and ps[0] == 0.0 and ps[-1] == 1.0
    assert judge.llm_percentile(0.84, judge.CALIBRATED_LLM) == 0.763


def test_stand_up_mixes_the_humour_model_with_the_llm(monkeypatch):
    monkeypatch.setattr(judge, "_humor_state", {"on": True})
    monkeypatch.setattr(judge, "_humor_score", lambda r: 0.9)
    patch_ask(monkeypatch, '{"punch": 0.9, "surprise": 0.75, "reason": "a twist"}')  # 0.84: the 76th percentile
    v = judge.verdict(req())["verdict"]
    assert v["score"] == round(0.7 * 0.9 + 0.3 * 0.763, 3)
    assert v["dims"] == {"punch": 0.9, "surprise": 0.75, "humor": 0.9}
    assert v["model"] == f"{judge.HUMOR_MODEL}+{judge.CALIBRATED_LLM}"


def test_a_late_llm_leaves_the_humour_model_with_a_neutral_partner(monkeypatch):
    monkeypatch.setattr(judge, "_humor_state", {"on": True})
    monkeypatch.setattr(judge, "_humor_score", lambda r: 0.9)
    patch_ask(monkeypatch, '{"punch": 1, "surprise": 1}', delay=1.0)
    start = time.monotonic()
    v = judge.verdict(req(), timeout_s=0.15)["verdict"]
    assert time.monotonic() - start < 0.15 + judge.HUMOR_GRACE_S + 0.1
    assert v["score"] == round(0.7 * 0.9 + 0.3 * 0.5, 3) and v["dims"] == {"humor": 0.9} and v["model"] == judge.HUMOR_MODEL


def test_a_failed_humour_model_leaves_the_llm_alone_and_other_acts_never_use_it(monkeypatch):
    monkeypatch.setattr(judge, "_humor_state", {"on": True})

    def broken(r):
        raise RuntimeError("no model")

    monkeypatch.setattr(judge, "_humor_score", broken)
    patch_ask(monkeypatch, '{"punch": 0.9, "surprise": 0.75}')
    assert judge.verdict(req())["verdict"]["score"] == 0.763
    patch_ask(monkeypatch, '{"point": 1, "rhetoric": 0, "call": 0}')
    v = judge.verdict(req(act="speech"))["verdict"]
    assert v["score"] == 0.5 and "humor" not in v["dims"]


def test_both_missing_is_unavailable(monkeypatch):
    monkeypatch.setattr(judge, "_humor_state", {"on": True})

    def slow(r):
        time.sleep(1.0)
        return 0.9

    monkeypatch.setattr(judge, "_humor_score", slow)
    patch_ask(monkeypatch, '{"punch": 1, "surprise": 1}', delay=1.0)
    assert judge.verdict(req(), timeout_s=0.1)["unavailable"]["reason"] == "timeout"


def test_the_humour_model_is_off_without_its_directory(monkeypatch):
    monkeypatch.delenv("MC_HUMOR_MODEL_DIR", raising=False)
    monkeypatch.setattr(judge, "_humor_state", {"on": None})
    assert judge.humor_on() is False
    judge.warm()  # nothing to load, never raises


def test_past_the_budget_the_answer_is_a_timeout_and_nothing_waits(monkeypatch):
    patch_ask(monkeypatch, '{"punch": 1, "surprise": 1}', delay=1.0)
    out = judge.verdict(req(), timeout_s=0.15)
    assert out == {"unavailable": {"reason": "timeout", "detail": "no verdict within 0.15 s"}}


def test_failures_are_honest_unavailable_answers(monkeypatch):
    patch_ask(monkeypatch, "not json")
    assert judge.verdict(req())["unavailable"]["reason"] == "model-error"
    request = httpx.Request("POST", "https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions")
    patch_ask(monkeypatch, error=openai.APIConnectionError(request=request))
    assert judge.verdict(req())["unavailable"]["reason"] == "unreachable"


def test_the_service_dispatches_judge_requests(monkeypatch):
    patch_ask(monkeypatch, '{"imagery": 0.8, "sound": 0.6, "turn": 0.4}')
    out = invoke({**JOKE, "act": "poetry"})
    assert out["verdict"]["dims"] == {"imagery": 0.8, "sound": 0.6, "turn": 0.4}
    assert out["verdict"]["score"] == pytest.approx(0.4 * 0.8 + 0.3 * 0.6 + 0.3 * 0.4)
    assert invoke({**JOKE, "act": "singing"})["error"] == "invalid-request"


def test_the_forwarder_accepts_a_verdict_and_gives_the_judge_its_own_short_budget():
    body = json.dumps({"verdict": {"lineId": 7, "act": "standup", "score": 0.5, "dims": {"punch": 0.5, "surprise": 0.5},
                                   "model": "m", "ms": 200, "source": "ai"}}).encode()
    assert forward.contract_problem("judge", body) is None
    assert forward.contract_problem("judge", b'{"unavailable": {"reason": "timeout"}}') is None
    assert forward.contract_problem("judge", b'{"verdict": {"lineId": 7}}') is not None
    assert forward.JUDGE_TIMEOUT_S == judge.JUDGE_TIMEOUT_S < forward.LINE_TIMEOUT_S


# --- what the debrief is told about the words -----------------------------------------------------------


CONTENT = {"lines": 9, "features": {"callback": 2, "wordplay": 1, "triad": 0, "reversal": 0, "tag": 0, "specific": 3},
           "rhymedEnds": None, "rangeSemitones": None, "judge": {"inTime": 6, "missed": 2, "meanScore": 0.58}}


def with_content(**over):
    payload = debrief_payload(**over)
    payload["scorecard"]["content"] = CONTENT
    payload["reactions"][0]["features"] = ["callback", "specific"]
    payload["reactions"].append({"kind": "laugh", "at": 60.2, "strength": 0.4, "why": "laugh", "features": ["callback"]})
    payload["reactions"].append({"kind": "laugh", "at": 90.0, "strength": 0.3, "why": "laugh"})
    return payload


def test_the_facts_name_the_patterns_and_which_kinds_of_lines_got_the_room():
    r = DebriefRequest.model_validate(with_content())
    facts = "\n".join(content_facts(r.scorecard, r.reactions))
    assert "counted over 9 lines): 3 specific details, 2 callbacks, 1 wordplay" in facts
    assert '(said aloud: "three specific details", "two callbacks", "one wordplay")' in facts
    assert "- not found (so never name these, not even as praise): triads, reversals, tags" in facts
    assert "laughs by the kind of line they came on: callbacks: 2; specific details: 1; no pattern found: 1" in facts
    assert "estimates" in facts and "never quote them" in facts
    assert reaction_features(r.reactions) == {"callback": 2, "specific": 1, "none": 1}


def test_words_off_says_the_room_heard_timing_only():
    sc = Scorecard.model_validate(scorecard(wpm=None, peakWpm=None, fillers=None))
    assert "NOT MEASURED (words were off)" in content_facts(sc)[0]
    assert content_facts(Scorecard.model_validate(scorecard()))[0].startswith("- content patterns: not measured")
    assert "NOT MEASURED (words were off), so the room heard timing only" in set_facts(sc)


def test_moments_name_a_reactions_patterns_and_label_the_estimate():
    reactions = [Reaction(kind="laugh", at=12.9, strength=0.6, why="x", features=["callback"], judge=0.8)]
    said = moments(reactions, [Line(t=12.4, landed=True, text="the landlord again")])
    assert "after 'the landlord again', on callback, and the MC's model rated the words above ordinary (an estimate)" in said


def test_the_guard_lets_the_mc_count_which_kinds_of_lines_worked():
    r = DebriefRequest.model_validate(with_content())
    ok = Debrief(headline="Callbacks carried it.", line="Two of your laughs came on callbacks. 5 of 8 landed. Words "
                 "were on.", fix="Cut the gap at 2:05 under 2 seconds.", spoken="Two of your laughs came on callbacks.",
                 next="again")
    check_note(ok, r)
    bad = ok.model_copy(update={"line": "Eleven of your laughs came on callbacks. 5 of 8 landed."})
    with pytest.raises(Rejected):
        check_note(bad, r)
