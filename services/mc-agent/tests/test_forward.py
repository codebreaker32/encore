"""Forwarding mode (MC_BACKEND=agentcore), offline: botocore's Stubber checks every call against the AgentCore
service model, fake clients raise the transport errors, and fake credentials prove no secret leaks."""

import io
import json
import logging
import re
import runpy
import subprocess
import sys
import threading
import time
from pathlib import Path

import boto3
import botocore.exceptions as boto_errors
import pytest
from botocore.response import StreamingBody
from botocore.stub import ANY, Stubber
from pydantic import ValidationError
from starlette.testclient import TestClient

from mc_agent import app as app_module
from mc_agent import forward
from mc_agent import mc as mc_module
from mc_agent.models import McLineDraft, McNoteDraft, McReplyDraft, parse_request
from payloads import chat_payload, debrief_payload, line_payload

AKID, SECRET, TOKEN = "AKIDEXAMPLEFORWARD", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYFORWARDKEY", "FwoGZXIvYXdzFORWARDTOKEN"
ARN = "arn:aws:bedrock-agentcore:ap-south-1:911167912118:runtime/encore_mc-AbC123xyz9"
SESSION = "encore-tv-test-" + "0123456789abcdef" * 2
REPO = Path(__file__).resolve().parents[3]
DEPLOY = Path(__file__).resolve().parents[1] / "deploy"
# The voice as the runtime sends it (a presigned Polly URL; nothing secret in this fake one). The forwarder checks only
# that it is an object, so a runtime one voice format behind (base64) still delivers its words.
AUDIO = {"format": "mp3", "url": "https://polly.ap-south-1.amazonaws.com/v1/speech?Engine=neural", "voice": "Kajal",
         "engine": "neural"}
OLD_AUDIO = {"format": "mp3", "base64": "SUQzBAAAAAAAI1RTU0U=", "voice": "Kajal"}

NOTE = {"headline": "5 of 8. I counted.", "line": "5 of 8 landed; 4.1 s of nothing at 2:05.",
        "fix": "Cut the gap under 2 s.", "spoken": "Five of eight landed.", "next": "again", "source": "ai"}
REPLY = {"text": "Not yet: 5 of 8.", "spoken": "Not yet. Five of eight.", "source": "ai"}
LINE = {"text": "The Basement, five minutes, Priyanka. Go.", "source": "ai"}


def wire(body: dict) -> bytes:
    """What BedrockAgentCoreApp sends for a dict answer (json.dumps, ensure_ascii=False, UTF-8)."""
    return json.dumps(body, ensure_ascii=False).encode("utf-8")


def stub_client():
    session = boto3.Session(aws_access_key_id=AKID, aws_secret_access_key=SECRET, aws_session_token=TOKEN)
    client = forward.make_client("ap-south-1", session=session)
    return client, Stubber(client)


def ok(data: bytes) -> dict:
    return {"response": StreamingBody(io.BytesIO(data), len(data)), "contentType": "application/json",
            "runtimeSessionId": SESSION, "statusCode": 200}


def expected(payload) -> dict:
    return {"agentRuntimeArn": ARN, "qualifier": "DEFAULT", "runtimeSessionId": SESSION, "contentType": "application/json",
            "accept": "application/json", "payload": wire(payload), "traceId": ANY}


TARGET = forward.Target(arn=ARN, region="ap-south-1", qualifier="DEFAULT", session_id=SESSION, own_session=True)


class FakeClient:
    """Answers or raises like the boto3 client; records calls."""

    def __init__(self, answer: bytes = b"", error: BaseException | None = None, delay: float = 0.0):
        self.answer, self.error, self.delay = answer, error, delay
        self.calls: list[dict] = []
        self.stopped: list[dict] = []
        self.release = threading.Event()

    def invoke_agent_runtime(self, **kwargs):
        self.calls.append(kwargs)
        if self.delay:
            self.release.wait(self.delay)
        if self.error is not None:
            raise self.error
        return ok(self.answer)

    def stop_runtime_session(self, **kwargs):
        self.stopped.append(kwargs)
        return {"runtimeSessionId": kwargs["runtimeSessionId"], "statusCode": 200}


