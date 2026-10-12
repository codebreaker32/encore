"""The Encore MC service: the Amazon Bedrock AgentCore Runtime entrypoint, and the local service the TV calls.

Local run:  uv run python -m mc_agent.app      (serves on :8080 or $PORT, POST /invocations)
            or, from the repo root, `yarn dev:mc`.
AgentCore:  `deploy/main.py` calls `serve(host="0.0.0.0", port=8080)` inside the runtime (deploy/README.md).

Backends (MC_BACKEND):
- `local` (default): this process asks the model (mc.py) and Amazon Polly (voice.py) itself.
- `agentcore`: this process validates each request and forwards it unchanged to the MC on Amazon Bedrock AgentCore
  Runtime (forward.py), signing the call with this host's AWS credentials, so the TV never holds AWS keys. The
  runtime's answer comes back byte for byte; a failure becomes `unavailable` with an "AgentCore:" detail.

Env:        MC_BACKEND        local (default) or agentcore; anything else and the service refuses to start
            MC_PROVIDER       mantle (default: Bedrock's OpenAI-compatible endpoint, SigV4-signed) or converse
            MC_MODEL_ID       default zai.glm-5 (mantle) / anthropic.claude-opus-5-5 (converse)
            MC_REGION         else AWS_REGION, else ap-south-1
            MC_TIMEOUT_S      debrief and chat, default 8 (both backends)
            MC_LINE_TIMEOUT_S title cards during a set, default 3.5 (both backends)
            MC_VOICE_<PERSONA> Polly voice override (defaults in voice.py: WARM Kajal, SARCASTIC Brian, STRICT Stephen,
                              DEADPAN Gregory). The debrief and chat try the voice's premium engine (generative;
                              long-form for Gregory) in MC_VOICE_PREMIUM_REGION (default us-east-1) when at least
                              3 s of budget is left, then the same voice on neural in MC_REGION; lines always use
                              neural. MP3 at 24 kHz.
            MC_AGENTCORE_ARN  agentcore only: the runtime to forward to (required)
            MC_AGENTCORE_QUALIFIER  endpoint, default DEFAULT
            MC_AGENTCORE_SESSION    runtime session id (33-256 of [A-Za-z0-9-]); default a new random one per process
            MC_AGENTCORE_KEEPWARM_S keep the session's microVM warm when idle this long, default 300 (0 = off)
            MC_FORWARD_GRACE_S      how long past the budget to wait for AgentCore, default 0.6 (below the TV's 0.75)
            MC_KEEP_ALIVE_S   how long an idle client connection stays open, default 75 (uvicorn's own is 5)
            AWS credentials come from botocore's chain (`aws login`, profile, role); never printed.

Every MC word is the model's. Each response is exactly one of {"note"}, {"reply"}, {"line"} or
{"unavailable": {"reason": "timeout"|"model-error"|"rejected"|"no-credentials"|"unreachable", "detail"?}};
bad payloads get {"error": "invalid-request", "detail": [...]} (all HTTP 200).
With "speak": true on any kind, the answer also carries "audio": {"format": "mp3", "base64", "voice"}
(Polly reads `spoken`, or a line's `text`, inside the same budget; on failure the words come without audio).
The examples below are from Qwen3 235B on mantle (ap-south-1, 2026-10-11), the default before GLM-5; GLM-5 answers
in the same shapes, and the voices have changed since (see above):

Debrief:    {"kind": "debrief", "persona": "strict", "performer": "Priyanka", "act": "standup", "venue": "club",
             "scorecard": {"act": "standup", "venue": "club", "durationSec": 155, "landed": 5, "candidates": 8,
                           "landedPerMin": 3.1, "roomReactions": 3, "longestDeadAirSec": 4.1, "longestDeadAirAt": 125,
                           "wpm": 172, "peakWpm": 196, "fillers": {"count": 7, "top": [{"word": "basically", "n": 4},
                           {"word": "like", "n": 3}]}, "inTunePct": null, "longestHoldSec": null, "unsure": 1},
             "lines": [{"t": 12.4, "landed": true, "text": "so my landlord texts me"}, {"t": 31.0, "landed": false}],
             "reactions": [{"kind": "laugh", "at": 12.9, "strength": 0.6, "why": "0.8 s beat after a 2.1 s line"}],
             "history": [...]}
            -> {"note": {"headline": "5 of 8. Longest gap 4.1 seconds.",
                         "line": "5 of 8 landed. 3.1 landed a minute. Longest gap 4.1 seconds at 2:05. Pace 172 words per minute, peak 196. Fillers: 'basically' 4, 'like' 3.",
                         "fix": "Cut the longest gap under 4 seconds.",
                         "spoken": "You landed five of eight lines. The room gave three laughs.", "next": "again", "source": "ai"}}

Chat:       {"kind": "chat", "persona": "deadpan", "performer": "Priyanka", "question": "Did that last bit die?",
             "history": [...], "lastScorecard": {... as above ...}}
            -> {"reply": {"text": "5 of 8 landed. The room gave 3 laughs. The gap at 2:05 was 4.1 seconds; make it one. You're up from 2.6 last set. 'Basically' again the top filler. Next: again.",
                          "spoken": "Five of eight landed. The room gave three laughs. The gap at two oh five was four point one seconds.", "source": "ai"}}

Line:       {"kind": "line", "moment": "heckle", "persona": "sarcastic", "performer": "Priyanka", "act": "standup",
             "venue": "club", "durationSec": 300, "facts": {"at": 140, "bit": 5, "deadBits": 2, "landed": 5,
             "candidates": 8, "roomReactions": 3, "longestDeadAirSec": 4.1, "elapsedSec": 140}, "history": []}
            -> {"line": {"text": "Two bits, zero reaction – even the echo forgot to laugh, Priyanka.", "source": "ai"}}

Judge:      {"kind": "judge", "act": "standup", "lineId": 7, "text": "He didn't say which winter.",
             "context": ["My landlord said he'd fix the heating by winter."]}
            -> {"verdict": {"lineId": 7, "act": "standup", "score": 0.86, "dims": {"punch": 0.9, "surprise": 0.8},
                            "reason": "a twist on a vague promise", "model": "qwen.qwen3-32b", "ms": 210, "source": "ai"}}
            (judge.py: one LLM call within MC_JUDGE_TIMEOUT_S, 0.35 s, alongside the CPU humour model for stand-up when
             MC_HUMOR_MODEL_DIR is set; the room never waits for it past 0.9 s)

Unavailable: -> {"unavailable": {"reason": "timeout", "detail": "no answer within 3.5 s"}}
"""

