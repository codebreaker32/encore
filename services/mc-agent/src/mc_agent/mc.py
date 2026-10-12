"""The MC: one fresh Strands agent per request, structured output, the honesty guard, a timeout.

Every MC word is the model's (honesty rule 5). When the model cannot answer, the response is
`{"unavailable": {"reason": ...}}` and the TV shows the MC as unavailable; nothing is substituted.
Reasons: `timeout` (past the budget), `no-credentials` (botocore found none, or the login expired),
`unreachable` (the endpoint could not be reached), `rejected` (the guard rejected the answer twice; the
first rejection is fed back to the model once if time remains), `model-error` (anything else).

Providers (MC_PROVIDER):
- `mantle` (default): Bedrock's OpenAI-compatible endpoint, https://bedrock-mantle.<region>.api.aws/v1,
  through Strands' OpenAIModel with every request SigV4-signed by botocore (`sigv4.py`).
- `converse`: Strands' BedrockModel (Converse API), for when the account's Converse access unlocks.

The service stays warm, so a request pays only for the model's own answer:
- every model call runs on one long-lived asyncio loop on its own thread, through one OpenAI client per region whose
  pooled HTTPS connection outlives the request (asyncio.run per request closed it every time, so each call paid a
  new TLS handshake); a connection that fails before any answer arrives is retried once, at once;
- at boot (when app.serve imports this module) a background thread resolves the credentials, makes one 5-token
  completion and checks the voices (voice.warm); after that a 5-token keep-alive goes out whenever the connection has
  been idle MC_KEEPALIVE_S (45 s, 0 = off). MC_WARM=0 turns both off (the tests do).
With `speak`, the voice is a presigned Polly URL (voice.py), signed in about 1 ms after the guard passes the words,
so it takes nothing from the budget and the guard's retry gets the room.
"""

import asyncio
import logging
import os
import re
import threading
import time
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from contextlib import asynccontextmanager
from typing import Any, TypeVar

import botocore.exceptions as boto_errors
import httpx
import openai
from pydantic import BaseModel
from strands import Agent
from strands.models import BedrockModel
from strands.models.openai import OpenAIModel

from .facts import chat_scope, debrief_checklist, moment_facts, moments, own_history, set_facts
from .guard import Rejected, check_line, check_note, check_reply
from .models import (
    ChatRequest, Debrief, DebriefRequest, GreenRoomReply, McLine, McLineDraft, McLineRequest, McNote, McNoteDraft,
    McReply, McReplyDraft, McUnavailable, MomentLine,
)
from .personas import ACTS, system_prompt
from . import voice
from .sigv4 import BedrockSigV4

log = logging.getLogger(__name__)

PROVIDERS = ("mantle", "converse")
# GLM-5 won the 2026-10-11 comparison on this endpoint (grammar, persona voice, guard pass rate, cards < 1 s).
DEFAULT_MODEL = {"mantle": "zai.glm-5", "converse": "anthropic.claude-opus-5-5"}
# Debrief and green room: the TV shows the cut sheet at once and the MC's words when they arrive.
TIMEOUT_S = float(os.environ.get("MC_TIMEOUT_S", "8"))
# Title cards land on screen during a set, so they get a shorter budget; a late card simply never shows.
LINE_TIMEOUT_S = float(os.environ.get("MC_LINE_TIMEOUT_S", "3.5"))
MAX_TOKENS = 1000

Req = TypeVar("Req", DebriefRequest, ChatRequest, McLineRequest)
Draft = TypeVar("Draft", bound=BaseModel)
Out = TypeVar("Out", bound=BaseModel)


def provider() -> str:
    p = os.environ.get("MC_PROVIDER", "mantle").strip().lower()
    if p not in PROVIDERS:
        raise ValueError(f"MC_PROVIDER must be one of {PROVIDERS}, not {p!r}")
    return p


def model_id() -> str:
    return os.environ.get("MC_MODEL_ID") or DEFAULT_MODEL[provider()]


def region() -> str:
    return os.environ.get("MC_REGION") or os.environ.get("AWS_REGION") or "ap-south-1"


def model_params() -> dict:
    """Generation settings; reasoning models spend tokens thinking first, so they get room and low effort."""
    mid = model_id()
    if mid.startswith("openai.gpt-oss"):
        return {"max_tokens": 4000, "reasoning_effort": "low"}
    return {"max_tokens": MAX_TOKENS, "temperature": 0.7}


def mantle_base_url(r: str) -> str:
    return f"https://bedrock-mantle.{r}.api.aws/v1"


# --- one lasting loop and one lasting client per region ------------------------------------------

