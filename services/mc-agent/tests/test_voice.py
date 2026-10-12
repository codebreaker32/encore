"""The MC's voice (Amazon Polly), offline: the URLs are real presigned URLs made by botocore with fake credentials
(signing is local), and DescribeVoices answers from what each region listed on 2026-10-11 (fakes.py)."""

import html
import logging
import re
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from pydantic import ValidationError

from fakes import (
    AKID, GENERATIVE_VOICES, ROLE_AKID, ROLE_ARN, ROLE_SECRET, ROLE_TOKEN, SECRET, TOKEN, FakePolly, FakeSts,
    install_polly, sse,
)
from mc_agent import mc as mc_module
from mc_agent import voice
from mc_agent.app import invoke
from mc_agent.models import McAudio, McLineDraft, McNoteDraft, McReplyDraft, parse_request
from payloads import chat_payload, debrief_payload, line_payload

REPO = Path(__file__).resolve().parents[3]

NOTE = McNoteDraft(headline="5 of 8.", line="5 of 8 landed; 4.1 s at 2:05.", fix="Cut the gap under 2 s.",
                   spoken="Five of eight landed. Cut the gap & breathe.", next="again")
REPLY = McReplyDraft(text="Not yet.", spoken="Not yet, Priyanka.")
LINE = McLineDraft(text="Bit 3 closed with 2 laughs & a murmur.")


@pytest.fixture
def voices(monkeypatch):
    yield install_polly(monkeypatch)
    voice.CATALOG.close()  # checks a test never waited for finish before the next test starts


@pytest.fixture
def polly(voices, monkeypatch):
    """The voices, and a model that always answers with these guard-checked drafts."""
    monkeypatch.setattr(mc_module, "_ai_note", lambda req, deadline: NOTE)
    monkeypatch.setattr(mc_module, "_ai_reply", lambda req, deadline: REPLY)
    monkeypatch.setattr(mc_module, "_ai_line", lambda req, deadline: LINE)
    return voices


@pytest.fixture
def role(polly, monkeypatch):
    sts = FakeSts()
    monkeypatch.setenv("MC_VOICE_SIGNER_ROLE_ARN", ROLE_ARN)
    monkeypatch.setattr(voice, "_sts", lambda region: sts)
    return sts


def query(url: str) -> tuple[str, str, dict]:
    parts = urlsplit(url)
    return parts.netloc, parts.path, {k: v[0] for k, v in parse_qs(parts.query, keep_blank_values=True).items()}


def said(text: str, persona: str, engine: str) -> tuple[str, str]:
    """(TextType, Text) for the words as Polly is asked to read them: SSML in the persona's delivery, on every
    engine."""
    return "ssml", voice.ssml(text, persona)


def words_of(ssml: str) -> list[str]:
    """The words an SSML text speaks (tags dropped, entities decoded), for comparing with the guarded words."""
    return WORD.findall(html.unescape(re.sub(r"<[^>]+>", " ", ssml)))


WORD = re.compile(r"[A-Za-z0-9']+")


def signed_engines(fakes) -> set[str]:
    return {params["Engine"] for fake in fakes.values() for params in fake.signed}


VOICES = [("warm", "Kajal"), ("sarcastic", "Brian"), ("strict", "Stephen"), ("deadpan", "Matthew")]
PREMIUM = [  # the answers read by the premium engine: payload, answer key, the guarded words
    (lambda persona: debrief_payload(persona=persona), "note", NOTE.spoken),
    (lambda persona: chat_payload(persona=persona), "reply", REPLY.spoken),
    (lambda persona: line_payload("intro", persona=persona), "line", LINE.text),
]


def test_speak_is_accepted_on_every_kind_and_defaults_off():
    for payload in (debrief_payload(), chat_payload(), line_payload()):
        assert parse_request(payload).speak is False and parse_request({**payload, "speak": True}).speak is True


