"""The MC's memory is the performer's own: another performer's sets never reach the prompt."""

from mc_agent import mc as mc_module
from mc_agent.facts import own_history
from mc_agent.models import ChatRequest, DebriefRequest, McLineRequest, SetRecord
from payloads import chat_payload, debrief_payload, line_payload, record


def mixed() -> list[dict]:
    """Two of Priyanka's sets and one of Aman's (the one that must not be credited to her)."""
    aman = {**record(2), "performer": "Aman", "setId": "aman-1"}
    return [record(1), aman, {**record(3), "performer": " priyanka "}]


def test_own_history_matches_the_name_trimmed_and_case_blind():
    sets = [SetRecord.model_validate(r) for r in mixed()]
    assert [r.set_id for r in own_history(sets, "Priyanka")] == ["set-1", "set-3"]
    assert [r.set_id for r in own_history(sets, "aman")] == ["aman-1"]
    assert own_history(sets, "Riya") == []


def test_every_kind_drops_other_performers_sets_before_the_model_sees_them(monkeypatch):
    seen = []
    monkeypatch.setattr(mc_module, "_answer", lambda kind, ai, req, *a, **k: seen.append(req) or {})
    mc_module.line(McLineRequest.model_validate({**line_payload(), "history": mixed()}))
    mc_module.debrief(DebriefRequest.model_validate({**debrief_payload(), "history": mixed()}))
    mc_module.chat(ChatRequest.model_validate({**chat_payload(), "history": mixed()}))
    for req in seen:
        assert req.performer == "Priyanka"
        assert [r.set_id for r in req.history] == ["set-1", "set-3"]
