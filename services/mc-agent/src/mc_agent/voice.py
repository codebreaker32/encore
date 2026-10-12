"""The MC's voice: Amazon Polly reads the model's own words in the persona's voice, and the TV streams it from Polly.

The service never waits for audio. For a spoken answer it signs a SynthesizeSpeech GET (a presigned URL, valid 600 s;
signing is local and takes about 1 ms) and returns it with the words. The TV opens the URL over HTTPS and Polly streams
the MP3 as it is made (HTTP 200, audio/mpeg, no Content-Length; chunked over HTTP/1.1). So the voice costs the MC's
budget nothing, and every TV can play it: react-native-video on Android cannot open data: URIs, and Vega's w3cmedia
opens only HTTPS.

Each persona keeps ONE voice (chosen 2026-10-11 and kept after the v2 auditions of 2026-10-12, which rendered the same
ear-written lines in every reachable Polly voice, engine and region and in Nova 2 Sonic: docs/voice-samples/v2/index.md;
MC_VOICE_<PERSONA> overrides it): warm (Meera) Kajal en-IN, sarcastic (Vik) Brian en-GB, strict (Mr. Rao) Stephen
en-US, deadpan (Dev) Matthew en-US. Every engine reads the words as SSML in the persona's delivery (`ssml()`): a beat
where the model wrote "...", Dev slower with a gap after each sentence. The words themselves are never changed.
Engines, and where each is signed:
- premium: generative in MC_VOICE_PREMIUM_REGION (default ap-southeast-1, the nearest generative region to India:
  0.3-0.5 s to the first byte from ap-south-1), or, for voices without generative (Gregory, Patrick), long-form in
  us-east-1, the only region that has it (0.8-2.4 s to the first byte, longer for longer text). Used for the debrief,
  the green-room answers and the intro, which the TV preloads; `fallbackUrl` carries the same words on neural.
- neural in MC_VOICE_REGION (default the MC region, ap-south-1; under 0.1 s to the first byte): every other line, and
  the fallback, in the same delivery.
Only voice/engine pairs that DescribeVoices lists for the region are signed (checked at boot and cached), so a URL
never names an engine its region lacks. MC_VOICE_SIGNER_ROLE_ARN: sign with that role's credentials (STS AssumeRole,
renewed 15 minutes before they expire, so every URL outlives its 600 s) instead of the host's.
A URL is a bearer credential for ten minutes: it goes to the TV and is never logged.
"""

import logging
import os
import re
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any
from xml.sax.saxutils import escape

import boto3
from botocore.config import Config

from .models import McAudio, PersonaId

log = logging.getLogger(__name__)
# botocore logs every SigV4 canonical request and signature at DEBUG. For a presigned URL those are the URL itself,
# so they stay out of the logs even when someone turns DEBUG on.
logging.getLogger("botocore.auth").setLevel(logging.INFO)

VOICES: dict[PersonaId, str] = {"warm": "Kajal", "sarcastic": "Brian", "strict": "Stephen", "deadpan": "Matthew"}
NEURAL, GENERATIVE, LONG_FORM = "neural", "generative", "long-form"
# A voice's premium engine is the first of these it has in that engine's region (Gregory and Patrick have no
# generative).
PREMIUM_ENGINES = (GENERATIVE, LONG_FORM)
ENGINES = (*PREMIUM_ENGINES, NEURAL)
LONG_FORM_REGION = "us-east-1"  # the only region with the long-form engine
DEFAULT_PREMIUM_REGION = "ap-southeast-1"
# The TV opens a URL within seconds, and a clip queued behind another within a minute or two.
EXPIRES_S = 600
# Kajal is bilingual (en-IN, hi-IN): pin the English the MC speaks.
LANGUAGE = {"Kajal": "en-IN"}
# A failed DescribeVoices check is tried again after this long (by the next answer or the service's keep-alive).
RETRY_S = 30.0
# The signer role's credentials are renewed when less than this is left, well above a URL's 600 s.
RENEW_S = 15 * 60
ROLE_SESSION_S = 3600  # the longest a chained role session may last
# DescribeVoices and STS only (signing makes no call): single short attempts, retried later rather than waited for.
_CONFIG = Config(connect_timeout=2, read_timeout=4, retries={"max_attempts": 1})