@pytest.mark.parametrize("persona, name", VOICES)
@pytest.mark.parametrize("make, key, words", PREMIUM, ids=["debrief", "chat", "intro"])
def test_premium_answers_are_generative_near_india_with_a_neural_fallback(polly, persona, name, make, key, words):
    audio = invoke({**make(persona), "speak": True})[key]["audio"]
    assert list(audio) == ["format", "url", "fallbackUrl", "voice", "engine"]
    assert (audio["format"], audio["voice"], audio["engine"]) == ("mp3", name, "generative")
    host, path, q = query(audio["url"])
    assert (host, path) == ("polly.ap-southeast-1.amazonaws.com", "/v1/speech")
    assert (q["Engine"], q["VoiceId"], q["OutputFormat"], q["SampleRate"]) == ("generative", name, "mp3", "24000")
    assert (q["TextType"], q["Text"]) == said(words, persona, "generative")
    assert words_of(q["Text"]) == WORD.findall(words)  # the guard-checked words, every one and in order
    assert q["X-Amz-Expires"] == "600" and q["X-Amz-Credential"].endswith("/ap-southeast-1/polly/aws4_request")
    assert q.get("LanguageCode") == ("en-IN" if name == "Kajal" else None)
    host, path, fq = query(audio["fallbackUrl"])
    assert (host, path, fq["Engine"], fq["VoiceId"]) == ("polly.ap-south-1.amazonaws.com", "/v1/speech", "neural", name)
    assert (fq["TextType"], fq["Text"]) == said(words, persona, "neural")
    assert fq.get("LanguageCode") == ("en-IN" if name == "Kajal" else None)


@pytest.mark.parametrize("moment", ["between", "heckle", "end"])
@pytest.mark.parametrize("persona, name", VOICES)
def test_other_lines_are_neural_alone(polly, moment, persona, name):
    audio = invoke({**line_payload(moment, persona=persona), "speak": True})["line"]["audio"]
    assert (audio["voice"], audio["engine"]) == (name, "neural") and "fallbackUrl" not in audio
    host, _, q = query(audio["url"])
    assert host == "polly.ap-south-1.amazonaws.com" and (q["TextType"], q["Text"]) == said(LINE.text, persona, "neural")
    assert signed_engines(polly) == {"neural"}


def test_deadpan_is_never_signed_generative_where_generative_does_not_exist(polly, monkeypatch):
    monkeypatch.setenv("MC_VOICE_PREMIUM_REGION", "ap-south-1")  # no generative voices there
    for make, key, words in PREMIUM:
        audio = invoke({**make("deadpan"), "speak": True})[key]["audio"]
        assert (audio["voice"], audio["engine"]) == ("Matthew", "neural") and "fallbackUrl" not in audio
        assert query(audio["url"])[2]["Text"] == said(words, "deadpan", "neural")[1]
    assert signed_engines(polly) == {"neural"} and "generative" in polly["ap-south-1"].described


def test_a_premium_region_that_cannot_be_checked_is_never_signed(polly):
    polly["ap-southeast-1"] = fake = FakePolly("ap-southeast-1")
    fake.fail = ClientError({"Error": {"Code": "ThrottlingException", "Message": "slow down"}}, "DescribeVoices")
    audio = invoke({**debrief_payload(persona="strict"), "speak": True})["note"]["audio"]
    assert (audio["engine"], query(audio["url"])[0]) == ("neural", "polly.ap-south-1.amazonaws.com")
    assert "fallbackUrl" not in audio and signed_engines(polly) == {"neural"}