@pytest.fixture
def agentcore(monkeypatch):
    """MC_BACKEND=agentcore with a forwarder the test provides; the model must never be called."""
    monkeypatch.setenv("MC_BACKEND", "agentcore")

    def no_model(req, deadline):
        raise AssertionError("the forwarder must not call the model itself")

    for name in ("_ai_note", "_ai_reply", "_ai_line"):
        monkeypatch.setattr(mc_module, name, no_model)

    def use(client) -> forward.Forwarder:
        fwd = forward.Forwarder(TARGET, client)
        forward.install(fwd)
        return fwd

    yield use
    forward.install(None)


def body_of(result) -> bytes:
    return result.body if hasattr(result, "body") else wire(result)


# --- the runtime's answers pass through byte for byte ------------------------------------------


@pytest.mark.parametrize("payload, answer", [
    (line_payload("intro", persona="warm"), {"line": {**LINE, "audio": AUDIO}}),
    (line_payload("between"), {"line": LINE}),
    (line_payload("end"), {"line": {**LINE, "audio": OLD_AUDIO}}),
    (debrief_payload(persona="strict"), {"note": {**NOTE, "audio": {**AUDIO, "voice": "Stephen", "engine": "generative"}}}),
    (chat_payload(persona="deadpan"), {"reply": REPLY}),
    (line_payload("end"), {"unavailable": {"reason": "timeout", "detail": "no answer within 3.5 s"}}),
    (chat_payload(), {"unavailable": {"reason": "rejected", "detail": "it quotes '47'"}}),
])
def test_each_kind_passes_through_unchanged(agentcore, payload, answer):
    client, stub = stub_client()
    data = wire(answer)
    stub.add_response("invoke_agent_runtime", ok(data), expected({**payload, "speak": True}))
    agentcore(client)
    with stub:
        result = app_module.invoke({**payload, "speak": True})
        stub.assert_no_pending_responses()
    assert result.body == data and result.status_code == 200 and result.media_type == "application/json"


def test_forwarded_bytes_equal_the_local_service_bytes(agentcore, monkeypatch):
    """Over HTTP the TV gets the same bytes and headers from both backends."""
    payload = line_payload("intro", persona="warm")
    monkeypatch.setenv("MC_BACKEND", "local")
    monkeypatch.setattr(mc_module, "_ai_line", lambda req, deadline: McLineDraft(text="The Basement – go, Priyanka."))
    with TestClient(app_module.app) as tv:
        local = tv.post("/invocations", json=payload)
        client, stub = stub_client()
        stub.add_response("invoke_agent_runtime", ok(local.content), expected(payload))
        monkeypatch.setenv("MC_BACKEND", "agentcore")
        agentcore(client)
        with stub:
            remote = tv.post("/invocations", json=payload)
    assert json.loads(local.content)["line"]["text"] == "The Basement – go, Priyanka."
    assert remote.status_code == local.status_code == 200
    assert remote.content == local.content and remote.headers["content-type"] == local.headers["content-type"]


def test_an_invalid_request_is_never_forwarded(agentcore):
    client, stub = stub_client()
    agentcore(client)
    with stub:  # no responses queued: any call would fail the test
        for bad in ({}, {"kind": "line", "moment": "intro"}, {**debrief_payload(), "persona": "cruel"}, "nope"):
            out = app_module.invoke(bad)
            assert out["error"] == "invalid-request" and out["detail"]
        stub.assert_no_pending_responses()


# --- failures become honest unavailable answers ------------------------------------------------