_clients: dict[str, Any] = {}
_lock = threading.Lock()


def voice_for(persona: PersonaId) -> str:
    return os.environ.get(f"MC_VOICE_{persona.upper()}") or VOICES[persona]


def regions(mc_region: str) -> dict[str, str]:
    """Where each engine is checked and signed."""
    return {
        GENERATIVE: os.environ.get("MC_VOICE_PREMIUM_REGION") or DEFAULT_PREMIUM_REGION,
        LONG_FORM: LONG_FORM_REGION,
        NEURAL: os.environ.get("MC_VOICE_REGION") or mc_region,
    }


def _short(err: BaseException) -> str:
    return f"{type(err).__name__}: {str(err)[:160]}".strip().rstrip(":")


def _client(region: str):
    """One Polly client per region on the host's credentials (clients are thread-safe; creating them is not)."""
    with _lock:
        if region not in _clients:
            _clients[region] = boto3.client("polly", region_name=region, config=_CONFIG)
        return _clients[region]


def _sts(region: str):
    with _lock:  # the same default session as _client
        return boto3.client("sts", region_name=region, config=_CONFIG)


# --- which voices each region has ---------------------------------------------------------------


def _describe(region: str, engine: str) -> frozenset[str]:
    """The voice ids DescribeVoices lists for one engine in one region (it answers per region: ap-south-1 has no
    generative or long-form voices at all)."""
    start = time.monotonic()
    voices: set[str] = set()
    token = None
    try:
        while True:
            page = _client(region).describe_voices(Engine=engine, **({"NextToken": token} if token else {}))
            voices.update(v["Id"] for v in page.get("Voices", []) if engine in v.get("SupportedEngines", (engine,)))
            token = page.get("NextToken")
            if not token:
                break
    except Exception as err:
        log.warning(
            "voices: DescribeVoices for %s in %s failed (%s); trying again in %.0f s",
            engine, region, _short(err), RETRY_S,
        )
        raise
    log.info("voices: %s in %s has %d voices (%.2f s)", engine, region, len(voices), time.monotonic() - start)
    return frozenset(voices)


