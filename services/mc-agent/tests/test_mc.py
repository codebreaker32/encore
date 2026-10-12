"""The contract, the prompt facts and the unavailable shapes; the model is always patched (no network)."""

import importlib.util
import json
import time

import botocore.exceptions as boto_errors
import httpx
import openai
import pytest
from pydantic import ValidationError

from mc_agent import mc as mc_module
from mc_agent.app import invoke
from mc_agent.facts import diagnose, history_parts, moment_facts, moments, next_venue, set_facts
from mc_agent.guard import Rejected
from mc_agent.models import (
    DebriefRequest, McLine, McLineDraft, McLineRequest, McNote, McNoteDraft, McReplyDraft, McUnavailable, Scorecard,
    parse_request,
)
from payloads import chat_payload, debrief_payload, debrief_req, line_payload, line_req, record

NOTE = McNoteDraft(headline="5 of 8. I counted.", line="5 of 8 landed; 4.1 s of nothing at 2:05.",
                   fix="Cut the gap under 2 s.", spoken="Five of eight landed.", next="again")


# --- schema -------------------------------------------------------------------------------------


def test_full_debrief_payload_validates_camelcase_in_and_out():
    req = parse_request(debrief_payload())
    assert isinstance(req, DebriefRequest)
    sc = req.scorecard
    assert (sc.landed_per_min, sc.longest_dead_air_sec, sc.longest_dead_air_at, sc.peak_wpm) == (3.1, 4.1, 125, 196)
    assert sc.fillers.count == 7 and sc.fillers.top[0].word == "basically" and sc.in_tune_pct is None
    wire = req.model_dump()
    assert "landedPerMin" in wire["scorecard"] and "landed_per_min" not in wire["scorecard"]


@pytest.mark.parametrize("bad", [{"persona": "cruel"}, {"act": "juggling"}, {"venue": "stadium"}, {"kind": "roast"}])
def test_unknown_ids_and_kinds_are_rejected(bad):
    with pytest.raises(ValidationError):
        parse_request({**debrief_payload(), **bad})


def test_history_is_capped_at_six_and_reactions_round_trip():
    with pytest.raises(ValidationError):
        parse_request(debrief_payload(history=[record(i) for i in range(1, 8)]))
    rec = {**record(1), "reactions": [{"kind": "laugh", "at": 41.2, "strength": 0.7, "lineId": 4, "word": "landlord"}]}
    wire = parse_request(debrief_payload(history=[rec])).model_dump()["history"][0]["reactions"]
    assert wire == [{"kind": "laugh", "at": 41.2, "strength": 0.7, "lineId": 4, "word": "landlord", "features": []}]
    assert parse_request(debrief_payload(history=[record(1)])).history[0].reactions == []


def test_line_request_schema_camelcase_and_rejections():
    req = parse_request(line_payload("between"))
    assert isinstance(req, McLineRequest) and req.moment == "between" and req.duration_sec == 300
    assert (req.facts.bit, req.facts.bit_reactions, req.facts.dead_bits, req.facts.elapsed_sec) == (3, 2, None, 95)
    wire = req.model_dump()
    assert wire["durationSec"] == 300 and wire["facts"]["bitReactions"] == 2 and wire["facts"]["elapsedSec"] == 95
    assert parse_request(line_payload("heckle")).facts.dead_bits == 2
    for bad in ({"moment": "encore"}, {"durationSec": 0}, {"facts": {"at": 1}}, {"persona": "nice"}):
        with pytest.raises(ValidationError):
            parse_request({**line_payload(), **bad})
    with pytest.raises(ValidationError):
        parse_request(line_payload(bit=0))
    with pytest.raises(ValidationError):
        McLine(text="x" * 121, source="ai")