# A pooled connection may sit idle this long; the keep-alive touches it well before (every MC_KEEPALIVE_S, 45 s).
KEEPALIVE_EXPIRY_S = 150.0
# The client's own timeout, for calls made without a budget (warm-up, keep-alive); each request sets its own.
DEFAULT_HTTP_TIMEOUT_S = 10.0

_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()
_clients: dict[str, openai.AsyncOpenAI] = {}
_clients_lock = threading.Lock()
# When a model call last used the connection (requests, warm-up and keep-alive alike).
_last_call = 0.0


def _event_loop() -> asyncio.AbstractEventLoop:
    """The one asyncio loop every model call runs on, on its own daemon thread. A client's connections belong to the
    loop that opened them, so a lasting loop is what lets them outlive a request."""
    global _loop
    with _loop_lock:
        if _loop is None or _loop.is_closed():
            loop = asyncio.new_event_loop()
            threading.Thread(target=loop.run_forever, name="mc-model-loop", daemon=True).start()
            _loop = loop
        return _loop


class _RetryConnection(httpx.AsyncBaseTransport):
    """Sends a request once more, at once, when its connection failed before any answer arrived (a pooled connection
    the far end had closed, a reset, a refused connect). The SDK's own retry would back off first, and also retries
    timeouts and server errors, which belong to the budget. Timeouts are never retried here."""

    RETRY = (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError, httpx.WriteError)

    def __init__(self, inner: httpx.AsyncBaseTransport) -> None:
        self._inner = inner

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        try:
            return await self._inner.handle_async_request(request)
        except self.RETRY as err:
            name = type(err).__name__
            log.info("model connection failed before an answer (%s); sending again on a new connection", name)
            return await self._inner.handle_async_request(request)

    async def aclose(self) -> None:
        await self._inner.aclose()


def _transport() -> httpx.AsyncBaseTransport:
    """The pooled HTTPS transport under the model client; the tests put a mock here."""
    limits = httpx.Limits(max_connections=16, max_keepalive_connections=8, keepalive_expiry=KEEPALIVE_EXPIRY_S)
    return httpx.AsyncHTTPTransport(limits=limits)


def _http_client(r: str) -> httpx.AsyncClient:
    """Every request SigV4-signed by botocore (one signer per region, so the credentials are resolved once and refresh
    themselves); a failed connection is retried once."""
    return httpx.AsyncClient(
        auth=BedrockSigV4(r), timeout=httpx.Timeout(DEFAULT_HTTP_TIMEOUT_S), transport=_RetryConnection(_transport())
    )


def _client(r: str) -> openai.AsyncOpenAI:
    """One OpenAI client per region for the life of the process; requests take copies with their own timeout
    (`with_options`), which share its connection pool."""
    with _clients_lock:
        if r not in _clients:
            # "unused" only fills the SDK's Bearer header, which the signer replaces with SigV4. No SDK retries:
            # _RetryConnection retries a failed connection, and the budget owns everything else.
            _clients[r] = openai.AsyncOpenAI(
                base_url=mantle_base_url(r), api_key="unused", http_client=_http_client(r), max_retries=0
            )
        return _clients[r]


@asynccontextmanager
async def _model(timeout_s: float) -> AsyncIterator[Any]:
    """The Strands model for this request. For mantle it uses the region's lasting client with this request's HTTP
    timeout, which bounds a call the budget already gave up on; the client stays open for the next request."""
    if provider() == "converse":
        yield BedrockModel(model_id=model_id(), region_name=region(), max_tokens=MAX_TOKENS)
        return
    client = _client(region()).with_options(timeout=httpx.Timeout(timeout_s))
    yield OpenAIModel(client=client, model_id=model_id(), params=model_params())


async def _ask(
    kind: str, system: str, prompt: str, out: type[Out], check: Callable[[Out], Draft], deadline: float, reminder: str = ""
) -> Draft:
    """Ask once; if the guard rejects the answer and there is time for another call as slow as the first,
    ask once more with the reason (and the request's checklist, `reminder`), in the same conversation."""
    global _last_call
    async with _model(max(deadline - time.monotonic(), 0.5) + 1.5) as model:
        agent = Agent(model=model, system_prompt=system, callback_handler=None)
        message = prompt
        for attempt in (1, 2):
            start = _last_call = time.monotonic()
            try:
                result = await agent.invoke_async(message, structured_output_model=out)
            finally:
                _last_call = time.monotonic()
            took = time.monotonic() - start
            usage = result.metrics.accumulated_usage
            log.info(
                "%s model call %d: %s %s in %.2fs, tokens in=%s out=%s (running totals)",
                kind, attempt, provider(), model_id(), took, usage.get("inputTokens"), usage.get("outputTokens"),
            )
            value = result.structured_output
            if not isinstance(value, out):
                raise ValueError(f"the model returned no structured {out.__name__}")
            try:
                return check(value)
            except Rejected as err:
                left = deadline - time.monotonic()
                if attempt == 2 or left < took * 1.1:
                    raise
                log.info("%s: answer rejected (%s); asking again with %.1fs left", kind, err, left)
                message = f"That answer was rejected by the honesty check: {err}. Write it again, following every rule."
                if reminder:
                    message += f"\n{reminder}"
    raise AssertionError("unreachable")