class Catalog:
    """Which voices each engine has in each region: checked once (DescribeVoices), cached for the life of the process
    (a region's voices change only when Polly adds some); a failed check is tried again after RETRY_S. Checks run on
    their own threads, so an answer never waits on Polly longer than it chooses to."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._checks: dict[tuple[str, str], tuple[Future, float]] = {}
        self._pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="mc-voices")

    def check(self, region: str, engine: str) -> Future:
        """The check for one engine in one region: the cached one, the one still running, or a new one."""
        key = (region, engine)
        with self._lock:
            known = self._checks.get(key)
            if known is not None:
                future, started = known
                failed = future.done() and future.exception() is not None
                if not failed or time.monotonic() - started < RETRY_S:
                    return future
            future = self._pool.submit(_describe, region, engine)
            self._checks[key] = (future, time.monotonic())
            return future

    def close(self) -> None:
        """Wait for the checks still running, then stop (between test cases)."""
        self._pool.shutdown(wait=True)

    def has(self, region: str, engine: str, voice: str, wait: float = 0.0) -> bool:
        """Whether `region` has `voice` on `engine`. False while that is unknown: the check failed, or is still running
        after `wait` seconds."""
        try:
            return voice in self.check(region, engine).result(timeout=max(wait, 0.0))
        except FutureTimeout:
            return False
        except Exception:  # noqa: BLE001 - logged by _describe
            return False


CATALOG = Catalog()


def engines_for(voice: str, premium: bool, where: dict[str, str], wait: float = 0.0) -> list[str]:
    """The engines to sign, best first: the voice's premium engine (when asked for) and neural, each only where
    DescribeVoices lists it. Waits at most `wait` seconds in all for checks still running (only right after boot)."""
    wanted = (*PREMIUM_ENGINES, NEURAL) if premium else (NEURAL,)
    for engine in wanted:
        CATALOG.check(where[engine], engine)  # start them together
    until = time.monotonic() + wait
    chosen: list[str] = []
    for engine in wanted:
        if chosen and engine != NEURAL:
            continue  # one premium engine is enough
        if CATALOG.has(where[engine], engine, voice, until - time.monotonic()):
            chosen.append(engine)
    return chosen


# --- the credentials a URL carries --------------------------------------------------------------


class _Role:
    """MC_VOICE_SIGNER_ROLE_ARN's temporary credentials, assumed with the host's own and kept until RENEW_S before they
    expire. A presigned URL is only valid while the credentials that signed it are, so the role keeps every URL's
    600 s intact, and the URL names that role rather than the host."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._arn = ""
        self._expires = 0.0  # epoch seconds
        self._session: boto3.Session | None = None
        self._clients: dict[str, Any] = {}
        self._retry_at = 0.0  # monotonic; after a failed AssumeRole, STS is not asked again before this

    def client(self, arn: str, region: str, sts_region: str):
        with self._lock:
            if arn != self._arn or self._expires - time.time() < RENEW_S:
                self._renew(arn, sts_region)
            if region not in self._clients:
                self._clients[region] = self._session.client("polly", region_name=region, config=_CONFIG)
            return self._clients[region]

    def _renew(self, arn: str, sts_region: str) -> None:
        """Assume the role, at most once per RETRY_S while STS fails: an answer signs after the guard has passed its
        words, so a slow STS (connect 2 s, read 4 s) on every answer would hold the words past the TV's deadline.
        Until a renewal works, credentials that still outlive a new URL keep signing."""
        usable = arn == self._arn and self._session is not None and self._expires - time.time() > EXPIRES_S
        if time.monotonic() < self._retry_at:
            if usable:
                return
            raise RuntimeError(f"the signer role could not be assumed; STS is asked again within {RETRY_S:.0f} s")
        try:
            self._assume(arn, sts_region)
        except Exception as err:
            self._retry_at = time.monotonic() + RETRY_S
            if not usable:
                raise
            log.warning("voices: renewing the signer role failed (%s); its current credentials still sign", _short(err))

    def _assume(self, arn: str, sts_region: str) -> None:
        creds = _sts(sts_region).assume_role(
            RoleArn=arn, RoleSessionName="encore-mc-voice", DurationSeconds=ROLE_SESSION_S
        )["Credentials"]
        self._session = boto3.Session(
            aws_access_key_id=creds["AccessKeyId"], aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )
        self._arn, self._expires, self._clients = arn, creds["Expiration"].timestamp(), {}
        log.info("voices: signing as MC_VOICE_SIGNER_ROLE_ARN until %s", creds["Expiration"].strftime("%H:%M UTC"))


_ROLE = _Role()


def _role_arn() -> str:
    return os.environ.get("MC_VOICE_SIGNER_ROLE_ARN", "").strip()


def _signer(region: str, sts_region: str):
    arn = _role_arn()
    return _ROLE.client(arn, region, sts_region) if arn else _client(region)


# --- signing ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Delivery:
    """How a persona is read aloud. `rate` is Polly's prosody rate (None: the voice's own pace); `beat_ms` is the pause
    where the model marked a beat with "..." or "…"; `gap_ms` is added after every sentence on top of Polly's own."""

    rate: str | None
    beat_ms: int
    gap_ms: int = 0


# Chosen with the v2 auditions (docs/voice-samples/v2/index.md). Meera is easy and warm, Vik waits a beat before the
# sting, Mr. Rao is clipped and gives no extra air, Dev reads slower and lets every flat fact sit. Generative voices
# take prosody rate in steps, not percent by percent (measured 2026-10-12: Matthew, Stephen and Kajal read 86-114% at
# their own pace, 85% and below at one slow step about 20% slower, 115% and above at one fast step), so 85% is the
# smallest rate that slows Dev on generative; neural and long-form take it as it is. Vik keeps Brian's own pace:
# faster takes scored lower on predicted naturalness.
DELIVERY: dict[PersonaId, Delivery] = {
    "warm": Delivery(rate=None, beat_ms=350),
    "sarcastic": Delivery(rate=None, beat_ms=550),
    "strict": Delivery(rate=None, beat_ms=250),
    "deadpan": Delivery(rate="85%", beat_ms=700, gap_ms=250),
}
BEAT = re.compile(r"\s*(?:\.{3}|…)\s*")
SENTENCE_GAP = re.compile(r"(?<=[.!?])\s+(?=\S)")
DASH = re.compile(r"\s+[—–-]\s+")