@pytest.mark.parametrize("code, status, reason", [
    ("AccessDeniedException", 403, "no-credentials"),
    ("ExpiredTokenException", 403, "no-credentials"),
    ("UnrecognizedClientException", 403, "no-credentials"),
    ("InvalidSignatureException", 403, "no-credentials"),
    ("ThrottlingException", 429, "unreachable"),
    ("ServiceQuotaExceededException", 402, "unreachable"),
    ("ResourceNotFoundException", 404, "unreachable"),
    ("RetryableConflictException", 409, "unreachable"),
    ("InternalServerException", 500, "unreachable"),
    ("ServiceUnavailable", 503, "unreachable"),
    ("RuntimeClientError", 424, "model-error"),
    ("RuntimeClientError", 403, "model-error"),  # a runtime that failed to start: not this host's sign-in
    ("RuntimeClientError", 500, "model-error"),
    ("ValidationException", 400, "model-error"),
    ("SomethingNew", 403, "no-credentials"),
    ("SomethingNew", 503, "unreachable"),
    ("SomethingNew", 418, "model-error"),
])
def test_agentcore_errors_map_to_reasons(agentcore, code, status, reason):
    client, stub = stub_client()
    payload = line_payload("between")
    stub.add_client_error("invoke_agent_runtime", service_error_code=code, service_message=f"{code} said no",
                          http_status_code=status, expected_params=expected(payload))
    agentcore(client)
    with stub:
        out = app_module.invoke(payload)
    assert out == {"unavailable": {"reason": reason, "detail": f"AgentCore: {code}: {code} said no"}}


URL = "https://bedrock-agentcore.ap-south-1.amazonaws.com/runtimes/x/invocations"


@pytest.mark.parametrize("error, reason", [
    (boto_errors.ReadTimeoutError(endpoint_url=URL), "timeout"),
    (boto_errors.ConnectTimeoutError(endpoint_url=URL), "timeout"),
    (boto_errors.EndpointConnectionError(endpoint_url=URL), "unreachable"),
    (boto_errors.ConnectionClosedError(endpoint_url=URL), "unreachable"),
    (boto_errors.SSLError(endpoint_url=URL, error="certificate verify failed"), "unreachable"),
    (boto_errors.ResponseStreamingError(error="connection reset"), "unreachable"),
    (boto_errors.NoCredentialsError(), "no-credentials"),
    (boto_errors.TokenRetrievalError(provider="login", error_msg="login expired"), "no-credentials"),
    (RuntimeError("something else"), "model-error"),
])
def test_transport_and_credential_failures_map_to_reasons(agentcore, error, reason):
    agentcore(FakeClient(error=error))
    for payload in (line_payload("intro"), debrief_payload(), chat_payload()):
        out = app_module.invoke(payload)
        assert list(out) == ["unavailable"] and out["unavailable"]["reason"] == reason
        detail = out["unavailable"]["detail"]
        assert detail.startswith(f"AgentCore: {type(error).__name__}") and len(detail) <= 160


def test_past_the_cutoff_the_tv_hears_timeout_before_its_own_deadline(agentcore, monkeypatch):
    monkeypatch.setattr(forward, "LINE_TIMEOUT_S", 0.2)
    monkeypatch.setattr(forward, "GRACE_S", 0.1)
    slow = FakeClient(answer=wire({"line": LINE}), delay=5)
    agentcore(slow)
    start = time.monotonic()
    out = app_module.invoke(line_payload("intro"))
    took = time.monotonic() - start
    slow.release.set()
    assert out == {"unavailable": {"reason": "timeout", "detail": "AgentCore: no answer within 0.3 s"}}
    assert 0.25 <= took < 0.2 + forward.TV_GRACE_S


@pytest.mark.parametrize("payload, data, problem", [
    (line_payload(), b"not json", "not JSON"),
    (line_payload(), b"\xff\xfe", "not JSON"),
    (line_payload(), b"[]", "not a JSON object"),
    (line_payload(), b"{}", "not a JSON object"),
    (line_payload(), wire({"line": LINE, "note": NOTE}), "unexpected keys"),
    (line_payload(), wire({"note": NOTE}), "unexpected keys ['note'] for a line request"),
    (line_payload(), wire({"line": {**LINE, "source": "fallback"}}), "not marked source 'ai'"),
    (line_payload(), wire({"line": {"text": "Bit 3 closed."}}), "not marked source 'ai'"),
    (line_payload(), wire({"line": "Bit 3 closed."}), "does not match the contract"),
    (line_payload(), wire({"line": {"text": "x" * 121, "source": "ai"}}), "does not match the contract"),
    (debrief_payload(), wire({"note": {**NOTE, "next": "sideways"}}), "does not match the contract"),
    (debrief_payload(), wire({"note": {"headline": "5 of 8.", "source": "ai"}}), "does not match the contract"),
    (chat_payload(), wire({"reply": {**REPLY, "audio": "SUQzBAAAAAAAI1RTU0U="}}), "audio that is not an object"),
    (chat_payload(), wire({"reply": {**REPLY, "text": 42}}), "does not match the contract"),
    (chat_payload(), wire({"unavailable": {"reason": "napping"}}), "does not match the contract"),
    (chat_payload(), wire({"error": "Invalid JSON", "details": "x"}), "unexpected keys"),
    (chat_payload(), wire({"result": "Hello!"}), "unexpected keys"),
])
def test_anything_but_a_contract_answer_is_a_model_error(agentcore, payload, data, problem):
    agentcore(FakeClient(answer=data))
    out = app_module.invoke(payload)
    assert list(out) == ["unavailable"] and out["unavailable"]["reason"] == "model-error"
    assert out["unavailable"]["detail"].startswith("AgentCore: the runtime's answer is") and problem in out["unavailable"]["detail"]