def test_the_contract_has_no_rule_based_source():
    assert importlib.util.find_spec("mc_agent.fallback") is None
    with pytest.raises(ValidationError):
        McNote(**NOTE.model_dump(), source="fallback")
    assert {McUnavailable(reason=r).reason for r in ("timeout", "model-error", "rejected", "no-credentials", "unreachable")}
    with pytest.raises(ValidationError):
        McUnavailable(reason="fallback")


# --- prompt facts (measured analysis, never answer text) ----------------------------------------


@pytest.mark.parametrize("lpm, dead, venue, expected", [
    (3.0, 3.9, "club", "up"), (3.1, 4.0, "club", "again"), (2.9, 1.0, "club", "again"),
    (0.9, 1.0, "club", "down"), (0.9, 1.0, "openmic", "again"), (5.0, 0.5, "arena", "again"),
])
def test_next_venue_rule_is_exact(lpm, dead, venue, expected):
    assert next_venue(Scorecard.model_validate(debrief_payload(venue=venue, landedPerMin=lpm, longestDeadAirSec=dead)["scorecard"]), venue) == expected


@pytest.mark.parametrize("over, problem", [
    ({}, "dead_air"), ({"longestDeadAirSec": 2.0}, "pace"), ({"longestDeadAirSec": 2.0, "peakWpm": 160}, "fillers"),
    ({"longestDeadAirSec": 2.0, "peakWpm": 160, "fillers": None, "landed": 2, "candidates": 9}, "landing"),
    ({"longestDeadAirSec": 2.0, "peakWpm": 160, "fillers": None}, "none"),
])
def test_biggest_problem_order(over, problem):
    assert diagnose(debrief_req(**over).scorecard) == problem


def test_set_facts_state_what_was_not_measured_and_the_rule():
    off = set_facts(debrief_req(wpm=None, peakWpm=None, fillers=None).scorecard)
    assert "pace: NOT MEASURED" in off and "fillers: NOT MEASURED" in off and "next venue: 'again'" in off
    on = set_facts(debrief_req().scorecard)
    assert "landed 5 of 8" in on and "3 laughs" in on and "2:05" in on and "peak 196" in on and "dead air" in on
    sung = set_facts(debrief_req(act="singing", venue="arena").scorecard)
    assert "71.5% in tune" in sung and "3 cheers" in sung and "pace" not in sung


def test_moments_and_history_parts():
    req = debrief_req()
    assert "laugh at 0:13 after 'so my landlord texts me'" in moments(req.reactions, req.lines)
    prev = {**record(2, landedPerMin=2.6), "reactions": [{"kind": "laugh", "at": 41.0, "strength": 0.8, "word": "landlord"}]}
    parts = history_parts(req.scorecard, DebriefRequest.model_validate(debrief_payload(history=[record(1), prev])).history)
    text = "; ".join(parts)
    assert "up from 2.6" in text and "'basically'" in text and "0:41 (the 'landlord' line)" in text
    assert history_parts(req.scorecard, []) == []


def test_moment_facts_per_moment():
    intro = moment_facts(line_req(moment="intro"))
    assert "5 minutes" in intro and "The Basement" in intro and "so far" not in intro and "first" in intro
    between = moment_facts(line_req(moment="between", history=[record(1)]))
    assert "bit 3 just closed, and the room gave 2 laughs in it" in between and "not known" in between
    assert "1 past set on record" in between
    assert "2 bits in a row got nothing" in moment_facts(line_req(moment="heckle"))
    assert "landed 5 of 8" in moment_facts(line_req(moment="end"))


# --- answers and unavailable shapes -------------------------------------------------------------


def patch_ai(monkeypatch, fn):
    for name in ("_ai_note", "_ai_reply", "_ai_line"):
        monkeypatch.setattr(mc_module, name, fn)