def test_gregory_still_works_long_form_in_us_east_1_with_a_neural_fallback(polly, monkeypatch):
    monkeypatch.setenv("MC_VOICE_DEADPAN", "Gregory")
    audio = invoke({**debrief_payload(persona="deadpan"), "speak": True})["note"]["audio"]
    assert (audio["voice"], audio["engine"]) == ("Gregory", "long-form")
    host, _, q = query(audio["url"])
    assert (host, q["Engine"], q["TextType"]) == ("polly.us-east-1.amazonaws.com", "long-form", "ssml")
    assert q["Text"] == said(NOTE.spoken, "deadpan", "long-form")[1]
    host, _, fq = query(audio["fallbackUrl"])
    assert (host, fq["Engine"], fq["VoiceId"]) == ("polly.ap-south-1.amazonaws.com", "neural", "Gregory")
    assert (fq["TextType"], fq["Text"]) == said(NOTE.spoken, "deadpan", "neural")
    line = invoke({**line_payload("heckle", persona="deadpan"), "speak": True})["line"]["audio"]
    assert (line["voice"], line["engine"]) == ("Gregory", "neural")


def test_voice_and_region_overrides(polly, monkeypatch):
    monkeypatch.setenv("MC_VOICE_WARM", "Ruth")
    audio = invoke({**debrief_payload(persona="warm"), "speak": True})["note"]["audio"]
    assert (audio["voice"], audio["engine"]) == ("Ruth", "generative") and "LanguageCode" not in query(audio["url"])[2]
    monkeypatch.setenv("MC_VOICE_PREMIUM_REGION", "us-east-1")
    monkeypatch.setenv("MC_VOICE_REGION", "ap-southeast-1")
    audio = invoke({**chat_payload(persona="sarcastic"), "speak": True})["reply"]["audio"]
    assert query(audio["url"])[0] == "polly.us-east-1.amazonaws.com"
    assert query(audio["fallbackUrl"])[0] == "polly.ap-southeast-1.amazonaws.com"
    monkeypatch.delenv("MC_VOICE_REGION")
    monkeypatch.setenv("MC_REGION", "us-east-1")  # neural follows the MC's region by default
    audio = invoke({**line_payload("end", persona="strict"), "speak": True})["line"]["audio"]
    assert query(audio["url"])[0] == "polly.us-east-1.amazonaws.com"


def test_describe_voices_is_checked_once_per_region_and_engine(polly):
    for _ in range(3):
        invoke({**debrief_payload(persona="warm"), "speak": True})
        invoke({**line_payload("between", persona="deadpan"), "speak": True})
    assert polly["ap-south-1"].described == ["neural"]
    assert polly["ap-southeast-1"].described == ["generative"]
    assert polly["us-east-1"].described == ["long-form"]


def test_a_failed_check_is_retried_after_a_while(polly, monkeypatch):
    polly["ap-southeast-1"] = fake = FakePolly("ap-southeast-1")
    fake.fail = ClientError({"Error": {"Code": "ServiceUnavailable", "Message": "busy"}}, "DescribeVoices")
    assert invoke({**chat_payload(persona="warm"), "speak": True})["reply"]["audio"]["engine"] == "neural"
    assert invoke({**chat_payload(persona="warm"), "speak": True})["reply"]["audio"]["engine"] == "neural"
    assert fake.described == ["generative"]  # not again inside RETRY_S
    fake.fail = None
    monkeypatch.setattr(voice, "RETRY_S", 0.0)
    assert invoke({**chat_payload(persona="warm"), "speak": True})["reply"]["audio"]["engine"] == "generative"
    assert fake.described == ["generative", "generative"]


def test_describe_voices_reads_every_page(polly):
    polly["ap-southeast-1"] = fake = FakePolly("ap-southeast-1")
    fake.pages = 3
    assert voice.CATALOG.check("ap-southeast-1", "generative").result(5) == GENERATIVE_VOICES
    assert fake.described == ["generative"] * 3


def test_right_after_boot_an_answer_waits_briefly_for_the_voice_check(polly):
    polly["ap-southeast-1"] = fake = FakePolly("ap-southeast-1")
    fake.delay = 0.3
    for region, engine in (("ap-south-1", "neural"), ("us-east-1", "long-form")):
        voice.CATALOG.check(region, engine).result(5)  # done; only generative is still being checked
    early = voice.sign("Five of eight.", "warm", True, "ap-south-1", wait=0.0)
    assert (early.engine, early.fallback_url) == ("neural", None)  # the check is still running: no premium URL
    later = voice.sign("Five of eight.", "warm", True, "ap-south-1", wait=1.0)
    assert later.engine == "generative" and later.fallback_url


