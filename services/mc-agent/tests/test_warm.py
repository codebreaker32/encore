"""The warm service, offline: one lasting loop and one lasting model client per region, one immediate retry on a
failed connection (never on a timeout), per-request timeouts, the boot warm-up and the keep-alive. The model is a
mock transport under the real client; Polly is the fake in fakes.py."""

import asyncio
import json
import logging
import threading
import time

import httpx
import pytest

from fakes import FakePolly, install_polly, sse
from mc_agent import mc as mc_module
from mc_agent import voice
from payloads import chat_req, debrief_req, line_req

AKID, SECRET, TOKEN = "AKIDWARMEXAMPLE", "warmSecretEXAMPLEKEY0123456789abcdefghij", "FwoGZXIvYXdzWARMTOKEN"
NOTE = {"headline": "5 of 8.", "line": "5 of 8 landed; 4.1 s at 2:05.", "fix": "Cut the gap at 2:05 under 2 s.",
        "spoken": "Five of eight landed.", "next": "again"}

COMPLETION = {"id": "c0", "object": "chat.completion", "created": 0, "model": "zai.glm-5",
              "choices": [{"index": 0, "message": {"role": "assistant", "content": "OK"}, "finish_reason": "length"}],
              "usage": {"prompt_tokens": 9, "completion_tokens": 5, "total_tokens": 14}}


class Mantle:
    """A queue of answers (bytes, a dict for a plain completion, or an exception to raise), and what was sent."""

    def __init__(self):
        self.answers: list = []
        self.seen: list[httpx.Request] = []
        self.threads: list[str] = []
        self.transports = 0

    def transport(self) -> httpx.MockTransport:
        self.transports += 1
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        self.threads.append(threading.current_thread().name)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        if isinstance(answer, dict):
            return httpx.Response(200, json=answer)
        return httpx.Response(200, content=answer, headers={"content-type": "text/event-stream"})


