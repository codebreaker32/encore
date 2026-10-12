"""Offline stand-ins for what the MC calls: Amazon Polly (DescribeVoices answered from a table; presigning by a real
botocore client with fake credentials, since signing is local), STS for the signer role, and the model's stream."""

import json
import threading
import time
from datetime import datetime, timedelta, timezone

import boto3

from mc_agent import voice

AKID, SECRET, TOKEN = "AKIDVOICEHOSTEXAMPLE", "hostVoiceSecretEXAMPLEKEY0123456789abcdef", "FwoGZXIvYXdzVOICEHOSTTOKEN"
ROLE_ARN = "arn:aws:iam::911167912118:role/encore-voice-signer"
ROLE_AKID, ROLE_SECRET = "ASIAVOICEROLEEXAMPLE", "roleVoiceSecretEXAMPLEKEY0123456789abcdef"
ROLE_TOKEN = "FwoGZXIvYXdzROLETOKEN"

# What DescribeVoices listed on 2026-10-11 for the voices Encore uses or may switch to: ap-south-1 has no generative
# or long-form voices at all, and long-form exists only in us-east-1.
NEURAL_VOICES = {"Kajal", "Brian", "Stephen", "Matthew", "Gregory", "Ruth", "Danielle"}
GENERATIVE_VOICES = {"Kajal", "Brian", "Stephen", "Matthew", "Ruth", "Danielle"}
LISTED = {
    ("ap-south-1", "neural"): NEURAL_VOICES, ("ap-south-1", "generative"): set(), ("ap-south-1", "long-form"): set(),
    ("ap-southeast-1", "neural"): NEURAL_VOICES, ("ap-southeast-1", "generative"): GENERATIVE_VOICES,
    ("ap-southeast-1", "long-form"): set(),
    ("us-east-1", "neural"): NEURAL_VOICES, ("us-east-1", "generative"): GENERATIVE_VOICES,
    ("us-east-1", "long-form"): {"Gregory", "Ruth", "Danielle", "Patrick"},
}
VOICE_ENV = ["MC_VOICE_WARM", "MC_VOICE_SARCASTIC", "MC_VOICE_STRICT", "MC_VOICE_DEADPAN", "MC_VOICE_REGION",
             "MC_VOICE_PREMIUM_REGION", "MC_VOICE_SIGNER_ROLE_ARN"]


class FakePolly:
    """One region's Polly: DescribeVoices from LISTED (optionally slow, failing or paged); presigning by a real botocore
    client with fake credentials."""

    def __init__(self, region: str):
        self.region, self.fail, self.delay, self.pages = region, None, 0.0, 1
        self.described: list[str] = []
        self.signed: list[dict] = []
        session = boto3.Session(aws_access_key_id=AKID, aws_secret_access_key=SECRET, aws_session_token=TOKEN)
        self._real = session.client("polly", region_name=region)

    def describe_voices(self, Engine, NextToken=None):
        self.described.append(Engine)
        time.sleep(self.delay)
        if self.fail:
            raise self.fail
        ids = sorted(LISTED.get((self.region, Engine), ()))
        page = int(NextToken or 0)
        size = -(-len(ids) // self.pages) if ids else 1
        out = {"Voices": [{"Id": i, "SupportedEngines": [Engine]} for i in ids[page * size:(page + 1) * size]]}
        if page + 1 < self.pages:
            out["NextToken"] = str(page + 1)
        return out

    def generate_presigned_url(self, method, Params, ExpiresIn, HttpMethod):
        self.signed.append(dict(Params))
        return self._real.generate_presigned_url(method, Params=Params, ExpiresIn=ExpiresIn, HttpMethod=HttpMethod)


class FakeSts:
    def __init__(self):
        self.calls: list[dict] = []
        self.lasts = timedelta(hours=1)

    def assume_role(self, **kwargs):
        self.calls.append(kwargs)
        return {"Credentials": {"AccessKeyId": ROLE_AKID, "SecretAccessKey": ROLE_SECRET, "SessionToken": ROLE_TOKEN,
                                "Expiration": datetime.now(timezone.utc) + self.lasts}}


def install_polly(monkeypatch) -> dict[str, FakePolly]:
    """Fake Polly clients per region in place of the host's, a fresh voice catalogue and signer, and the default
    voices and regions. Returns the fakes by region (set one before first use to make it slow or failing)."""
    fakes: dict[str, FakePolly] = {}
    lock = threading.Lock()

    def client(region):
        with lock:
            return fakes.setdefault(region, FakePolly(region))

    monkeypatch.setattr(voice, "_client", client)
    monkeypatch.setattr(voice, "CATALOG", voice.Catalog())
    monkeypatch.setattr(voice, "_ROLE", voice._Role())
    for name in (*VOICE_ENV, "MC_REGION", "AWS_REGION"):
        monkeypatch.delenv(name, raising=False)
    return fakes


def sse(name: str, arguments: dict) -> bytes:
    """The model's streamed answer: one call of the structured-output tool `name` with these arguments."""

    def chunk(choices, **extra):
        return "data: " + json.dumps({"id": "c1", "object": "chat.completion.chunk", "created": 0, "model": "m",
                                      "choices": choices, **extra}) + "\n\n"

    function = {"name": name, "arguments": json.dumps(arguments)}
    call = {"index": 0, "id": "call_1", "type": "function", "function": function}
    return (chunk([{"index": 0, "delta": {"role": "assistant", "tool_calls": [call]}, "finish_reason": None}])
            + chunk([{"index": 0, "delta": {}, "finish_reason": "tool_calls"}])
            + chunk([], usage={"prompt_tokens": 1500, "completion_tokens": 150, "total_tokens": 1650})
            + "data: [DONE]\n\n").encode()