def test_no_known_voice_means_words_without_audio(polly, monkeypatch, caplog):
    monkeypatch.setenv("MC_VOICE_STRICT", "Nobody")
    out = invoke({**debrief_payload(persona="strict"), "speak": True})
    assert out == {"note": {**NOTE.model_dump(), "source": "ai"}} and signed_engines(polly) == set()
    assert "no Polly engine is known" in caplog.text


def test_the_signer_role_signs_instead_of_the_host(role, polly):
    first = invoke({**debrief_payload(persona="deadpan"), "speak": True})["note"]["audio"]
    second = invoke({**line_payload("intro", persona="warm"), "speak": True})["line"]["audio"]
    for url in (first["url"], first["fallbackUrl"], second["url"], second["fallbackUrl"]):
        q = query(url)[2]
        assert q["X-Amz-Credential"].startswith(ROLE_AKID + "/") and q["X-Amz-Security-Token"] == ROLE_TOKEN
        assert AKID not in url and TOKEN not in url
    assert all(fake.signed == [] for fake in polly.values())  # the host's credentials signed nothing
    assert len(role.calls) == 1  # cached
    assert role.calls[0] == {"RoleArn": ROLE_ARN, "RoleSessionName": "encore-mc-voice", "DurationSeconds": 3600}


def test_the_signer_role_is_renewed_before_its_urls_could_outlive_it(role, polly):
    role.lasts = timedelta(minutes=20)
    invoke({**chat_payload(persona="strict"), "speak": True})
    invoke({**chat_payload(persona="strict"), "speak": True})
    assert len(role.calls) == 1  # 20 minutes left: kept
    role.lasts = timedelta(hours=1)  # what STS grants for DurationSeconds=3600
    voice._ROLE._expires = time.time() + 14 * 60  # under 15 minutes left, so a 600 s URL could outlive it
    invoke({**chat_payload(persona="strict"), "speak": True})
    assert len(role.calls) == 2
    voice.renew("ap-south-1")  # an hour left: nothing to do
    assert len(role.calls) == 2
    voice._ROLE._expires = time.time() + 14 * 60
    voice.renew("ap-south-1")  # the keep-alive renews ahead of the next answer
    assert len(role.calls) == 3


def test_a_signer_role_that_cannot_be_assumed_leaves_the_words(role, monkeypatch, caplog):
    def denied(**kwargs):
        raise ClientError({"Error": {"Code": "AccessDenied", "Message": "not authorized"}}, "AssumeRole")

    monkeypatch.setattr(role, "assume_role", denied)
    out = invoke({**debrief_payload(), "speak": True})
    assert out == {"note": {**NOTE.model_dump(), "source": "ai"}}
    assert "could not be signed" in caplog.text and "AccessDenied" in caplog.text


def test_a_failing_sts_is_asked_once_per_retry_window_not_on_every_answer(role, monkeypatch):
    """Signing happens after the guard has passed the words; a slow or failing STS on every answer would hold them."""
    calls = []

    def unreachable(**kwargs):
        calls.append(kwargs)
        raise ClientError({"Error": {"Code": "ServiceUnavailable", "Message": "down"}}, "AssumeRole")

    monkeypatch.setattr(role, "assume_role", unreachable)
    for _ in range(3):
        assert "audio" not in invoke({**chat_payload(), "speak": True})["reply"]
    assert len(calls) == 1
    monkeypatch.setattr(voice, "RETRY_S", 0.0)
    monkeypatch.setattr(voice._ROLE, "_retry_at", 0.0)
    monkeypatch.setattr(role, "assume_role", FakeSts.assume_role.__get__(role))
    assert "audio" in invoke({**chat_payload(), "speak": True})["reply"]  # STS is back