def test_an_invalid_request_answer_from_the_runtime_passes_through(agentcore):
    data = wire({"error": "invalid-request", "detail": [{"type": "missing", "loc": ["question"]}]})
    agentcore(FakeClient(answer=data))
    assert app_module.invoke(chat_payload()).body == data


def test_no_secret_reaches_a_detail_or_the_log(agentcore, caplog):
    caplog.set_level(logging.DEBUG)
    client, stub = stub_client()
    stub.add_client_error("invoke_agent_runtime", service_error_code="AccessDeniedException",
                          service_message="User is not authorized to perform bedrock-agentcore:InvokeAgentRuntime",
                          http_status_code=403)
    agentcore(client)
    with stub:
        out = app_module.invoke(debrief_payload())
    assert out["unavailable"]["reason"] == "no-credentials"
    for secret in (SECRET, TOKEN, AKID):
        assert secret not in json.dumps(out) and secret not in caplog.text
    assert "Priyanka" not in out["unavailable"]["detail"]  # nor the payload


def test_a_misconfigured_forwarder_is_a_model_error_not_a_crash(monkeypatch):
    monkeypatch.setenv("MC_BACKEND", "agentcore")
    monkeypatch.delenv("MC_AGENTCORE_ARN", raising=False)
    forward.install(None)
    out = app_module.invoke(line_payload())
    assert out["unavailable"]["reason"] == "model-error" and "MC_AGENTCORE_ARN" in out["unavailable"]["detail"]
    monkeypatch.setenv("MC_BACKEND", "cloud")
    out = app_module.invoke(line_payload())
    assert out["unavailable"]["reason"] == "model-error" and "MC_BACKEND" in out["unavailable"]["detail"]


# --- configuration, sessions, keep-warm -----------------------------------------------------------


def test_session_ids(monkeypatch):
    ids = {forward.new_session_id() for _ in range(3)}
    assert len(ids) == 3
    for sid in ids | {forward.new_session_id("Aman's Laptop (WSL)"), forward.new_session_id(""), forward.new_session_id("x" * 300)}:
        assert forward.SESSION.match(sid) and sid.startswith("encore-tv-") and 33 <= len(sid) <= 256
    assert forward.new_session_id("Aman's Laptop (WSL)").startswith("encore-tv-Aman-s-Laptop-WSL-")
    monkeypatch.setenv("MC_AGENTCORE_ARN", ARN)
    monkeypatch.delenv("MC_AGENTCORE_SESSION", raising=False)
    t = forward.target_from_env()
    assert (t.region, t.qualifier, t.own_session) == ("ap-south-1", "DEFAULT", True)
    fwd = forward.Forwarder(t, FakeClient(answer=wire({"line": LINE})))
    fwd.forward(line_payload(), "line")
    fwd.forward(line_payload("intro"), "line")
    assert {c["runtimeSessionId"] for c in fwd.client.calls} == {t.session_id}  # one session per process
    monkeypatch.setenv("MC_AGENTCORE_SESSION", SESSION)
    monkeypatch.setenv("MC_AGENTCORE_QUALIFIER", "beta")
    t = forward.target_from_env()
    assert (t.session_id, t.qualifier, t.own_session) == (SESSION, "beta", False)
    for bad in ("short", "x" * 257, "encore tv " + "a" * 40):
        monkeypatch.setenv("MC_AGENTCORE_SESSION", bad)
        with pytest.raises(ValueError, match="MC_AGENTCORE_SESSION"):
            forward.target_from_env()