def _run(
    kind: str, system: str, prompt: str, out: type[Out], check: Callable[[Out], Draft], deadline: float, reminder: str = ""
) -> Draft:
    """The request's model calls, on the lasting loop. Past the deadline (when _answer has already said "timeout")
    the call is cancelled, so it stops holding a connection."""
    provider()  # a bad MC_PROVIDER fails before any network call
    future = asyncio.run_coroutine_threadsafe(_ask(kind, system, prompt, out, check, deadline, reminder), _event_loop())
    try:
        return future.result(timeout=max(deadline - time.monotonic(), 0.0) + 0.1)
    except FutureTimeout:
        future.cancel()
        raise


def _ai_note(req: DebriefRequest, deadline: float) -> McNoteDraft:
    known = set_facts(req.scorecard, req.history, req.venue, moments(req.reactions, req.lines), req.reactions)
    # The checklist leads, so the house rule's direction and a words-off set's "not measured" sentence are the first
    # thing read (QA 2026-10-12: a words-off debrief failed on each in turn and the MC was silent).
    checklist = debrief_checklist(req.scorecard, req.venue, req.reactions)
    prompt = (
        f"The {req.act} {ACTS[req.act].unit} just ended.\n{checklist}\n\nMeasured facts:\n{known}\n\n"
        f"The full payload (JSON):\n{req.model_dump_json(indent=1)}"
    )
    system = system_prompt(req.persona, req.act, req.venue, req.performer, kind="debrief")
    return _run("debrief", system, prompt, Debrief, lambda out: check_note(out, req), deadline, checklist)


def _ai_reply(req: ChatRequest, deadline: float) -> McReplyDraft:
    last = req.last_scorecard or (req.history[-1].scorecard if req.history else None)
    act = last.act if last else "standup"
    earlier = req.history[:-1] if req.last_scorecard is None else req.history
    known = (
        f"Measured facts for their last {ACTS[act].unit}:\n{set_facts(last, earlier)}\n{chat_scope(last)}"
        if last
        else "No set has been measured yet: do not quote any numbers."
    )
    prompt = (
        f"{req.performer} asks: {req.question!r}\n{known}\n\n"
        f"Their last scorecard and history (JSON):\n{req.model_dump_json(indent=1)}"
    )
    system = system_prompt(req.persona, act, last.venue if last else None, req.performer, kind="chat")
    return _run("chat", system, prompt, GreenRoomReply, lambda out: check_reply(out, req), deadline)


def _ai_line(req: McLineRequest, deadline: float) -> McLineDraft:
    prompt = f"Moment: {req.moment}. Facts:\n{moment_facts(req)}"
    system = system_prompt(req.persona, req.act, req.venue, req.performer, kind="line", moment=req.moment)
    return _run(f"line/{req.moment}", system, prompt, MomentLine, lambda out: check_line(out, req), deadline)


# --- failures -----------------------------------------------------------------------------------

NO_CREDENTIALS = (
    boto_errors.NoCredentialsError, boto_errors.PartialCredentialsError, boto_errors.CredentialRetrievalError,
    boto_errors.TokenRetrievalError, boto_errors.UnauthorizedSSOTokenError, boto_errors.SSOTokenLoadError,
    boto_errors.LoginError, boto_errors.LoginRefreshRequired, boto_errors.LoginTokenLoadError,
    boto_errors.NoAuthTokenError,
)
UNREACHABLE = (openai.APIConnectionError, httpx.TransportError, boto_errors.EndpointConnectionError, boto_errors.ConnectionError)
TIMEOUTS = (openai.APITimeoutError, httpx.TimeoutException, boto_errors.ConnectTimeoutError, boto_errors.ReadTimeoutError)
EXPIRED = re.compile(r"expired|security token|ExpiredToken|UnrecognizedClient", re.I)


def _chain(err: BaseException) -> list[BaseException]:
    seen: list[BaseException] = []
    while err is not None and err not in seen:
        seen.append(err)
        err = err.__cause__ or err.__context__
    return seen