def test_a_failed_renewal_keeps_signing_while_the_credentials_outlive_a_url(role, monkeypatch, caplog):
    invoke({**chat_payload(), "speak": True})
    voice._ROLE._expires = time.time() + 14 * 60  # renewal due, but 14 minutes still outlive a 600 s URL

    def denied(**kwargs):
        raise ClientError({"Error": {"Code": "Throttling", "Message": "slow down"}}, "AssumeRole")

    monkeypatch.setattr(role, "assume_role", denied)
    audio = invoke({**chat_payload(), "speak": True})["reply"]["audio"]
    assert query(audio["url"])[2]["X-Amz-Security-Token"] == ROLE_TOKEN
    assert "renewing the signer role failed" in caplog.text
    voice._ROLE._expires = time.time() + 5 * 60  # now a new URL would outlive them
    assert "audio" not in invoke({**chat_payload(), "speak": True})["reply"]


def test_no_url_or_credential_reaches_the_logs(role, polly, caplog):
    caplog.set_level(logging.DEBUG)
    answers = [invoke({**make(persona), "speak": True}) for persona, _ in VOICES for make, _, _ in PREMIUM]
    urls = [url for answer in answers for value in answer.values() for url in
            (value["audio"]["url"], value["audio"]["fallbackUrl"])]
    assert len(urls) == 24 and caplog.records
    text = caplog.text
    for url in urls:
        q = query(url)[2]
        for part in (url, q["X-Amz-Signature"], q["X-Amz-Credential"], q["X-Amz-Security-Token"]):
            assert part not in text
    assert "X-Amz" not in text and ROLE_SECRET not in text and ROLE_AKID not in text and "/v1/speech" not in text
    assert "debrief: voice Kajal on generative with a neural fallback" in text  # what is logged instead


def test_a_voice_that_cannot_be_signed_leaves_the_words(polly, monkeypatch, caplog):
    def no_credentials(*args, **kwargs):
        raise NoCredentialsError()

    monkeypatch.setattr(FakePolly, "generate_presigned_url", no_credentials)
    out = invoke({**debrief_payload(), "speak": True})
    assert out == {"note": {**NOTE.model_dump(), "source": "ai"}}
    assert "could not be signed" in caplog.text and "NoCredentialsError" in caplog.text


def test_no_speak_no_polly(polly):
    out = invoke(debrief_payload())
    assert "audio" not in out["note"] and polly == {}


def test_unavailable_never_carries_audio(polly, monkeypatch):
    def boom(req, deadline):
        raise ValueError("no structured output")

    monkeypatch.setattr(mc_module, "_ai_note", boom)
    assert invoke({**debrief_payload(), "speak": True}) == {
        "unavailable": {"reason": "model-error", "detail": "ValueError: no structured output"}}
    assert polly == {}


def test_signing_takes_nothing_from_the_budget(polly, monkeypatch):
    """A line the model answers just inside its budget still carries its voice; nothing waits for audio."""
    monkeypatch.setattr(mc_module, "_ai_line", lambda req, deadline: (time.sleep(0.45), LINE)[1])
    monkeypatch.setattr(mc_module, "LINE_TIMEOUT_S", 0.5)
    voice.CATALOG.check("ap-south-1", "neural").result(5)  # checked at boot
    start = time.monotonic()
    out = invoke({**line_payload("between"), "speak": True})
    assert out["line"]["audio"]["engine"] == "neural" and time.monotonic() - start < 0.6
    for gone in ("MIN_VOICE_S", "PREMIUM_MIN_S"):
        assert not hasattr(mc_module, gone)


def test_warm_checks_every_engine_and_readies_the_signer(polly):
    summary = voice.warm("ap-south-1", wait=5)
    assert summary == ("warm Kajal generative+neural, sarcastic Brian generative+neural, "
                       "strict Stephen generative+neural, deadpan Matthew generative+neural")
    assert (polly["ap-south-1"].described, polly["ap-southeast-1"].described, polly["us-east-1"].described) == (
        ["neural"], ["generative"], ["long-form"])
    assert len(polly["ap-south-1"].signed) == 1  # signed once to resolve the credentials; that URL is discarded