@pytest.mark.parametrize("arn", ["", "encore_mc", "arn:aws:bedrock:ap-south-1:911167912118:runtime/x",
                                 "arn:aws:bedrock-agentcore:ap-south-1:911167912118:runtime/"])
def test_the_runtime_arn_is_required_and_checked(monkeypatch, arn):
    monkeypatch.setenv("MC_AGENTCORE_ARN", arn)
    with pytest.raises(ValueError, match="MC_AGENTCORE_ARN"):
        forward.target_from_env()


def test_us_east_1_runtime_arns_sign_for_their_own_region(monkeypatch):
    monkeypatch.setenv("MC_AGENTCORE_ARN", ARN.replace("ap-south-1", "us-east-1"))
    assert forward.target_from_env().region == "us-east-1"


def test_budgets_match_the_mc_and_the_tv():
    assert (forward.TIMEOUT_S, forward.LINE_TIMEOUT_S) == (mc_module.TIMEOUT_S, mc_module.LINE_TIMEOUT_S)
    assert 0 <= forward.GRACE_S < forward.TV_GRACE_S
    assert forward.READ_TIMEOUT_S > forward.TIMEOUT_S + forward.GRACE_S
    assert set(mc_module.NO_CREDENTIALS) <= set(forward.NO_CREDENTIALS)
    config = REPO / "packages/shared-ui/src/encore/config.ts"
    if not config.exists():
        pytest.skip("the TV's config.ts is not in this checkout")
    tv = {k: int(v) for k, v in re.findall(r"(mcTimeoutMs|mcLineTimeoutMs|mcGraceMs): (\d+)", config.read_text())}
    assert tv == {"mcTimeoutMs": forward.TIMEOUT_S * 1000, "mcLineTimeoutMs": forward.LINE_TIMEOUT_S * 1000,
                  "mcGraceMs": forward.TV_GRACE_S * 1000}


def test_the_grace_must_stay_below_the_tvs(monkeypatch):
    monkeypatch.setenv("MC_AGENTCORE_ARN", ARN)
    monkeypatch.setattr(forward, "GRACE_S", 0.75)
    with pytest.raises(ValueError, match="MC_FORWARD_GRACE_S"):
        forward.target_from_env()


def test_the_client_config():
    client, _ = stub_client()
    config = client.meta.config
    assert (config.connect_timeout, config.read_timeout) == (forward.CONNECT_TIMEOUT_S, forward.READ_TIMEOUT_S)
    assert config.retries == {"mode": "standard", "total_max_attempts": 2} and config.tcp_keepalive is True
    assert client.meta.region_name == "ap-south-1"


def test_keep_warm_is_an_invalid_request_so_no_model_call(monkeypatch):
    with pytest.raises(ValidationError):
        parse_request(json.loads(forward.KEEP_WARM_BODY))
    monkeypatch.delenv("MC_BACKEND", raising=False)

    def no_model(req, deadline):
        raise AssertionError("keep-warm must not reach the model")

    for name in ("_ai_note", "_ai_reply", "_ai_line"):
        monkeypatch.setattr(mc_module, name, no_model)
    assert app_module.invoke(json.loads(forward.KEEP_WARM_BODY))["error"] == "invalid-request"


def test_ping_and_close():
    client, stub = stub_client()
    answer = wire({"error": "invalid-request", "detail": [{"type": "union_tag_invalid"}]})
    stub.add_response("invoke_agent_runtime", ok(answer), {**expected({"kind": "keep-warm"}), "payload": forward.KEEP_WARM_BODY})
    stub.add_response("stop_runtime_session", {"runtimeSessionId": SESSION, "statusCode": 200},
                      {"agentRuntimeArn": ARN, "qualifier": "DEFAULT", "runtimeSessionId": SESSION})
    fwd = forward.Forwarder(TARGET, client)
    with stub:
        assert fwd.ping("warm-up") is True and fwd.last_call > 0
        fwd.close()
        stub.assert_no_pending_responses()
    failing = forward.Forwarder(TARGET, FakeClient(error=boto_errors.EndpointConnectionError(endpoint_url=URL)))
    assert failing.ping("keep-warm") is False
    given = forward.Forwarder(forward.Target(ARN, "ap-south-1", "DEFAULT", SESSION, own_session=False), FakeClient())
    given.close()
    assert given.client.stopped == []  # a session named in MC_AGENTCORE_SESSION may be shared: never stopped


