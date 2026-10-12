"""Forwarding mode (MC_BACKEND=agentcore): this service relays each MC request to the MC running on Amazon Bedrock
AgentCore Runtime.

The TV keeps calling the same local `POST /invocations` with the same JSON both ways. The call to AWS is
SigV4-signed here, with this host's credentials (the build box's instance role, or `aws login` on the laptop), so
no AWS key ever reaches the TV. This module imports no Strands or OpenAI code, so a forwarder stays light.

- Each request is validated locally first (`app.invoke` runs `parse_request`), so an invalid one gets the same
  `{"error": "invalid-request"}` as before and is never sent.
- One runtime session per forwarder process (one per TV): `encore-tv-<host>-<32 hex>`. It is random and never holds
  a performer's name, because session ids appear in AgentCore's logs and spans. The MC keeps no state between
  requests (its memory travels in the payload), so performers on one TV share that TV's microVM. A restart takes a
  new session, which also picks up a newly deployed runtime version, and stops the old one.
- The runtime's answer is passed through byte for byte when it is exactly one contract answer for the request's
  kind (`{note}`, `{reply}` or `{line}`; `{unavailable}`; `{error: invalid-request}`). The words and `source: "ai"`
  are checked strictly. The voice (`audio`) only has to be an object, because its shape is changing (base64 MP3, then
  presigned Polly URLs), and a runtime one version behind must not cost the TV the words. Anything else, and every
  failure, becomes an honest `{"unavailable": {"reason", "detail"}}` whose detail starts with "AgentCore:". Details
  are error names and messages, never credentials or payloads.
- The budgets are mc.py's (MC_TIMEOUT_S 8, MC_LINE_TIMEOUT_S 3.5). The runtime enforces its own budget and normally
  answers first. Past budget + MC_FORWARD_GRACE_S (0.6 s, below the TV's 0.75 s grace) this side gives up with
  `timeout`, so the TV says "timed out" rather than "unreachable".
- A keep-warm call (`{"kind": "keep-warm"}`, which the runtime answers with invalid-request and no model call) warms
  the session at start and whenever it has been idle for MC_AGENTCORE_KEEPWARM_S (300 s; 0 turns it off).

Env: MC_AGENTCORE_ARN (required), MC_AGENTCORE_QUALIFIER (DEFAULT), MC_AGENTCORE_SESSION (optional, 33-256 of
[A-Za-z0-9-]), MC_AGENTCORE_KEEPWARM_S, MC_FORWARD_GRACE_S, MC_TIMEOUT_S, MC_LINE_TIMEOUT_S.
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
import socket
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any

import boto3
import botocore.exceptions as boto_errors
from botocore.config import Config
from pydantic import ValidationError
from starlette.responses import Response

from .models import JudgeVerdict, McLineDraft, McNoteDraft, McReplyDraft, McUnavailable

log = logging.getLogger("mc_agent.forward")

# The same budgets and defaults as mc.py (tests/test_forward.py checks they stay equal; importing mc here would load
# Strands and the OpenAI SDK into every forwarder).
TIMEOUT_S = float(os.environ.get("MC_TIMEOUT_S", "8"))
LINE_TIMEOUT_S = float(os.environ.get("MC_LINE_TIMEOUT_S", "3.5"))
# The content judge's budget (judge.py). Through AgentCore it rarely fits the engine's ~0.9 s; the room then uses
# timing and its own features, as it does for any late verdict.
JUDGE_TIMEOUT_S = float(os.environ.get("MC_JUDGE_TIMEOUT_S", "0.35"))
# The TV waits budget + mcGraceMs (packages/shared-ui/src/encore/config.ts) before it calls the MC unreachable.
TV_GRACE_S = 0.75
GRACE_S = float(os.environ.get("MC_FORWARD_GRACE_S", "0.6"))
KEEPWARM_S = float(os.environ.get("MC_AGENTCORE_KEEPWARM_S", "300"))
# Bounds a call the cutoff already gave up on (and the keep-warm call, which may wait for a cold microVM).
READ_TIMEOUT_S = 9.0
CONNECT_TIMEOUT_S = 2.0

KEEP_WARM_BODY = b'{"kind":"keep-warm"}'
ARN = re.compile(r"^arn:aws[a-z-]*:bedrock-agentcore:([a-z0-9-]+):(\d{12}):runtime/[A-Za-z0-9_-]+$")
SESSION = re.compile(r"^[A-Za-z0-9-]{33,256}$")

# Which answer each kind may get, and the model its words must validate against.
ANSWER = {
    "debrief": ("note", McNoteDraft), "chat": ("reply", McReplyDraft), "line": ("line", McLineDraft),
    "judge": ("verdict", JudgeVerdict),
}

# The same set as mc.NO_CREDENTIALS (a test keeps them in step).
NO_CREDENTIALS = (
    boto_errors.NoCredentialsError, boto_errors.PartialCredentialsError, boto_errors.CredentialRetrievalError,
    boto_errors.TokenRetrievalError, boto_errors.UnauthorizedSSOTokenError, boto_errors.SSOTokenLoadError,
    boto_errors.LoginError, boto_errors.LoginRefreshRequired, boto_errors.LoginTokenLoadError,
    boto_errors.NoAuthTokenError,
)
CREDENTIAL_CODES = {
    "AccessDeniedException", "AccessDenied", "UnauthorizedException", "ExpiredToken", "ExpiredTokenException",
    "UnrecognizedClientException", "InvalidClientTokenId", "InvalidSignatureException", "SignatureDoesNotMatch",
    "IncompleteSignatureException", "MissingAuthenticationTokenException",
}
EXPIRED = re.compile(r"expired|security token|ExpiredToken|UnrecognizedClient", re.I)
# The MC process failed or answered with an error (424), or AgentCore refused the request as invalid (400).
MODEL_ERROR_CODES = {"RuntimeClientError", "ValidationException"}
# AgentCore itself is missing, busy, out of quota or failing.
UNREACHABLE_CODES = {
    "ResourceNotFoundException", "ThrottlingException", "ServiceQuotaExceededException", "RetryableConflictException",
    "ConflictException", "InternalServerException", "ServiceUnavailableException",
}
TIMEOUTS = (boto_errors.ReadTimeoutError, boto_errors.ConnectTimeoutError)
UNREACHABLE = (
    boto_errors.EndpointConnectionError, boto_errors.ConnectionClosedError, boto_errors.SSLError,
    boto_errors.ConnectionError, boto_errors.HTTPClientError,
)


@dataclass(frozen=True)
class Target:
    arn: str
    region: str
    qualifier: str
    session_id: str
    own_session: bool  # generated here (stopped on close), not given in MC_AGENTCORE_SESSION


def new_session_id(host: str | None = None) -> str:
    """`encore-tv-<host>-<32 hex>`: 42-83 characters of [A-Za-z0-9-], random per process."""
    name = re.sub(r"[^A-Za-z0-9-]+", "-", host if host is not None else socket.gethostname()).strip("-")[:40]
    return f"encore-tv-{name + '-' if name else ''}{uuid.uuid4().hex}"


def target_from_env() -> Target:
    """The runtime to forward to; ValueError (the service refuses to start) when it is missing or malformed."""
    arn = os.environ.get("MC_AGENTCORE_ARN", "").strip()
    if not arn:
        raise ValueError(
            "MC_BACKEND=agentcore needs MC_AGENTCORE_ARN (arn:aws:bedrock-agentcore:<region>:<account>:runtime/<id>)"
        )
    match = ARN.match(arn)
    if not match:
        raise ValueError(f"MC_AGENTCORE_ARN is not an AgentCore runtime ARN: {arn[:120]!r}")
    if not 0 <= GRACE_S < TV_GRACE_S:
        raise ValueError(f"MC_FORWARD_GRACE_S must be at least 0 and below the TV's {TV_GRACE_S} s, not {GRACE_S}")
    session = os.environ.get("MC_AGENTCORE_SESSION", "").strip()
    if session and not SESSION.match(session):
        raise ValueError("MC_AGENTCORE_SESSION must be 33-256 characters of letters, digits and '-'")
    qualifier = os.environ.get("MC_AGENTCORE_QUALIFIER", "").strip() or "DEFAULT"
    return Target(arn=arn, region=match.group(1), qualifier=qualifier, session_id=session or new_session_id(),
                  own_session=not session)


def make_client(region: str, session: Any = None) -> Any:
    """One long-lived client: its connection pool keeps the TLS connection to AgentCore open between calls.
    Standard retries, one retry at most (409 "session operation in progress" is modelled as retryable)."""
    config = Config(
        connect_timeout=CONNECT_TIMEOUT_S, read_timeout=READ_TIMEOUT_S, tcp_keepalive=True, max_pool_connections=16,
        retries={"mode": "standard", "total_max_attempts": 2}, user_agent_extra="encore-mc-forwarder",
    )
    return (session or boto3.Session()).client("bedrock-agentcore", region_name=region, config=config)


def trace_id() -> str:
    """An X-Ray trace header for one call, logged so a failure can be found in CloudWatch."""
    return f"Root=1-{int(time.time()):08x}-{secrets.token_hex(12)};Sampled=1"


def _short(text: str, limit: int = 160) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def classify(err: BaseException) -> McUnavailable:
    """Map a failed AgentCore call to the reason the TV shows. Details name the error, never a credential."""
    name = type(err).__name__
    if isinstance(err, NO_CREDENTIALS):
        return McUnavailable(reason="no-credentials", detail=f"AgentCore: {name}")
    if isinstance(err, boto_errors.ClientError):
        error = err.response.get("Error", {})
        code = str(error.get("Code") or name)
        status = err.response.get("ResponseMetadata", {}).get("HTTPStatusCode") or 0
        detail = _short(f"AgentCore: {code}: {error.get('Message') or ''}".rstrip(": "))
        # The code decides first: a runtime that failed to start comes back as RuntimeClientError with HTTP 403
        # (AgentCore's troubleshooting guide), which is the MC failing, not this host's sign-in.
        if code in MODEL_ERROR_CODES:
            return McUnavailable(reason="model-error", detail=detail)
        if code in CREDENTIAL_CODES or EXPIRED.search(code):
            return McUnavailable(reason="no-credentials", detail=detail)
        if code in UNREACHABLE_CODES:
            return McUnavailable(reason="unreachable", detail=detail)
        if status in (401, 403):
            return McUnavailable(reason="no-credentials", detail=detail)
        if status in (402, 404, 409, 429) or status >= 500:
            return McUnavailable(reason="unreachable", detail=detail)
        return McUnavailable(reason="model-error", detail=detail)
    if isinstance(err, TIMEOUTS):
        return McUnavailable(reason="timeout", detail=_short(f"AgentCore: {name}: {err}"))
    if isinstance(err, UNREACHABLE):
        return McUnavailable(reason="unreachable", detail=_short(f"AgentCore: {name}: {err}"))
    return McUnavailable(reason="model-error", detail=_short(f"AgentCore: {name}: {err}"))


def contract_problem(kind: str, data: bytes) -> str | None:
    """None when `data` is exactly one contract answer for a request of this kind; otherwise what is wrong with it."""
    try:
        body = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        return "not JSON"
    if not isinstance(body, dict) or not body:
        return "not a JSON object"
    keys = set(body)
    key, words = ANSWER[kind]
    try:
        if keys == {key}:
            answer = body[key]
            words.model_validate(answer)  # every word field present, a string, within the wire limits
            if answer.get("source") != "ai":
                return f"its '{key}' is not marked source 'ai'"
            if answer.get("audio") is not None and not isinstance(answer["audio"], dict):
                return f"its '{key}' has an audio that is not an object"
            return None
        if keys == {"unavailable"}:
            McUnavailable.model_validate(body["unavailable"])
            return None
    except ValidationError as err:
        return f"its '{next(iter(keys))}' does not match the contract ({err.error_count()} errors)"
    if body.get("error") == "invalid-request" and keys <= {"error", "detail"}:
        return None
    return f"unexpected keys {sorted(keys)[:4]} for a {kind} request"


def _unavailable(kind: str, gone: McUnavailable, took: float, trace: str) -> dict:
    log.warning("%s via AgentCore: unavailable (%s: %s) after %.2fs, trace %s", kind, gone.reason, gone.detail, took,
                trace)
    return {"unavailable": gone.model_dump(exclude_none=True)}


class Forwarder:
    """Relays requests to one AgentCore runtime session. Thread-safe; one per process."""

    def __init__(self, target: Target, client: Any = None) -> None:
        self.target = target
        self.client = client if client is not None else make_client(target.region)
        self._pool = ThreadPoolExecutor(max_workers=16, thread_name_prefix="agentcore")
        self._stop = threading.Event()
        self._warm: threading.Thread | None = None
        # Clear while the start-up warm-up provisions the session: a second call during provisioning would get
        # 409 "Session operation in progress", so requests wait for it (inside their own cutoff) instead.
        self._ready = threading.Event()
        self._ready.set()
        self.last_call = 0.0  # time.monotonic() of the last call that reached AgentCore or gave up on it

    def _call(self, body: bytes, trace: str) -> bytes:
        self._ready.wait(READ_TIMEOUT_S)
        return self._invoke(body, trace)

    def _invoke(self, body: bytes, trace: str) -> bytes:
        response = self.client.invoke_agent_runtime(
            agentRuntimeArn=self.target.arn, qualifier=self.target.qualifier, runtimeSessionId=self.target.session_id,
            contentType="application/json", accept="application/json", payload=body, traceId=trace,
        )
        stream = response["response"]
        try:
            return stream.read()
        finally:
            stream.close()

    def forward(self, payload: Any, kind: str) -> Response | dict:
        """The runtime's answer, byte for byte, or `{"unavailable": ...}`; never raises."""
        start = time.monotonic()
        budget = LINE_TIMEOUT_S if kind == "line" else JUDGE_TIMEOUT_S if kind == "judge" else TIMEOUT_S
        cutoff = budget + (0.1 if kind == "judge" else GRACE_S)
        trace = trace_id()
        future = self._pool.submit(self._call, json.dumps(payload, ensure_ascii=False).encode("utf-8"), trace)
        try:
            data = future.result(timeout=cutoff)
        except FutureTimeout:
            gone = McUnavailable(reason="timeout", detail=f"AgentCore: no answer within {cutoff:g} s")
            return _unavailable(kind, gone, time.monotonic() - start, trace)
        except Exception as err:  # noqa: BLE001 - every failure becomes an honest "unavailable"
            return _unavailable(kind, classify(err), time.monotonic() - start, trace)
        finally:
            self.last_call = time.monotonic()
        problem = contract_problem(kind, data)
        took = time.monotonic() - start
        if problem:
            gone = McUnavailable(reason="model-error", detail=f"AgentCore: the runtime's answer is {problem}")
            return _unavailable(kind, gone, took, trace)
        log.info("%s via AgentCore: %s…, %d bytes in %.2fs, trace %s", kind, data[:12].decode("utf-8", "replace"),
                 len(data), took, trace)
        return Response(data, media_type="application/json")

    # --- the session ---------------------------------------------------------------------------------

    def ping(self, why: str) -> bool:
        """One keep-warm call (no model call on the runtime); True when the runtime answered as expected."""
        start, trace = time.monotonic(), trace_id()
        try:
            data = self._invoke(KEEP_WARM_BODY, trace)
        except Exception as err:  # noqa: BLE001 - a failed keep-warm only costs the next call a cold start
            log.warning("AgentCore %s failed after %.2fs: %s (trace %s)", why, time.monotonic() - start,
                        classify(err).detail, trace)
            return False
        finally:
            self.last_call = time.monotonic()
        ok = b'"invalid-request"' in data
        log.info("AgentCore session %s %s in %.2fs%s", self.target.session_id, why, time.monotonic() - start,
                 "" if ok else " (unexpected answer)")
        return ok

    def start_keep_warm(self, every_s: float = KEEPWARM_S) -> None:
        """Warm the session now (in the background) and again whenever it has been idle for `every_s`."""
        if every_s <= 0 or self._warm is not None:
            return

        def run() -> None:
            try:
                self.ping("warm-up")
            finally:
                self._ready.set()
            while not self._stop.wait(min(every_s, 30.0)):
                if time.monotonic() - self.last_call >= every_s:
                    self.ping("keep-warm")

        self._ready.clear()
        self._warm = threading.Thread(target=run, name="agentcore-keep-warm", daemon=True)
        self._warm.start()

    def close(self) -> None:
        """Stop the keep-warm loop and, if this process made the session, the session's microVM (best effort)."""
        self._stop.set()
        if not self.target.own_session:
            return
        try:
            t = self.target
            self.client.stop_runtime_session(agentRuntimeArn=t.arn, qualifier=t.qualifier, runtimeSessionId=t.session_id)
            log.info("AgentCore session %s stopped", self.target.session_id)
        except Exception as err:  # noqa: BLE001 - it idles out on its own
            log.info("AgentCore session %s not stopped (%s)", self.target.session_id, classify(err).detail)


_instance: Forwarder | None = None
_lock = threading.Lock()


def get() -> Forwarder:
    """The process's forwarder, created from the environment on first use (ValueError when misconfigured)."""
    global _instance
    with _lock:
        if _instance is None:
            _instance = Forwarder(target_from_env())
        return _instance


def install(forwarder: Forwarder | None) -> None:
    """Replace the process's forwarder (tests)."""
    global _instance
    with _lock:
        _instance = forwarder
