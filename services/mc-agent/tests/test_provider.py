"""Provider switch, the SigV4 signer and the honesty guard; all offline (httpx.MockTransport, fake credentials)."""

import json
import logging

import httpx
import pytest
from botocore.credentials import Credentials

from mc_agent import mc as mc_module
from mc_agent.guard import Rejected, check_line, check_note, check_reply, fit
from mc_agent.models import Debrief, GreenRoomReply, MomentLine
from mc_agent.sigv4 import BedrockSigV4
from payloads import chat_req, debrief_req, line_payload, line_req, record

AKID, SECRET, TOKEN = "AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "FwoGZXIvYXdzEXAMPLETOKEN"
FAKE = Credentials(AKID, SECRET, TOKEN)


@pytest.fixture
def env(monkeypatch):
    for name in ("MC_PROVIDER", "MC_MODEL_ID", "MC_REGION", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_PROFILE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(mc_module, "_clients", {})  # each test starts like a fresh process: no lasting client yet
    return monkeypatch


# --- the provider switch ------------------------------------------------------------------------


def test_provider_defaults_to_mantle_with_qwen_in_ap_south_1(env):
    assert (mc_module.provider(), mc_module.model_id(), mc_module.region()) == (
        "mantle", "zai.glm-5", "ap-south-1")
    assert mc_module.mantle_base_url("ap-south-1") == "https://bedrock-mantle.ap-south-1.api.aws/v1"


def test_provider_converse_and_overrides(env):
    env.setenv("MC_PROVIDER", "Converse")
    assert (mc_module.provider(), mc_module.model_id()) == ("converse", "anthropic.claude-opus-5-5")
    env.setenv("AWS_REGION", "us-east-1")
    assert mc_module.region() == "us-east-1"
    env.setenv("MC_REGION", "eu-west-1")
    env.setenv("MC_MODEL_ID", "openai.gpt-oss-120b")
    assert (mc_module.region(), mc_module.model_id()) == ("eu-west-1", "openai.gpt-oss-120b")
    env.setenv("MC_PROVIDER", "openai")
    with pytest.raises(ValueError):
        mc_module.provider()


def test_model_session_per_provider(env):
    import asyncio

    async def built():
        async with mc_module._model(5.0) as model:
            return model

    mantle = asyncio.run(built())
    assert type(mantle).__name__ == "OpenAIModel" and mantle.config["model_id"] == "zai.glm-5"
    assert str(mantle._custom_client.base_url) == "https://bedrock-mantle.ap-south-1.api.aws/v1/"
    env.setenv("MC_PROVIDER", "converse")
    converse = asyncio.run(built())
    assert type(converse).__name__ == "BedrockModel" and converse.config["model_id"] == "anthropic.claude-opus-5-5"


def test_a_bad_provider_is_a_model_error_not_a_crash(env):
    env.setenv("MC_PROVIDER", "nope")
    out = mc_module.chat(chat_req())
    assert out["unavailable"]["reason"] == "model-error" and "MC_PROVIDER" in out["unavailable"]["detail"]


# --- the signer ---------------------------------------------------------------------------------


def signed(body: bytes = b'{"model":"m"}') -> httpx.Request:
    req = httpx.Request("POST", "https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions", content=body,
                        headers={"content-type": "application/json", "authorization": "Bearer unused"})
    return BedrockSigV4("ap-south-1", FAKE).sign(req)


def test_signer_adds_sigv4_and_replaces_the_bearer_header():
    req = signed()
    auth = req.headers["authorization"]
    assert auth.startswith(f"AWS4-HMAC-SHA256 Credential={AKID}/") and "/ap-south-1/bedrock/aws4_request" in auth
    assert "SignedHeaders=content-type;host;x-amz-date;x-amz-security-token" in auth and "Signature=" in auth
    assert "Bearer" not in auth and req.headers["x-amz-security-token"] == TOKEN and req.headers["x-amz-date"]


def test_signer_never_exposes_the_secret(caplog):
    caplog.set_level(logging.DEBUG)
    auth = BedrockSigV4("ap-south-1", FAKE)
    req = auth.sign(httpx.Request("POST", "https://bedrock-mantle.ap-south-1.api.aws/v1/x", content=b"{}"))
    assert all(SECRET not in v for v in req.headers.values())
    assert SECRET not in repr(auth) and AKID not in repr(auth) and SECRET not in caplog.text


def test_signer_covers_the_body():
    a, b = signed(b'{"a":1}'), signed(b'{"a":2}')
    if a.headers["x-amz-date"] == b.headers["x-amz-date"]:  # same second: the signature must differ
        assert a.headers["authorization"] != b.headers["authorization"]


def test_signer_needs_credentials(monkeypatch):
    monkeypatch.setattr("mc_agent.sigv4.boto3.Session", lambda: type("S", (), {"get_credentials": lambda self: None})())
    from botocore.exceptions import NoCredentialsError

    with pytest.raises(NoCredentialsError):
        BedrockSigV4("ap-south-1").sign(httpx.Request("POST", "https://example.com/", content=b"{}"))


# --- the mantle path, end to end offline --------------------------------------------------------

NOTE = {
    "headline": "4.1 s of nothing. I counted",
    "line": "5 of 8 landed, then 4.1 s of silence at 2:05.",
    "fix": "Cut the gap at 2:05 under 2 s.",
    "spoken": "Five of eight landed. Cut the long gap.",
    "next": "again",
}


def sse(arguments: str, name: str = "Debrief") -> bytes:
    def chunk(choices, **extra):
        return "data: " + json.dumps({"id": "c1", "object": "chat.completion.chunk", "created": 0, "model": "m",
                                      "choices": choices, **extra}) + "\n\n"
    call = {"index": 0, "id": "call_1", "type": "function", "function": {"name": name, "arguments": arguments}}
    return (chunk([{"index": 0, "delta": {"role": "assistant", "tool_calls": [call]}, "finish_reason": None}])
            + chunk([{"index": 0, "delta": {}, "finish_reason": "tool_calls"}])
            + chunk([], usage={"prompt_tokens": 1500, "completion_tokens": 150, "total_tokens": 1650})
            + "data: [DONE]\n\n").encode()


def route(env, handler):
    """A mock transport under the production client (its SigV4 auth, timeouts and connection retry)."""
    env.setattr(mc_module, "_clients", {})
    env.setattr(mc_module, "_transport", lambda: httpx.MockTransport(handler))


@pytest.fixture
def mantle(env):
    """Route the real path (Strands -> openai SDK -> httpx -> signer) to a queue of canned responses."""
    env.setenv("AWS_ACCESS_KEY_ID", AKID)
    env.setenv("AWS_SECRET_ACCESS_KEY", SECRET)
    env.setenv("AWS_SESSION_TOKEN", TOKEN)
    seen: list[httpx.Request] = []
    replies: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = replies.pop(0) if len(replies) > 1 else replies[0]
        return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

    route(env, handler)
    return seen, replies


def test_mantle_debrief_is_signed_structured_and_checked(mantle):
    seen, replies = mantle
    replies.append(sse(json.dumps(NOTE)))
    out = mc_module.debrief(debrief_req())
    assert out == {"note": {**{k: v for k, v in NOTE.items()}, "source": "ai"}}
    req = seen[0]
    assert str(req.url) == "https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions"
    assert req.headers["authorization"].startswith(f"AWS4-HMAC-SHA256 Credential={AKID}/")
    assert all(SECRET not in v for v in req.headers.values())
    body = json.loads(req.content)
    assert body["model"] == "zai.glm-5" and body["tools"][0]["function"]["name"] == "Debrief"


def test_mantle_retries_once_with_the_guards_reason(mantle):
    seen, replies = mantle
    replies += [sse(json.dumps({**NOTE, "line": "5 of 8 landed and 47 people walked out."})), sse(json.dumps(NOTE))]
    out = mc_module.debrief(debrief_req())
    assert out["note"]["line"] == NOTE["line"] and out["note"]["source"] == "ai" and len(seen) == 2
    retry = json.dumps(json.loads(seen[1].content)["messages"])
    assert "rejected by the honesty check" in retry and "47" in retry


def test_the_debrief_checklist_leads_the_prompt_and_comes_back_with_the_retry(mantle):
    """QA 2026-10-12, issue 4: a words-off debrief failed the "not measured" check, then the house rule on its retry.
    The checklist (direction, the required sentence, the patterns it may name) is read first and repeated."""
    seen, replies = mantle
    off = debrief_req(wpm=None, peakWpm=None, fillers=None, longestDeadAirSec=2.0, landedPerMin=2.0)
    good = {**NOTE, "line": "5 of 8 landed; pace and fillers not measured, words were off.", "next": "again"}
    replies += [sse(json.dumps({**NOTE, "next": "again"})), sse(json.dumps(good))]
    out = mc_module.debrief(off)
    assert out["note"]["line"] == good["line"] and len(seen) == 2
    first = json.loads(seen[0].content)["messages"]
    prompt = next(m for m in first if m["role"] == "user")
    text = json.dumps(prompt)
    assert text.index("Checklist") < text.index("Measured facts")
    assert '`next` is \\"again\\"' in text and "with the words \\\"not measured\\\"" in text
    retry = json.dumps(json.loads(seen[1].content)["messages"][-1])
    assert "rejected by the honesty check" in retry and "pace and fillers were not measured" in retry
    assert "Checklist" in retry and "suggest no other room" in retry


def test_mantle_rejected_twice_is_unavailable(mantle):
    seen, replies = mantle
    replies.append(sse(json.dumps({**NOTE, "next": "up"})))  # against the rule, and no "my call"
    out = mc_module.debrief(debrief_req())
    assert out["unavailable"]["reason"] == "rejected" and "house rule gives 'again'" in out["unavailable"]["detail"]
    assert len(seen) == 2


def test_mantle_line_and_its_clock_rule(mantle):
    seen, replies = mantle
    replies.append(sse(json.dumps({"text": "Bit 3 closed. The Basement gave 2 laughs."}), "MomentLine"))
    assert mc_module.line(line_req()) == {"line": {"text": "Bit 3 closed. The Basement gave 2 laughs.", "source": "ai"}}
    replies[:] = [sse(json.dumps({"text": "2 laughs at 1:35."}), "MomentLine")]
    assert mc_module.line(line_req())["unavailable"]["reason"] == "rejected"


@pytest.mark.parametrize("response, reason", [
    (httpx.Response(403, json={"error": {"message": "Operation not allowed"}}), "model-error"),
    (httpx.Response(403, json={"message": "The security token included in the request is expired"}), "no-credentials"),
    (httpx.Response(500, json={"error": {"message": "boom"}}), "model-error"),
])
def test_mantle_http_errors(env, response, reason):
    env.setenv("AWS_ACCESS_KEY_ID", AKID)
    env.setenv("AWS_SECRET_ACCESS_KEY", SECRET)
    route(env, lambda r: response)
    assert mc_module.chat(chat_req())["unavailable"]["reason"] == reason


def test_mantle_unreachable_and_no_credentials(env):
    env.setenv("AWS_ACCESS_KEY_ID", AKID)
    env.setenv("AWS_SECRET_ACCESS_KEY", SECRET)

    def down(request):
        raise httpx.ConnectError("name or service not known")

    route(env, down)
    assert mc_module.line(line_req())["unavailable"]["reason"] == "unreachable"
    env.setattr("mc_agent.sigv4.boto3.Session", lambda: type("S", (), {"get_credentials": lambda self: None})())
    route(env, down)  # a new process: the lasting signer resolved the credentials on its first call and keeps them
    out = mc_module.line(line_req())
    assert out == {"unavailable": {"reason": "no-credentials", "detail": "NoCredentialsError"}}


# --- the honesty guard --------------------------------------------------------------------------


def test_fit_trims_at_a_sentence_or_a_word():
    assert fit("Short.", 60) == "Short."
    assert fit("First sentence here. Second one runs on and on past the limit.", 30) == "First sentence here."
    out = fit("one two three four five six seven eight nine ten eleven", 20)
    assert len(out) <= 20 and out.endswith("…")


def test_guard_numbers():
    ok = Debrief(headline="196 wpm, 7 fillers", line="5 of 8 landed; 3 did not. 4.1 s at 2:05, 62% landed.",
                 fix="Cap it at 170.", spoken="Five of eight.", next="again")
    assert check_note(ok, debrief_req()).line == ok.line
    with pytest.raises(Rejected, match="'230'"):
        check_note(ok.model_copy(update={"line": "You hit 230 wpm."}), debrief_req())


def test_guard_rejects_instead_of_writing_words():
    base = dict(headline="Fine", fix="Hold the beat 1 s.", spoken="Fine.", next="again")
    off = debrief_req(wpm=None, peakWpm=None, fillers=None)
    with pytest.raises(Rejected, match="not measured"):
        check_note(Debrief(line="5 of 8 landed.", **base), off)
    said = check_note(Debrief(line="5 of 8 landed. Pace and fillers were not measured.", **base), off)
    assert said.line == "5 of 8 landed. Pace and fillers were not measured."
    with pytest.raises(Rejected, match="house rule"):
        check_note(Debrief(line="Go up.", **{**base, "next": "up"}), debrief_req())
    assert check_note(Debrief(line="My call: go up anyway.", **{**base, "next": "up"}), debrief_req()).next == "up"
    words_off = dict(wpm=None, peakWpm=None, fillers=None)
    with pytest.raises(Rejected):
        check_reply(GreenRoomReply(text="You were fine.", spoken="ok"), chat_req(question="Was I too fast?", **words_off))
    assert check_reply(GreenRoomReply(text="Pace was not measured.", spoken="ok"), chat_req(question="Too fast?", **words_off))


def test_guard_placeholders_brackets_markdown_and_lengths():
    base = dict(headline="Fine", fix="the gap was 4.1 seconds; make it one.", spoken="One. Two. Three. Four. Five.",
                next="again")
    with pytest.raises(Rejected, match="placeholder"):
        check_note(Debrief(line="[landed] of [candidates] landed.", **base), debrief_req())
    note = check_note(Debrief(line="*[4.1]* seconds of dead air at 2:05.", **base), debrief_req())
    assert note.line == "4.1 seconds of dead air at 2:05." and note.fix.startswith("The gap")
    assert note.spoken == "One. Two. Three."  # short sentences for the ear: a debrief speaks up to three
    long = check_note(Debrief(headline="x " * 50, line="5 of 8. " * 40, fix="y " * 150, spoken="z " * 200, next="again"),
                      debrief_req())
    assert len(long.headline) <= 60 and len(long.line) <= 180 and len(long.fix) <= 220 and len(long.spoken) <= 180


def test_guard_lines():
    assert check_line(MomentLine(text='"Bit 3 closed: 2 laughs."'), line_req()).text == "Bit 3 closed: 2 laughs."
    assert check_line(MomentLine(text="Priyanka, 5 minutes at The Basement."), line_req(moment="intro"))
    with pytest.raises(Rejected, match="clock"):
        check_line(MomentLine(text="2 laughs at 1:35."), line_req())
    with pytest.raises(Rejected, match="'9'"):
        check_line(MomentLine(text="9 laughs in bit 3."), line_req())
    assert len(check_line(MomentLine(text="Bit 3 closed. " * 12), line_req()).text) <= 120


def test_persona_examples_carry_no_numbers_and_cards_get_no_examples():
    import re
    from mc_agent.personas import PERSONAS, system_prompt
    for p in PERSONAS.values():
        assert not re.search(r"\d", " ".join(p.examples)), p.id
    card = system_prompt("warm", "standup", "club", "Priyanka", kind="line", moment="heckle")
    assert "Two lines showing your voice" not in card and "never at the person" in card and "No clock times" in card


# --- claims: traceable, no unearned comparisons, chat scope -------------------------------------


def test_every_prompt_carries_the_claims_rules_and_never_say_examples():
    from mc_agent.personas import system_prompt
    for kind, moment in (("debrief", None), ("chat", None), ("line", "end")):
        prompt = system_prompt("warm", "standup", "club", "Priyanka", kind=kind, moment=moment)
        assert "every one must trace to a fact" in prompt and "Never say" in prompt
        assert '"This house knows your work."' in prompt and '"Best minute yet."' in prompt
    heckle = system_prompt("warm", "standup", "club", "Priyanka", kind="line", moment="heckle")
    assert "teases the jokes like a friend in the front row" in heckle and "not sympathy" in heckle and "at most one fact" in heckle


def test_guard_allows_comparisons_only_with_a_trend():
    base = dict(headline="Fine", fix="Cut the gap under 2 s.", spoken="Fine.", next="again")
    with pytest.raises(Rejected, match="no trend"):
        check_line(MomentLine(text="5 of 8 at The Basement, best minute yet."), line_req(moment="end"))
    with pytest.raises(Rejected, match="'ever'"):
        check_line(MomentLine(text="The quietest room ever."), line_req(moment="heckle"))
    assert check_line(MomentLine(text="Never mind every bit, however quiet."), line_req(moment="heckle"))
    with pytest.raises(Rejected, match="'best'"):
        check_note(Debrief(line="Your best set: 5 of 8.", **base), debrief_req())
    assert check_note(Debrief(line="5 of 8; the strongest laugh came early.", **base), debrief_req())
    trend = debrief_req(history=[record(1, landedPerMin=2.2), record(2, landedPerMin=2.6)])
    assert check_note(Debrief(line="5 of 8, better than last set's 2.6.", **base), trend)  # "than last" with a trend
    assert check_reply(GreenRoomReply(text="Theatre? Not yet: 4.1 s gap at 2:05.", spoken="Not yet."), chat_req())
    with pytest.raises(Rejected):
        check_reply(GreenRoomReply(text="Your best yet.", spoken="ok"), chat_req())


def test_chat_about_a_single_bit_sends_the_scope_rule(mantle):
    """A per-bit question answered with whole-set numbers: every number is real, so only the scope is wrong. The
    model is given the rule and the 'not given' fact; the guard also asks once more when the answer never says so,
    and the honest second answer is the one that is shown."""
    seen, replies = mantle
    whole_set = {"text": "5 of 8 landed and the room gave 3 laughs; the gap at 2:05 was 4.1 s.", "spoken": "Five of eight."}
    honest = {"text": "I didn't measure single bits. The whole set: 5 of 8 landed, 3 laughs.", "spoken": "Five of eight."}
    replies += [sse(json.dumps(whole_set), "GreenRoomReply"), sse(json.dumps(honest), "GreenRoomReply")]
    out = mc_module.chat(chat_req(persona="deadpan", question="Did bit 3 die?"))
    assert out == {"reply": {**honest, "source": "ai"}} and len(seen) == 2
    assert "single bit or line" in json.dumps(json.loads(seen[1].content)["messages"])
    replies[:] = [sse(json.dumps(whole_set), "GreenRoomReply")]
    assert mc_module.chat(chat_req(persona="deadpan", question="Did bit 3 die?"))["unavailable"]["reason"] == "rejected"
    messages = json.loads(seen[0].content)["messages"]
    system = next(m["content"] for m in messages if m["role"] == "system")
    system = system if isinstance(system, str) else " ".join(part["text"] for part in system)
    assert "If the question is about something you were not given (a single bit" in system
    assert "say so plainly first" in system
    user = json.dumps(messages[1])
    assert "not in what you were given: numbers for a single bit or a single line" in user


def test_scope_guard_only_fires_on_single_unit_questions():
    whole = GreenRoomReply(text="5 of 8 landed, 3 laughs.", spoken="ok")
    assert check_reply(whole, chat_req(question="How did I do overall?"))
    for q in ("Did bit 3 die?", "Was the closer any good?", "How did that line sound?"):
        with pytest.raises(Rejected, match="single bit"):
            check_reply(whole, chat_req(question=q))
    said = GreenRoomReply(text="That isn't in what I was given. 5 of 8 landed.", spoken="ok")
    assert check_reply(said, chat_req(question="Did bit 3 die?"))


def test_reasoning_models_get_room_to_think(env):
    assert mc_module.model_params() == {"max_tokens": mc_module.MAX_TOKENS, "temperature": 0.7}
    env.setenv("MC_MODEL_ID", "openai.gpt-oss-120b")
    assert mc_module.model_params() == {"max_tokens": 4000, "reasoning_effort": "low"}
