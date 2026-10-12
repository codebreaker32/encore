"""Realistic payloads shared by the tests and the live driver (a club stand-up set, 5 of 8 landed)."""

from mc_agent.models import ChatRequest, DebriefRequest, McLineRequest

PERSONAS = ["warm", "sarcastic", "strict", "deadpan"]
STAGES = [("standup", "club"), ("poetry", "theatre"), ("speech", "openmic"), ("singing", "arena")]


def scorecard(act="standup", venue="club", **over) -> dict:
    sc = {
        "act": act, "venue": venue, "durationSec": 155, "landed": 5, "candidates": 8, "landedPerMin": 3.1,
        "roomReactions": 3, "longestDeadAirSec": 4.1, "longestDeadAirAt": 125, "wpm": 172, "peakWpm": 196,
        "fillers": {"count": 7, "top": [{"word": "basically", "n": 4}, {"word": "like", "n": 3}]},
        "inTunePct": None, "longestHoldSec": None, "unsure": 1,
    }
    if act == "singing":
        sc.update(wpm=None, peakWpm=None, fillers=None, inTunePct=71.5, longestHoldSec=2.8)
    sc.update(over)
    return sc


def record(i: int, act="standup", venue="openmic", persona="warm", **over) -> dict:
    return {
        "setId": f"set-{i}", "endedAt": f"2026-10-0{i}T20:00:00Z", "act": act, "venue": venue, "persona": persona,
        "performer": "Priyanka", "scorecard": scorecard(act, venue, **over), "summary": f"set {i}",
    }


def debrief_payload(persona="sarcastic", act="standup", venue="club", history=(), **over) -> dict:
    return {
        "kind": "debrief", "persona": persona, "performer": "Priyanka", "act": act, "venue": venue,
        "scorecard": scorecard(act, venue, **over),
        "lines": [{"t": 12.4, "landed": True, "text": "so my landlord texts me"}, {"t": 31.0, "landed": False}],
        "reactions": [
            {"kind": "laugh", "at": 12.9, "strength": 0.6, "why": "0.8 s beat after a 2.1 s line", "lineId": 1},
            {"kind": "murmur", "at": 129.1, "strength": 0.3, "why": "4.1 s of dead air"},
            {"kind": "heckle", "at": 140.0, "strength": 0.5, "why": "two dead bits", "text": "Is this the warm-up?"},
        ],
        "history": list(history),
    }


def chat_payload(persona="warm", question="Am I ready for the theatre?", last=True, history=(), **over) -> dict:
    return {
        "kind": "chat", "persona": persona, "performer": "Priyanka", "question": question,
        "history": list(history), "lastScorecard": scorecard(**over) if last else None,
    }


MOMENT_FACTS = {
    "intro": {"at": 0, "landed": 0, "candidates": 0, "roomReactions": 0, "longestDeadAirSec": 0, "elapsedSec": 0},
    "between": {"at": 95, "bit": 3, "bitReactions": 2, "landed": 4, "candidates": 6, "roomReactions": 3,
                "longestDeadAirSec": 2.2, "elapsedSec": 95},
    "heckle": {"at": 140, "bit": 5, "deadBits": 2, "landed": 5, "candidates": 8, "roomReactions": 3,
               "longestDeadAirSec": 4.1, "elapsedSec": 140},
    "end": {"at": 155, "landed": 5, "candidates": 8, "roomReactions": 3, "longestDeadAirSec": 4.1, "elapsedSec": 155},
}


def line_payload(moment="between", persona="sarcastic", history=(), **facts) -> dict:
    return {
        "kind": "line", "moment": moment, "persona": persona, "performer": "Priyanka", "act": "standup",
        "venue": "club", "durationSec": 300, "facts": {**MOMENT_FACTS[moment], **facts}, "history": list(history),
    }


def debrief_req(**kw) -> DebriefRequest:
    return DebriefRequest.model_validate(debrief_payload(**kw))


def chat_req(**kw) -> ChatRequest:
    return ChatRequest.model_validate(chat_payload(**kw))


def line_req(**kw) -> McLineRequest:
    return McLineRequest.model_validate(line_payload(**kw))