import logging
import os
import threading
from types import ModuleType

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from pydantic import ValidationError
from starlette.middleware.cors import CORSMiddleware

from . import forward
from .models import error_detail, parse_request

# AgentCore configures only its own logger; give ours a handler so "answered" and "unavailable" lines show.
_log = logging.getLogger("mc_agent")
if not _log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    _log.addHandler(_handler)
    _log.setLevel(logging.INFO)

BACKENDS = ("local", "agentcore")

app = BedrockAgentCoreApp()
# The TV's browser preview (`yarn dev:tv-web`) calls this from another origin; native TV apps have no CORS.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST", "OPTIONS"], allow_headers=["content-type"])


def backend() -> str:
    b = os.environ.get("MC_BACKEND", "local").strip().lower()
    if b not in BACKENDS:
        raise ValueError(f"MC_BACKEND must be one of {BACKENDS}, not {b!r}")
    return b


def _local() -> ModuleType:
    """The in-process MC. Imported on demand so a forwarder never loads Strands or the OpenAI SDK."""
    from . import mc

    return mc


@app.entrypoint
def invoke(payload: dict):
    try:
        req = parse_request(payload)
    except ValidationError as err:
        return {"error": "invalid-request", "detail": error_detail(err)}
    try:
        which = backend()
    except ValueError as err:
        return {"unavailable": {"reason": "model-error", "detail": str(err)}}
    if which == "agentcore":
        try:
            forwarder = forward.get()
        except ValueError as err:
            return {"unavailable": {"reason": "model-error", "detail": str(err)}}
        return forwarder.forward(payload, req.kind)
    if req.kind == "judge":
        from . import judge

        return judge.verdict(req)
    mc = _local()
    if req.kind == "debrief":
        return mc.debrief(req)
    if req.kind == "chat":
        return mc.chat(req)
    return mc.line(req)


def serve(host: str | None = None, port: int | None = None) -> None:
    """Check the configuration (a bad MC_BACKEND or MC_AGENTCORE_ARN stops the service here), then serve
    POST /invocations and GET /ping until stopped."""
    which = backend()
    forwarder = None
    if which == "agentcore":
        forwarder = forward.get()
        t = forwarder.target
        _log.info("forwarding to AgentCore %s (%s), session %s", t.arn, t.qualifier, t.session_id)
        forwarder.start_keep_warm()
    else:
        _local()  # load Strands and the model client before the first request, not during it
        from . import judge

        threading.Thread(target=judge.warm, name="judge-warm", daemon=True).start()  # the humour model, if installed
    try:
        # Keep the TV's connection open between lines (uvicorn's default closes it after 5 s idle): a judge request on a
        # fresh connection through adb reverse and an SSH tunnel paid about 140 ms more on the Google TV.
        app.run(
            port=port if port is not None else int(os.environ.get("PORT", "8080")),
            host=host,
            timeout_keep_alive=int(os.environ.get("MC_KEEP_ALIVE_S", "75")),
        )
    finally:
        if forwarder is not None:
            forwarder.close()


if __name__ == "__main__":
    serve()
