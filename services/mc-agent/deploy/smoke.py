"""Ask the MC once per kind and print what came back: the words, the voice and the time. Never prints credentials.

  uv run python deploy/smoke.py direct [--arn ARN] [--session ID] [kinds...]   # InvokeAgentRuntime with boto3
  uv run python deploy/smoke.py http [--url http://127.0.0.1:8080] [kinds...]  # a running service (local or forwarder)

Kinds: line-intro line-between line-heckle line-end debrief chat (default: line-intro debrief chat), all with
speak: true unless --no-speak. Each kind uses a different persona, so all four voices are heard. --save DIR writes
each answer's MP3 (a base64 voice is decoded; a presigned Polly URL is fetched, as the TV would, and never printed:
it carries a session token). --arn defaults to MC_AGENTCORE_ARN; the session defaults to a new encore-smoke-<32 hex>.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from payloads import chat_payload, debrief_payload, line_payload  # noqa: E402

KINDS = ("line-intro", "line-between", "line-heckle", "line-end", "debrief", "chat")
PERSONA = {"line-intro": "warm", "line-between": "sarcastic", "line-heckle": "sarcastic", "line-end": "warm",
           "debrief": "strict", "chat": "deadpan"}


def payload(kind: str, speak: bool = True) -> dict:
    persona = PERSONA[kind]
    if kind.startswith("line-"):
        p = line_payload(kind.split("-", 1)[1], persona=persona)
    elif kind == "debrief":
        p = debrief_payload(persona=persona)
    else:
        p = chat_payload(persona=persona, question="Did that last bit die?")
    return {**p, "speak": speak}


def describe(data: bytes) -> tuple[str, str, dict | None]:
    """(shape, a one-line summary, the answer's audio object or None). Never shows a URL."""
    try:
        body = json.loads(data)
    except ValueError:
        return "not-json", repr(data[:120]), None
    if not isinstance(body, dict) or not body:
        return "not-an-object", repr(data[:120]), None
    key = next(iter(body))
    value = body[key]
    if key == "unavailable":
        return f"unavailable:{value.get('reason')}", str(value.get("detail", "")), None
    if key == "error":
        return "error", f"{value} {json.dumps(body.get('detail', ''))[:160]}", None
    audio = value.get("audio") if isinstance(value, dict) else None
    if key in ("line", "reply"):
        words = value.get("text")
    else:
        words = f"{value.get('headline')} | {value.get('line')} | fix: {value.get('fix')} | next: {value.get('next')}"
    if not isinstance(audio, dict):
        return key, f"{words} [no audio]", None
    how = f"{len(audio['base64']) * 3 // 4 / 1024:.0f} KB base64 mp3" if "base64" in audio else "presigned Polly URL"
    if audio.get("fallbackUrl"):
        how += " + neural fallback URL"
    return key, f"{words} [voice {audio.get('voice')}, {audio.get('engine', 'mp3')}, {how}]", audio


def mp3_of(audio: dict) -> bytes:
    """The voice's MP3: decoded, or fetched from its presigned URL the way the TV would."""
    if "base64" in audio:
        return base64.b64decode(audio["base64"])
    with urllib.request.urlopen(audio["url"], timeout=10) as res:
        return res.read()


def post(url: str, body: bytes, timeout: float) -> bytes:
    req = urllib.request.Request(f"{url}/invocations", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=("direct", "http"))
    ap.add_argument("kinds", nargs="*", default=["line-intro", "debrief", "chat"])
    ap.add_argument("--arn", default=os.environ.get("MC_AGENTCORE_ARN", ""))
    ap.add_argument("--qualifier", default="DEFAULT")
    ap.add_argument("--session", default=f"encore-smoke-{uuid.uuid4().hex}")
    ap.add_argument("--url", default="http://127.0.0.1:8080")
    ap.add_argument("--no-speak", action="store_true")
    ap.add_argument("--save", type=Path)
    args = ap.parse_intermixed_args()
    bad = [k for k in args.kinds if k not in KINDS]
    if bad:
        ap.error(f"unknown kinds {bad}; choose from {KINDS}")

    if args.mode == "direct":
        if not args.arn:
            ap.error("--arn or MC_AGENTCORE_ARN is required")
        import boto3
        from botocore.config import Config

        region = args.arn.split(":")[3]
        client = boto3.client("bedrock-agentcore", region_name=region, config=Config(
            connect_timeout=5, read_timeout=60, retries={"mode": "standard", "total_max_attempts": 3}))
        print(f"AgentCore {args.arn} ({args.qualifier}), session {args.session}")

        def call(body: bytes) -> bytes:
            res = client.invoke_agent_runtime(
                agentRuntimeArn=args.arn, qualifier=args.qualifier, runtimeSessionId=args.session,
                contentType="application/json", accept="application/json", payload=body)
            return res["response"].read()
    else:
        print(f"service {args.url}")

        def call(body: bytes) -> bytes:
            return post(args.url, body, timeout=60)

    failures = 0
    for kind in args.kinds:
        body = json.dumps(payload(kind, not args.no_speak)).encode()
        start = time.monotonic()
        try:
            data = call(body)
        except Exception as err:  # noqa: BLE001 - report and go on
            print(f"{kind:13} {time.monotonic() - start:6.2f}s  FAILED {type(err).__name__}: {str(err)[:200]}")
            failures += 1
            continue
        took = time.monotonic() - start
        shape, summary, audio = describe(data)
        print(f"{kind:13} {took:6.2f}s  {shape:24} {summary}")
        failures += shape not in ("line", "note", "reply")
        if args.save and audio:
            try:
                mp3 = mp3_of(audio)
            except Exception as err:  # noqa: BLE001 - report without the URL
                print(f"{'':13} the voice could not be fetched: {type(err).__name__}")
                failures += 1
                continue
            args.save.mkdir(parents=True, exist_ok=True)
            (args.save / f"{kind}.mp3").write_bytes(mp3)
            print(f"{'':13} saved {kind}.mp3, {len(mp3) / 1024:.0f} KB")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