def _short(err: BaseException) -> str:
    return f"{type(err).__name__}: {str(err)[:180]}".strip().rstrip(":")


def classify(err: BaseException) -> McUnavailable:
    """Map a failure to the reason the TV shows. Details are error messages, never credentials."""
    chain = _chain(err)
    for e in chain:
        if isinstance(e, Rejected):
            return McUnavailable(reason="rejected", detail=str(e))
    for e in chain:
        if isinstance(e, NO_CREDENTIALS):
            return McUnavailable(reason="no-credentials", detail=type(e).__name__)
        if isinstance(e, openai.AuthenticationError) or (isinstance(e, openai.PermissionDeniedError) and EXPIRED.search(str(e))):
            return McUnavailable(reason="no-credentials", detail=_short(e))
        if isinstance(e, boto_errors.ClientError) and EXPIRED.search(e.response.get("Error", {}).get("Code", "")):
            return McUnavailable(reason="no-credentials", detail=_short(e))
    for e in chain:
        if isinstance(e, TIMEOUTS):
            return McUnavailable(reason="timeout", detail=_short(e))
        if isinstance(e, UNREACHABLE):
            return McUnavailable(reason="unreachable", detail=_short(e))
    return McUnavailable(reason="model-error", detail=_short(err))


_pool = ThreadPoolExecutor(max_workers=8)


# The answers read by the persona's premium engine, with neural as the fallback: the debrief and green-room screens
# already show "writing…", and the TV preloads the intro before the performer needs it. Other lines are neural.
PREMIUM_KINDS = ("debrief", "chat", "line/intro")
# How long an answer may wait for the boot's voice check (DescribeVoices) if it is still running; afterwards, never.
VOICE_WAIT_S = 1.0


def _voice(kind: str, text: str, persona: str, deadline: float) -> Any:
    """The model's own guard-checked words as a presigned Polly URL, or None (words without audio) when no voice can be
    signed. Signing is local and takes about 1 ms; the TV streams the audio from Polly, so the voice costs the
    budget nothing."""
    wait = min(VOICE_WAIT_S, max(deadline - time.monotonic(), 0.0))
    try:
        audio = voice.sign(text, persona, kind in PREMIUM_KINDS, region(), wait=wait)
    except Exception as err:  # noqa: BLE001 - a voice that cannot be signed never costs the words
        log.warning("%s: the voice could not be signed (%s); words without audio", kind, _short(err))
        return None
    if audio is None:
        name = voice.voice_for(persona)
        log.warning("%s: no Polly engine is known for %s's voice %s; words without audio", kind, persona, name)
    else:
        # Never the URL: it is a credential for 600 s.
        fallback = " with a neural fallback" if audio.fallback_url else ""
        log.info("%s: voice %s on %s%s, %d characters", kind, audio.voice, audio.engine, fallback, len(text))
    return audio


def _answer(
    kind: str, ai: Callable[[Req, float], Draft], req: Req, key: str, wire: type[BaseModel], timeout_s: float, say: str
) -> dict:
    """Exactly one of {key: answer} or {"unavailable": {...}}. Never raises. With `speak`, the answer also carries the
    `say` field (the guard-checked words) as a presigned Polly URL."""
    deadline = time.monotonic() + timeout_s
    future = _pool.submit(ai, req, deadline)
    try:
        draft = future.result(timeout=timeout_s)
    except FutureTimeout:
        gone = McUnavailable(reason="timeout", detail=f"no answer within {timeout_s:g} s")
    except Exception as err:  # noqa: BLE001 - any failure becomes an honest "unavailable", never a substitute line
        gone = classify(err)
    else:
        log.info("%s answered by the model (%s)", kind, req.persona)
        answer = wire(**draft.model_dump(by_alias=False), source="ai")
        if req.speak:
            answer.audio = _voice(kind, getattr(draft, say), req.persona, deadline)
        return {key: answer.model_dump(exclude_none=True)}
    log.warning("%s: MC unavailable (%s: %s)", kind, gone.reason, gone.detail)
    return {"unavailable": gone.model_dump(exclude_none=True)}


def _own(req: Req) -> Req:
    """The request with only the performer's own past sets in its history (the whole payload goes into the prompt)."""
    mine = own_history(req.history, req.performer)
    return req if len(mine) == len(req.history) else req.model_copy(update={"history": mine})


def debrief(req: DebriefRequest) -> dict:
    return _answer("debrief", _ai_note, _own(req), "note", McNote, TIMEOUT_S, say="spoken")


def chat(req: ChatRequest) -> dict:
    return _answer("chat", _ai_reply, _own(req), "reply", McReply, TIMEOUT_S, say="spoken")