def test_answers_carry_source_ai_and_exactly_one_key(monkeypatch):
    monkeypatch.setattr(mc_module, "_ai_note", lambda req, deadline: NOTE)
    monkeypatch.setattr(mc_module, "_ai_reply", lambda req, deadline: McReplyDraft(text="Not yet.", spoken="Not yet."))
    monkeypatch.setattr(mc_module, "_ai_line", lambda req, deadline: McLineDraft(text="Bit 3 closed with 2 laughs."))
    assert invoke(debrief_payload()) == {"note": {**NOTE.model_dump(), "source": "ai"}}
    assert invoke(chat_payload()) == {"reply": {"text": "Not yet.", "spoken": "Not yet.", "source": "ai"}}
    assert invoke(line_payload()) == {"line": {"text": "Bit 3 closed with 2 laughs.", "source": "ai"}}


REQ = httpx.Request("POST", "https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions")


def status(code: int, message: str) -> openai.APIStatusError:
    cls = {401: openai.AuthenticationError, 403: openai.PermissionDeniedError}.get(code, openai.InternalServerError)
    return cls(message, response=httpx.Response(code, request=REQ), body=None)


def wrapped(inner: Exception) -> Exception:
    """As the openai SDK does: an error raised while sending becomes APIConnectionError from it."""
    try:
        try:
            raise inner
        except Exception as e:
            raise openai.APIConnectionError(request=REQ) from e
    except openai.APIConnectionError as outer:
        return outer


@pytest.mark.parametrize("error, reason", [
    (boto_errors.NoCredentialsError(), "no-credentials"),
    (boto_errors.TokenRetrievalError(provider="login", error_msg="login expired"), "no-credentials"),
    (wrapped(boto_errors.NoCredentialsError()), "no-credentials"),
    (status(401, "unauthorized"), "no-credentials"),
    (status(403, "The security token included in the request is expired"), "no-credentials"),
    (status(403, "Operation not allowed"), "model-error"),
    (status(500, "internal"), "model-error"),
    (openai.APIConnectionError(request=REQ), "unreachable"),
    (wrapped(httpx.ConnectError("dns")), "unreachable"),
    (openai.APITimeoutError(request=REQ), "timeout"),
    (Rejected("it quotes '47', a number the payload does not contain"), "rejected"),
    (ValueError("the model returned no structured Debrief"), "model-error"),
])
def test_each_failure_class_maps_to_an_unavailable_reason(monkeypatch, error, reason):
    def boom(req, deadline):
        raise error

    patch_ai(monkeypatch, boom)
    for payload in (debrief_payload(), chat_payload(), line_payload()):
        out = invoke(payload)
        assert list(out) == ["unavailable"] and out["unavailable"]["reason"] == reason
        assert "source" not in out["unavailable"] and isinstance(out["unavailable"].get("detail", ""), str)
        json.dumps(out)


def test_timeouts_are_per_kind(monkeypatch):
    def slow(req, deadline):
        time.sleep(0.3)
        return McLineDraft(text="late") if isinstance(req, McLineRequest) else NOTE

    patch_ai(monkeypatch, slow)
    monkeypatch.setattr(mc_module, "LINE_TIMEOUT_S", 0.05)
    monkeypatch.setattr(mc_module, "TIMEOUT_S", 5.0)
    assert invoke(line_payload()) == {"unavailable": {"reason": "timeout", "detail": "no answer within 0.05 s"}}
    assert invoke(debrief_payload())["note"]["source"] == "ai"
    monkeypatch.setattr(mc_module, "TIMEOUT_S", 0.05)
    assert invoke(debrief_payload())["unavailable"]["reason"] == "timeout"


def test_line_timeout_defaults():
    assert mc_module.LINE_TIMEOUT_S == 3.5 and mc_module.TIMEOUT_S == 8.0


@pytest.mark.parametrize("payload", [{}, {"kind": "debrief"}, {"kind": "line", "moment": "intro"}, {"minutes": -1}, [], "nope"])
def test_entrypoint_rejects_malformed_payloads(payload):
    out = invoke(payload)
    assert out["error"] == "invalid-request" and isinstance(out["detail"], list) and out["detail"]
    json.dumps(out)