def ssml(text: str, persona: PersonaId) -> str:
    """The guard-checked words as SSML, every word unchanged and in order: a marked beat ("..." or "…") becomes a
    pause (a full stop first when a new sentence follows it), a spaced dash a short one, and the persona's pace wraps
    the whole text. Only tags every engine takes are used: <speak>, <break> and <prosody rate> (generative takes
    prosody only around whole sentences, so it wraps all of them)."""
    d = DELIVERY[persona]
    body = escape(re.sub(r"\s+", " ", text).strip())

    def beat(m: re.Match) -> str:
        before, after = body[: m.start()], body[m.end() :]
        if not after:
            return "" if before[-1:] in ".!?" else "."  # a beat at the very end is just the end
        stop = "." if after[:1].isupper() and before[-1:] not in ".!?," else ""
        return f'{stop}<break time="{d.beat_ms}ms"/> '

    body = BEAT.sub(beat, body)
    body = DASH.sub(f' <break time="{min(d.beat_ms, 250)}ms"/> ', body)
    if d.gap_ms:
        body = SENTENCE_GAP.sub(f' <break time="{d.gap_ms}ms"/> ', body)
    if d.rate:
        body = f'<prosody rate="{d.rate}">{body}</prosody>'
    return f"<speak>{body}</speak>"


def request(text: str, persona: PersonaId, engine: str) -> dict:
    """The SynthesizeSpeech arguments: the words as SSML in the persona's delivery (the same on every engine, so the
    neural fallback sounds like the premium take, only plainer)."""
    voice = voice_for(persona)
    args = {"Engine": engine, "OutputFormat": "mp3", "SampleRate": "24000", "VoiceId": voice}
    if voice in LANGUAGE:
        args["LanguageCode"] = LANGUAGE[voice]
    args.update(TextType="ssml", Text=ssml(text, persona))
    return args


def _presign(args: dict, region: str, sts_region: str) -> str:
    return _signer(region, sts_region).generate_presigned_url(
        "synthesize_speech", Params=args, ExpiresIn=EXPIRES_S, HttpMethod="GET"
    )


def sign(text: str, persona: PersonaId, premium: bool, mc_region: str, wait: float = 0.0) -> McAudio | None:
    """`text` in the persona's voice as a presigned URL: with `premium`, the voice's premium engine, with the same words
    on neural as `fallbackUrl`; otherwise neural alone. None when no engine of the voice is known in its region."""
    voice = voice_for(persona)
    where = regions(mc_region)
    engines = engines_for(voice, premium, where, wait)
    if not engines:
        return None
    urls = [_presign(request(text, persona, engine), where[engine], where[NEURAL]) for engine in engines]
    return McAudio(
        format="mp3", url=urls[0], fallback_url=urls[1] if len(urls) > 1 else None, voice=voice, engine=engines[0]
    )


def plan(mc_region: str, wait: float = 0.0) -> dict[PersonaId, list[str]]:
    """Per persona, the engines a premium answer is signed with (for the boot log)."""
    where = regions(mc_region)
    return {persona: engines_for(voice_for(persona), True, where, wait) for persona in VOICES}


def warm(mc_region: str, wait: float = 8.0) -> str:
    """At boot: check every engine's region (in parallel), get the signer ready (assuming the role if one is set) and
    sign once, so an answer's voice is all local from the first request. Returns a summary for the log."""
    where = regions(mc_region)
    for engine in ENGINES:
        CATALOG.check(where[engine], engine)
    try:
        # Resolves the credentials (and assumes the signer role); the URL is discarded.
        _presign(request("Warm-up.", "warm", NEURAL), where[NEURAL], where[NEURAL])
    except Exception as err:  # noqa: BLE001 - reported; each answer tries again
        log.warning("voices: the signer is not ready (%s)", _short(err))
    chosen = plan(mc_region, wait)
    return ", ".join(f"{p} {voice_for(p)} {'+'.join(e) or 'none'}" for p, e in chosen.items())


def renew(mc_region: str) -> None:
    """The keep-alive's housekeeping: retry failed voice checks, and renew the signer role before an answer has to."""
    where = regions(mc_region)
    for engine in ENGINES:
        CATALOG.check(where[engine], engine)
    if _role_arn():
        _signer(where[NEURAL], where[NEURAL])