@pytest.fixture
def mantle(monkeypatch):
    for name in ("MC_PROVIDER", "MC_MODEL_ID", "MC_REGION", "AWS_REGION", "AWS_PROFILE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in (("AWS_ACCESS_KEY_ID", AKID), ("AWS_SECRET_ACCESS_KEY", SECRET), ("AWS_SESSION_TOKEN", TOKEN)):
        monkeypatch.setenv(name, value)
    fake = Mantle()
    monkeypatch.setattr(mc_module, "_clients", {})
    monkeypatch.setattr(mc_module, "_transport", fake.transport)
    return fake


@pytest.fixture
def polly(monkeypatch):
    yield install_polly(monkeypatch)
    voice.CATALOG.close()  # checks a test never waited for finish before the next test starts


@pytest.fixture
def info(caplog):
    caplog.set_level(logging.INFO, logger="mc_agent")
    return caplog


def test_every_request_shares_one_loop_and_one_client(mantle):
    mantle.answers += [sse("Debrief", NOTE), sse("MomentLine", {"text": "Bit 3 closed with 2 laughs."}),
                       sse("GreenRoomReply", {"text": "Not yet: 5 of 8 landed.", "spoken": "Not yet."})]
    assert mc_module.debrief(debrief_req())["note"]["source"] == "ai"
    client = mc_module._clients["ap-south-1"]
    assert mc_module.line(line_req())["line"]["text"] == "Bit 3 closed with 2 laughs."
    assert mc_module.chat(chat_req())["reply"]["source"] == "ai"
    assert mc_module._clients == {"ap-south-1": client} and mantle.transports == 1
    assert mantle.threads == ["mc-model-loop"] * 3  # the lasting loop's thread, not a fresh asyncio.run per request


def test_each_request_carries_its_own_timeout(mantle):
    mantle.answers += [sse("Debrief", NOTE), sse("MomentLine", {"text": "Bit 3 closed with 2 laughs."})]
    mc_module.debrief(debrief_req())
    mc_module.line(line_req())
    debrief, line = (r.extensions["timeout"]["read"] for r in mantle.seen)
    assert mc_module.TIMEOUT_S < debrief <= mc_module.TIMEOUT_S + 1.5  # what is left of the budget, plus 1.5 s
    assert mc_module.LINE_TIMEOUT_S < line <= mc_module.LINE_TIMEOUT_S + 1.5


def test_a_failed_connection_is_sent_again_at_once(mantle, info):
    stale = httpx.RemoteProtocolError("Server disconnected without sending a response.")  # a pooled connection gone
    mantle.answers += [stale, sse("Debrief", NOTE)]
    start = time.monotonic()
    out = mc_module.debrief(debrief_req())
    assert out["note"]["source"] == "ai" and len(mantle.seen) == 2
    assert time.monotonic() - start < 1.0  # no back-off before the retry
    assert "sending again on a new connection" in info.text


def test_a_connection_is_retried_only_once(mantle):
    mantle.answers.append(httpx.ConnectError("connection refused"))
    out = mc_module.line(line_req())
    assert out["unavailable"]["reason"] == "unreachable" and len(mantle.seen) == 2


def test_timeouts_are_never_retried(mantle):
    mantle.answers.append(httpx.ReadTimeout("read timed out"))
    out = mc_module.line(line_req())
    assert out["unavailable"]["reason"] == "timeout" and len(mantle.seen) == 1


def test_a_call_past_its_budget_is_cancelled(mantle, monkeypatch):
    """When _answer has given up, the model call is cancelled instead of holding a connection until its HTTP timeout."""
    cancelled = threading.Event()
    real_ask = mc_module._ask

    async def slow_ask(*args):
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            cancelled.set()
            raise
        return await real_ask(*args)

    monkeypatch.setattr(mc_module, "_ask", slow_ask)
    monkeypatch.setattr(mc_module, "LINE_TIMEOUT_S", 0.2)
    assert mc_module.line(line_req()) == {"unavailable": {"reason": "timeout", "detail": "no answer within 0.2 s"}}
    assert cancelled.wait(2)


def test_warm_up_makes_one_5_token_completion_and_checks_the_voices(mantle, polly, info):
    mantle.answers.append(COMPLETION)
    before = time.monotonic()
    mc_module.warm_up()
    assert len(mantle.seen) == 1
    request = mantle.seen[0]
    body = json.loads(request.content)
    assert str(request.url) == "https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions"
    assert body["max_tokens"] == 5 and body["model"] == "zai.glm-5" and not body.get("stream")
    assert request.headers["authorization"].startswith(f"AWS4-HMAC-SHA256 Credential={AKID}/")  # credentials resolved
    assert (polly["ap-south-1"].described, polly["ap-southeast-1"].described, polly["us-east-1"].described) == (
        ["neural"], ["generative"], ["long-form"])
    assert mc_module._last_call >= before
    assert "warm-up: model connection open (zai.glm-5, ap-south-1)" in info.text
    assert "warm-up: voices warm Kajal generative+neural" in info.text


def test_a_failed_warm_up_is_only_logged(mantle, polly, caplog):
    mantle.answers.append(httpx.ConnectError("no route"))
    mc_module.warm_up()
    assert "warm-up: the model did not answer" in caplog.text


def test_the_keep_alive_touches_the_connection_only_when_idle(mantle, polly, monkeypatch):
    mantle.answers.append(COMPLETION)
    monkeypatch.setattr(mc_module, "_last_call", time.monotonic() - mc_module.KEEPALIVE_S - 1)
    mc_module.tick()
    assert len(mantle.seen) == 1 and json.loads(mantle.seen[0].content)["max_tokens"] == 5
    mc_module.tick()  # just used
    assert len(mantle.seen) == 1
    monkeypatch.setattr(mc_module, "_last_call", time.monotonic() - 30)
    mc_module.tick()
    assert len(mantle.seen) == 1
    monkeypatch.setattr(mc_module, "KEEPALIVE_S", 0.0)  # off
    monkeypatch.setattr(mc_module, "_last_call", 0.0)
    mc_module.tick()
    assert len(mantle.seen) == 1


def test_a_request_counts_as_use(mantle, polly, monkeypatch):
    mantle.answers += [sse("MomentLine", {"text": "Bit 3 closed with 2 laughs."}), COMPLETION]
    monkeypatch.setattr(mc_module, "_last_call", 0.0)
    mc_module.line(line_req())
    mc_module.tick()
    assert len(mantle.seen) == 1


def test_a_failing_keep_alive_is_logged_once(mantle, polly, monkeypatch, info):
    monkeypatch.setattr(mc_module, "_healthy", {"keep-alive": True, "renewal": True})
    mantle.answers.append(httpx.ConnectError("no route"))
    for _ in range(3):
        monkeypatch.setattr(mc_module, "_last_call", 0.0)
        mc_module.tick()
    assert info.text.count("keep-alive failed") == 1
    mantle.answers[:] = [COMPLETION]
    monkeypatch.setattr(mc_module, "_last_call", 0.0)
    mc_module.tick()
    assert "keep-alive works again" in info.text


def test_the_keep_alive_also_retries_voice_checks(mantle, polly, monkeypatch):
    polly["ap-southeast-1"] = fake = FakePolly("ap-southeast-1")
    fake.fail = RuntimeError("down")
    monkeypatch.setattr(mc_module, "_last_call", time.monotonic())
    assert voice.CATALOG.check("ap-southeast-1", "generative").exception(5) is fake.fail
    monkeypatch.setattr(voice, "RETRY_S", 0.0)
    fake.fail = None
    mc_module.tick()
    voice.CATALOG.check("ap-southeast-1", "generative").result(5)
    assert voice.CATALOG.has("ap-southeast-1", "generative", "Matthew")


def test_start_warms_in_the_background_once(monkeypatch):
    assert mc_module._started is False  # MC_WARM=0 (conftest): importing the module started nothing
    warmed, ticked = threading.Event(), threading.Event()
    monkeypatch.setattr(mc_module, "_started", False)
    monkeypatch.setattr(mc_module, "_stop", threading.Event())
    monkeypatch.setattr(mc_module, "TICK_S", 0.01)
    monkeypatch.setattr(mc_module, "warm_up", warmed.set)
    monkeypatch.setattr(mc_module, "tick", ticked.set)
    try:
        assert mc_module.start() is True and mc_module.start() is False
        assert warmed.wait(2) and ticked.wait(2)
    finally:
        mc_module._stop.set()


def test_a_bad_provider_never_kills_the_keep_alive(monkeypatch, caplog):
    monkeypatch.setenv("MC_PROVIDER", "nope")
    monkeypatch.setattr(voice, "renew", lambda region: None)
    caplog.set_level(logging.WARNING)
    mc_module.tick()  # no keep-alive for a provider the requests already report as wrong
    assert "keep-alive" not in caplog.text