def test_mcaudio_contract():
    url = "https://polly.ap-southeast-1.amazonaws.com/v1/speech?Engine=generative"
    audio = McAudio(format="mp3", url=url, fallback_url=url + "x", voice="Matthew", engine="generative")
    assert audio.model_dump() == {"format": "mp3", "url": url, "fallbackUrl": url + "x", "voice": "Matthew",
                                  "engine": "generative"}
    assert McAudio.model_validate({"format": "mp3", "url": url, "voice": "Kajal", "engine": "neural"}).model_dump(
        exclude_none=True) == {"format": "mp3", "url": url, "voice": "Kajal", "engine": "neural"}
    for bad in ({"engine": "standard"}, {"format": "wav"}, {"url": None}):
        with pytest.raises(ValidationError):
            McAudio.model_validate({"format": "mp3", "url": url, "voice": "Kajal", "engine": "neural", **bad})
    with pytest.raises(ValidationError):
        McAudio.model_validate({"format": "mp3", "base64": "AA==", "voice": "Kajal"})  # the old shape


def test_the_typescript_contract_is_in_step():
    types = REPO / "packages/crowd/src/types.ts"
    if not types.exists():
        pytest.skip("packages/crowd is not in this checkout")
    block = re.search(r"export interface McAudio \{(.*?)\n\}", types.read_text(), re.S).group(1)
    assert re.findall(r"^  (\w+)(\??):", block, re.M) == [
        ("format", ""), ("url", ""), ("fallbackUrl", "?"), ("voice", ""), ("engine", "")]
    assert "engine: 'neural' | 'generative' | 'long-form';" in block and "base64" not in block


# --- the guard's words are the words Polly reads, end to end ------------------------------------