def test_requests_wait_for_the_warm_up_instead_of_racing_it():
    """A call during the session's provisioning would get 409 "Session operation in progress"."""
    started, gate, order = threading.Event(), threading.Event(), []

    class Provisioning(FakeClient):
        def invoke_agent_runtime(self, **kwargs):
            order.append(json.loads(kwargs["payload"]).get("kind"))
            if len(order) == 1:
                started.set()
                gate.wait(5)
                return ok(wire({"error": "invalid-request", "detail": []}))
            return ok(wire({"line": LINE}))

    fwd = forward.Forwarder(TARGET, Provisioning())
    fwd.start_keep_warm(300)
    assert started.wait(2)
    out = {}
    caller = threading.Thread(target=lambda: out.update(result=fwd.forward(line_payload(), "line")))
    caller.start()
    time.sleep(0.2)
    assert order == ["keep-warm"]  # the TV's request waits for the warm-up
    gate.set()
    caller.join(5)
    fwd.close()
    assert order == ["keep-warm", "line"] and out["result"].status_code == 200


def test_serve_warms_the_session_and_stops_it(monkeypatch):
    fake = FakeClient(answer=wire({"error": "invalid-request", "detail": []}))
    fwd = forward.Forwarder(TARGET, fake)
    forward.install(fwd)
    monkeypatch.setenv("MC_BACKEND", "agentcore")
    started = threading.Event()
    monkeypatch.setattr(app_module.app, "run", lambda port, host, **kw: started.wait(2))
    fake.invoke_agent_runtime = lambda **kw: (started.set(), ok(fake.answer))[1]
    try:
        app_module.serve(port=8099)
    finally:
        forward.install(None)
    assert started.is_set() and fake.stopped and fake.stopped[0]["runtimeSessionId"] == SESSION


def test_serve_refuses_a_bad_backend_or_a_missing_arn(monkeypatch):
    monkeypatch.setattr(app_module.app, "run", lambda **kw: pytest.fail("must not start"))
    monkeypatch.setenv("MC_BACKEND", "cloud")
    with pytest.raises(ValueError, match="MC_BACKEND"):
        app_module.serve()
    monkeypatch.setenv("MC_BACKEND", "agentcore")
    monkeypatch.delenv("MC_AGENTCORE_ARN", raising=False)
    forward.install(None)
    with pytest.raises(ValueError, match="MC_AGENTCORE_ARN"):
        app_module.serve()


# --- the runtime's entry file -------------------------------------------------------------------


def test_main_binds_all_interfaces_on_8080(monkeypatch):
    seen = {}
    monkeypatch.delenv("MC_BACKEND", raising=False)
    monkeypatch.setattr(app_module.app, "run", lambda port, host, **kw: seen.update(host=host, port=port, **kw))
    runpy.run_path(str(DEPLOY / "main.py"), run_name="__main__")
    assert seen == {"host": "0.0.0.0", "port": 8080, "timeout_keep_alive": 75}


def test_main_refuses_to_forward_from_inside_the_runtime(monkeypatch):
    monkeypatch.setenv("MC_BACKEND", "agentcore")
    monkeypatch.setattr(app_module.app, "run", lambda **kw: pytest.fail("must not start"))
    with pytest.raises(SystemExit, match="MC_BACKEND"):
        runpy.run_path(str(DEPLOY / "main.py"), run_name="__main__")


def test_a_forwarder_never_loads_strands_or_openai():
    code = ("import os, sys; os.environ['MC_BACKEND'] = 'agentcore'; import mc_agent.app; "
            "print([m for m in ('strands', 'openai', 'mc_agent.mc', 'mc_agent.voice') if m in sys.modules])")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120, check=True)
    assert out.stdout.strip() == "[]"