def line(req: McLineRequest) -> dict:
    return _answer(f"line/{req.moment}", _ai_line, _own(req), "line", McLine, LINE_TIMEOUT_S, say="text")


# --- warm at boot, and kept warm -----------------------------------------------------------------

# A 5-token keep-alive goes out when the model's connection has been idle this long (0 = never). Load balancers
# commonly drop idle connections after 60 s, and the client keeps them KEEPALIVE_EXPIRY_S.
KEEPALIVE_S = float(os.environ.get("MC_KEEPALIVE_S", "45"))
TICK_S = 5.0  # how often the keep-alive thread looks at the clock
WARM_TIMEOUT_S = 10.0

_started = False
_start_lock = threading.Lock()
_stop = threading.Event()
# Whether the last keep-alive and the last signer renewal worked: a failure is logged once, not every tick.
_healthy = {"keep-alive": True, "renewal": True}


def _mantle() -> bool:
    try:
        return provider() == "mantle"
    except ValueError:
        return False  # every request reports the bad MC_PROVIDER


async def _touch(timeout_s: float) -> None:
    """The smallest real model request (5 tokens) on the region's lasting client: it resolves the credentials and
    opens the HTTPS connection, or keeps it open. Its words are discarded; nothing reaches a screen."""
    global _last_call
    client = _client(region()).with_options(timeout=httpx.Timeout(timeout_s))
    _last_call = time.monotonic()
    try:
        await client.chat.completions.create(
            model=model_id(), messages=[{"role": "user", "content": "Say OK."}], max_tokens=5
        )
    finally:
        _last_call = time.monotonic()


def _touch_model(timeout_s: float = WARM_TIMEOUT_S) -> float:
    """Run `_touch` on the lasting loop; returns how long it took."""
    start = time.monotonic()
    future = asyncio.run_coroutine_threadsafe(_touch(timeout_s), _event_loop())
    try:
        future.result(timeout=timeout_s + 1.0)
    except FutureTimeout:
        future.cancel()
        raise
    return time.monotonic() - start


def warm_up() -> None:
    """Get ready what a first request needs, in parallel: the model's connection (mantle) and the voices."""
    voices = _pool.submit(voice.warm, region())
    if _mantle():
        try:
            took = _touch_model()
            log.info("warm-up: model connection open (%s, %s) in %.2fs", model_id(), region(), took)
        except Exception as err:  # noqa: BLE001 - each request still tries on its own
            log.warning("warm-up: the model did not answer (%s)", _short(err))
    try:
        log.info("warm-up: voices %s", voices.result(timeout=WARM_TIMEOUT_S))
    except Exception as err:  # noqa: BLE001
        log.warning("warm-up: the voices are not ready (%s)", _short(err))


def _report(what: str, err: BaseException | None) -> None:
    if err is not None and _healthy[what]:
        log.warning("%s failed (%s); logged again only once it recovers", what, _short(err))
    elif err is None and not _healthy[what]:
        log.info("%s works again", what)
    _healthy[what] = err is None


def tick() -> None:
    """One look by the keep-alive: touch the model's connection when it has been idle KEEPALIVE_S, and let the voice
    retry failed checks and renew its signer before an answer has to."""
    if KEEPALIVE_S > 0 and _mantle() and time.monotonic() - _last_call >= KEEPALIVE_S:
        try:
            _touch_model()
        except Exception as err:  # noqa: BLE001 - reported once
            _report("keep-alive", err)
        else:
            _report("keep-alive", None)
    try:
        voice.renew(region())
    except Exception as err:  # noqa: BLE001 - reported once; the next answer tries again
        _report("renewal", err)
    else:
        _report("renewal", None)


def _warm_then_keep_alive(stop: threading.Event) -> None:
    try:
        warm_up()
    except Exception as err:  # noqa: BLE001 - the requests report a bad configuration
        log.warning("warm-up failed (%s)", _short(err))
    while not stop.wait(TICK_S):
        try:
            tick()
        except Exception as err:  # noqa: BLE001 - the thread must outlive one bad look
            log.warning("keep-alive failed (%s)", _short(err))


def start() -> bool:
    """Warm the service in the background and keep it warm until `_stop` is set. Idempotent; True when this call
    started it."""
    global _started
    with _start_lock:
        if _started:
            return False
        _started = True
    threading.Thread(target=_warm_then_keep_alive, args=(_stop,), name="mc-warm", daemon=True).start()
    return True


# app.serve imports this module before it starts serving (a forwarder never imports it), so the warm-up begins at boot.
if os.environ.get("MC_WARM", "1") != "0":
    start()