@pytest.fixture
def model(voices, monkeypatch):
    """The real model path (Strands, the OpenAI SDK, the SigV4 signer, the guard) on a mock transport."""
    replies: list[bytes] = []
    for name, value in (("AWS_ACCESS_KEY_ID", AKID), ("AWS_SECRET_ACCESS_KEY", SECRET), ("AWS_SESSION_TOKEN", TOKEN)):
        monkeypatch.setenv(name, value)
    for name in ("MC_PROVIDER", "MC_MODEL_ID"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(mc_module, "_clients", {})
    monkeypatch.setattr(mc_module, "_transport", lambda: httpx.MockTransport(
        lambda request: httpx.Response(200, content=replies.pop(0), headers={"content-type": "text/event-stream"})))
    return replies


DEBRIEF = {"headline": "5 of 8.", "line": "5 of 8 landed; 4.1 s at 2:05.", "fix": "Cut the gap at 2:05 under 2 s.",
           "next": "again"}


def test_polly_reads_exactly_the_words_the_guard_passed(model):
    """The model's spoken text carries markdown and a fifth sentence; only the guard's trimmed version is signed (a
    debrief speaks three short sentences)."""
    raw = "**Five** of eight landed. Cut the long gap. Then breathe... and go. Go on. Really."
    model.append(sse("Debrief", {**DEBRIEF, "spoken": raw}))
    note = invoke({**debrief_payload(persona="sarcastic"), "speak": True})["note"]
    assert note["spoken"] == "Five of eight landed. Cut the long gap. Then breathe... and go."
    for url in (note["audio"]["url"], note["audio"]["fallbackUrl"]):
        assert query(url)[2]["Text"] == voice.ssml(note["spoken"], "sarcastic")
        assert words_of(query(url)[2]["Text"]) == WORD.findall(note["spoken"])
    model.append(sse("MomentLine", {"text": '"Priyanka, 5 minutes at The Basement."'}))
    line = invoke({**line_payload("intro", persona="deadpan"), "speak": True})["line"]
    assert line["text"] == "Priyanka, 5 minutes at The Basement."
    assert query(line["audio"]["url"])[2]["Text"] == said(line["text"], "deadpan", "generative")[1]
    assert query(line["audio"]["fallbackUrl"])[2]["Text"] == said(line["text"], "deadpan", "neural")[1]
    assert words_of(query(line["audio"]["url"])[2]["Text"]) == WORD.findall(line["text"])


def test_a_rejected_answer_is_never_voiced(model):
    """The first answer quotes a number the payload cannot produce; the voice reads only the second, guarded one."""
    model += [sse("Debrief", {**DEBRIEF, "spoken": "Forty seven people walked out after 47 seconds."}),
              sse("Debrief", {**DEBRIEF, "spoken": "Five of eight landed."})]
    note = invoke({**debrief_payload(persona="strict"), "speak": True})["note"]
    assert note["spoken"] == "Five of eight landed."
    assert words_of(query(note["audio"]["url"])[2]["Text"]) == ["Five", "of", "eight", "landed"]
    model.append(sse("Debrief", {**DEBRIEF, "spoken": "47 of them left."}))
    model.append(sse("Debrief", {**DEBRIEF, "spoken": "Still 47."}))
    out = invoke({**debrief_payload(persona="strict"), "speak": True})
    assert list(out) == ["unavailable"] and out["unavailable"]["reason"] == "rejected"


# --- the delivery: SSML that every engine takes, the words untouched ---------------------------------------------

DELIVERED = [
    "One laugh, about twenty seconds in. Lovely. Then nearly fifteen seconds of silence... which isn't a pause.",
    "You landed about one line a minute. One laugh... I'd have fewer seconds of nothing…",
    "Priyanka, five minutes at The Back Room - and the floor's yours. Tom & Jerry <3 \"quoted\".",
]


@pytest.mark.parametrize("persona", ["warm", "sarcastic", "strict", "deadpan"])
@pytest.mark.parametrize("text", DELIVERED)
def test_ssml_keeps_every_word_and_uses_only_tags_every_engine_takes(persona, text):
    out = voice.ssml(text, persona)
    assert out.startswith("<speak>") and out.endswith("</speak>")
    assert words_of(out) == WORD.findall(text)  # nothing added, dropped or reordered
    assert set(re.findall(r"<(\w+)", out)) <= {"speak", "break", "prosody"}  # generative, long-form, neural alike
    assert "&amp;" in out and "&lt;3" in out if "&" in text else True
    for ms in re.findall(r'<break time="(\d+)ms"/>', out):
        assert 0 < int(ms) <= 1000  # Polly's limit is 10 s; a beat is under a second
    if voice.DELIVERY[persona].rate:  # generative takes prosody only around whole sentences: it wraps all of them
        assert re.fullmatch(r"<speak><prosody rate=\"\d+%\">.*</prosody></speak>", out)
    else:
        assert "<prosody" not in out


def test_beats_and_gaps_follow_the_persona():
    vik = voice.ssml("One laugh. Lovely. Then silence... which isn't a pause.", "sarcastic")
    assert vik == '<speak>One laugh. Lovely. Then silence<break time="550ms"/> which isn\'t a pause.</speak>'
    dev = voice.ssml("One laugh. Then nothing... I'd have less nothing...", "deadpan")
    assert dev == ('<speak><prosody rate="85%">One laugh. <break time="250ms"/> Then nothing.<break time="700ms"/> '
                   "I'd have less nothing.</prosody></speak>")  # a beat before a new sentence ends the first one
    assert voice.ssml("Five minutes, no notes.", "strict") == "<speak>Five minutes, no notes.</speak>"


def test_every_engine_is_asked_for_ssml_and_the_words_fit_polly(polly):
    for persona, _ in VOICES:
        for engine in ("generative", "long-form", "neural"):
            args = voice.request(NOTE.spoken, persona, engine)
            assert args["TextType"] == "ssml" and words_of(args["Text"]) == WORD.findall(NOTE.spoken)
    longest = voice.request("Nearly fifteen seconds... of nothing. " * 9, "deadpan", "generative")["Text"]
    assert len(longest) < 3000  # SynthesizeSpeech's limit for one request