def test_the_local_backend_is_unchanged(monkeypatch):
    monkeypatch.delenv("MC_BACKEND", raising=False)
    note = McNoteDraft(**{k: v for k, v in NOTE.items() if k != "source"})
    monkeypatch.setattr(mc_module, "_ai_note", lambda req, deadline: note)
    monkeypatch.setattr(mc_module, "_ai_reply", lambda req, deadline: McReplyDraft(text="Not yet.", spoken="Not yet."))
    assert app_module.invoke(debrief_payload()) == {"note": NOTE}
    assert app_module.invoke(chat_payload()) == {"reply": {"text": "Not yet.", "spoken": "Not yet.", "source": "ai"}}


# --- the deploy files ---------------------------------------------------------------------------


def test_the_runtime_spec_is_valid_for_the_agentcore_api():
    import botocore.session
    from botocore.validate import validate_parameters

    sys.path.insert(0, str(DEPLOY))
    try:
        from render import render
    finally:
        sys.path.remove(str(DEPLOY))
    model = botocore.session.get_session().get_service_model("bedrock-agentcore-control")
    create, update = render("create", "v-123"), render("update", "v-123", "encore_mc-AbC123xyz9")
    validate_parameters(create, model.operation_model("CreateAgentRuntime").input_shape)
    validate_parameters(update, model.operation_model("UpdateAgentRuntime").input_shape)
    members = model.operation_model("CreateAgentRuntime").input_shape.members
    for name, value in create.items():  # botocore checks only minimum lengths; the service also checks these
        meta = members[name].metadata
        if isinstance(value, str):
            assert len(value) <= meta.get("max", 10**6) and re.fullmatch(meta.get("pattern", ".*"), value), name
    assert update["metadataConfiguration"] == {"requireMMDSV2": True} and "agentRuntimeName" not in update
    code = create["agentRuntimeArtifact"]["codeConfiguration"]
    assert code["entryPoint"] == ["main.py"] and code["code"]["s3"]["versionId"] == "v-123"
    assert code["runtime"] == "PYTHON_3_12" and "PYTHON_VERSION=3.12" in (DEPLOY / "build.sh").read_text()
    env = create["environmentVariables"]
    assert env["MC_BACKEND"] == "local"  # the runtime runs the MC itself; it must never forward to itself
    # Everything else (model, budgets, voices) comes from the code in the zip, so the runtime can't drift from it.
    assert set(env) == {"MC_BACKEND", "MC_REGION"} and env["MC_REGION"] == "ap-south-1"
    assert create["roleArn"].endswith(":role/encore-mc-runtime-role") and "ROLE=encore-mc-runtime-role" in (DEPLOY / "agentcore.sh").read_text()
    with pytest.raises(ValueError):
        render("update", "v-123")


def test_the_iam_documents():
    docs = {p.stem: json.loads(p.read_text()) for p in (DEPLOY / "iam").glob("*.json")}
    assert set(docs) == {"runtime-trust", "runtime-policy", "forwarder-policy", "xray-spans-logs-policy"}
    trust = docs["runtime-trust"]["Statement"][0]
    assert trust["Principal"] == {"Service": "bedrock-agentcore.amazonaws.com"} and "aws:SourceAccount" in trust["Condition"]["StringEquals"]
    actions = {a for s in docs["runtime-policy"]["Statement"] for a in ([s["Action"]] if isinstance(s["Action"], str) else s["Action"])}
    assert {"bedrock-mantle:CreateInference", "polly:SynthesizeSpeech", "logs:PutLogEvents"} <= actions
    invoke = docs["forwarder-policy"]["Statement"][0]
    assert invoke["Action"] == ["bedrock-agentcore:InvokeAgentRuntime", "bedrock-agentcore:StopRuntimeSession"]
    assert all(":runtime/encore_mc-" in r for r in invoke["Resource"])
    assert docs["xray-spans-logs-policy"]["Statement"][0]["Condition"]["ArnLike"]["aws:SourceArn"].startswith("arn:aws:xray:")
