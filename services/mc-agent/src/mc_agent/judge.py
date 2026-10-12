"""The content judge: one fast model call per line, while the room waits for the beat.

The crowd engine (packages/crowd) scores a line by its timing and by deterministic content features (a callback, a
rhyme, a triad). When the performer has words on, the TV may also ask this service for one model judgement of the
line's words, `kind: judge`. The answer is a small structured estimate, set by the act:

- stand-up: `punch` (does the line pay off its setup as a joke) and `surprise` (does it turn the expectation);
- poetry:   `imagery` (a concrete image), `sound` (rhyme, rhythm, repetition), `turn` (a shift in thought or feeling);
- speech:   `point` (a clear, quotable point), `rhetoric` (a triad, a contrast, a repetition), `call` (a call to act).

`score` is set by the act. Poetry and speech: the dims' weighted mean (`SCORE_WEIGHTS`), on the rubric's own 0..1
scale. Stand-up, as docs/judge-calibration.md recommends, is an ensemble on a percentile scale ("where this line would
sit among held-out Reddit jokes", 0.5 being a typical one):

    score = 0.7 * RoBERTa percentile + 0.3 * the LLM's percentile          (both answered)
          = 0.7 * RoBERTa percentile + 0.3 * 0.5                           (the LLM missed its budget: neutral)
          = the LLM's percentile                                            (the humour model is not installed)

The CPU humour model (`humor.py`, humor-roberta-large int8, about 25-60 ms) ranks jokes best (rho 0.37 on held-out
rJokes) but cannot tell a joke from a flat line; the fast LLM tells them apart (0.975 of our pairs) but ranks Reddit
jokes at chance. Together: rho 0.34 and 0.85-0.90 of the pairs. A missing LLM counts as a typical joke (0.5), so the
humour model alone can never lift a line by much. The LLM's percentile uses `LLM_PERCENTILES`, measured for the
calibrated model only; another model's raw score is used as it is. The engine weighs the score above its own per-act
floor and labels it on screen as the MC's model, an estimate. The judge never measures anything: timings, rhymes and
counts come from the engine. Singing is never judged (the room cheers the hold, not the lyric).

Latency is the point. The engine decides at most about 0.9 s after the line ends and uses timing plus its own
features when no verdict has arrived, so the LLM gets MC_JUDGE_TIMEOUT_S (0.35 s, which keeps p90 under 500 ms from the
TV) and the humour model runs alongside it: one LLM call, no retry, a tiny prompt, JSON mode, at most JUDGE_MAX_TOKENS
tokens, on the MC's lasting connection (mc.py keeps it warm). Every failure is `{"unavailable": {"reason": ...}}`,
exactly like the MC's other kinds.

Env: MC_JUDGE_MODEL_ID (default DEFAULT_JUDGE_MODEL), MC_JUDGE_TIMEOUT_S (default 0.35), MC_HUMOR_MODEL_DIR (the humour
model, off when unset; see humor.py and deploy/README.md), MC_HUMOR_THREADS.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

import httpx

from .models import JudgeAct, JudgeRequest, JudgeVerdict, McUnavailable

log = logging.getLogger(__name__)

# docs/judge-calibration.md: the fastest LLM that separates strong from flat lines, paired with the humour model for
# stand-up; on its own it ranks Reddit jokes at chance, which is why stand-up mixes in the humour model.
DEFAULT_JUDGE_MODEL = "mistral.ministral-3-8b-instruct"
JUDGE_TIMEOUT_S = float(os.environ.get("MC_JUDGE_TIMEOUT_S", "0.35"))
# The stand-up ensemble: the humour model's share, and what a missing LLM counts as (a typical joke).
HUMOR_WEIGHT = 0.7
NEUTRAL = 0.5
HUMOR_MODEL = "humor-roberta-large-int8"
# How long past the LLM's budget the verdict waits for the humour model (it takes about 25-60 ms and starts first).
HUMOR_GRACE_S = 0.05

# The calibrated LLM's stand-up score -> its percentile among 300 held-out rJokes dev jokes (mid-rank of ties;
# deploy/calibrate, 2026-10-12). It answers in a few distinct steps, so the map is a step table, interpolated.
CALIBRATED_LLM = "mistral.ministral-3-8b-instruct"
LLM_PERCENTILES: tuple[tuple[float, float], ...] = (
    (0.22, 0.008), (0.24, 0.02), (0.26, 0.04), (0.46, 0.108), (0.5, 0.205), (0.54, 0.258),
    (0.74, 0.282), (0.78, 0.457), (0.84, 0.763), (0.86, 0.943), (0.88, 0.98), (0.92, 0.992),
)
JUDGE_MAX_TOKENS = 48
REASON_MAX = 60

DIMS: dict[JudgeAct, tuple[str, ...]] = {
    "standup": ("punch", "surprise"),
    "poetry": ("imagery", "sound", "turn"),
    "speech": ("point", "rhetoric", "call"),
}

# How the act's dimensions make the one score the engine weighs (each row sums to 1).
SCORE_WEIGHTS: dict[JudgeAct, dict[str, float]] = {
    "standup": {"punch": 0.6, "surprise": 0.4},
    "poetry": {"imagery": 0.4, "sound": 0.3, "turn": 0.3},
    "speech": {"point": 0.5, "rhetoric": 0.25, "call": 0.25},
}

_RUBRIC: dict[JudgeAct, str] = {
    "standup": (
        "You rate one line from a live stand-up set: how hard would a comedy-club audience laugh at it? Judge only the "
        "words; the earlier lines are its setup. Most lines are not jokes: use the whole range.\n"
        'Reply with JSON only: {"punch": 0-1, "surprise": 0-1, "reason": "at most 8 words"}\n'
        "punch: the line pays off its setup as a joke (0 no joke, 0.5 a mild smile, 1 a big laugh).\n"
        "surprise: it turns the expectation the setup built (0 predictable, 1 a sharp twist)."
    ),
    "poetry": (
        "You rate one line from a spoken-word poem, read aloud at a slam: would the room snap for it? Judge only the "
        "words; the earlier lines are its context. Most lines are plain: use the whole range.\n"
        'Reply with JSON only: {"imagery": 0-1, "sound": 0-1, "turn": 0-1, "reason": "at most 8 words"}\n'
        "imagery: a concrete, fresh image (0 abstract or cliche, 1 vivid and new).\n"
        "sound: rhyme, rhythm, alliteration or repetition you can hear (0 flat prose, 1 musical).\n"
        "turn: a shift in thought or feeling, a line that lands (0 none, 1 a strong turn)."
    ),
    "speech": (
        "You rate one line from a speech: would the audience applaud it? Judge only the words; the earlier lines are "
        "its context. Most lines are ordinary: use the whole range.\n"
        'Reply with JSON only: {"point": 0-1, "rhetoric": 0-1, "call": 0-1, "reason": "at most 8 words"}\n'
        "point: a clear, quotable point (0 filler, 1 a line people repeat).\n"
        "rhetoric: a device you can hear: a triad, a contrast, a repetition, a question (0 none, 1 a strong one).\n"
        "call: a call to act or to believe (0 none, 1 a rousing one)."
    ),
}

FIRST_OBJECT = re.compile(r"\{.*\}", re.S)
DIGIT = re.compile(r"\d")


def model_id() -> str:
    return os.environ.get("MC_JUDGE_MODEL_ID") or DEFAULT_JUDGE_MODEL


def messages(req: JudgeRequest) -> list[dict]:
    """The whole prompt: the act's rubric, then at most the last three earlier lines and the line itself."""
    context = [c.strip() for c in req.context if c.strip()][-3:]
    before = "\n".join(f"Earlier: {c}" for c in context)
    user = f"{before}\nLine: {req.text.strip()}" if before else f"Line: {req.text.strip()}"
    return [{"role": "system", "content": _RUBRIC[req.act]}, {"role": "user", "content": user}]


def _unit(value: Any) -> float | None:
    """A model's 0..1 rating, clamped; a 0..10 or 0..100 scale is read as such. None when it is not a number."""
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if x != x:  # NaN
        return None
    if x > 1:
        x = x / 10 if x <= 10 else x / 100
    return min(1.0, max(0.0, x))


def parse(act: JudgeAct, raw: str) -> tuple[dict[str, float], str | None]:
    """The act's dimensions from the model's JSON (fences and stray text around it are ignored). ValueError when
    any dimension is missing or not a number: a partial verdict is no verdict."""
    match = FIRST_OBJECT.search(raw or "")
    if not match:
        raise ValueError("the judge returned no JSON")
    data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("the judge returned no JSON object")
    dims: dict[str, float] = {}
    for name in DIMS[act]:
        x = _unit(data.get(name))
        if x is None:
            raise ValueError(f"the judge gave no number for {name!r}")
        dims[name] = round(x, 3)
    reason = data.get("reason")
    if isinstance(reason, str):
        reason = " ".join(reason.split()).strip(" .\"'")
        # A reason is a few words of the model's read, never a measurement: one that quotes a number is dropped.
        if not reason or DIGIT.search(reason):
            reason = None
        elif len(reason) > REASON_MAX:
            reason = reason[: REASON_MAX - 1].rsplit(" ", 1)[0] + "…"
    else:
        reason = None
    return dims, reason


def combine(act: JudgeAct, dims: dict[str, float]) -> float:
    return round(sum(w * dims[k] for k, w in SCORE_WEIGHTS[act].items()), 3)


def llm_percentile(score: float, model: str) -> float:
    """The calibrated LLM's stand-up score on the percentile scale (monotone, piecewise linear); another model's score
    as it is, since no map was measured for it."""
    if model != CALIBRATED_LLM:
        return score
    table = LLM_PERCENTILES
    if score <= table[0][0]:
        return round(table[0][1] * score / table[0][0], 3)
    if score >= table[-1][0]:
        v, p = table[-1]
        return round(p + (1 - p) * (score - v) / (1 - v), 3)
    for (a, pa), (b, pb) in zip(table, table[1:]):
        if a <= score <= b:
            return round(pa + (pb - pa) * (score - a) / (b - a), 3)
    return score


def ensemble(humor_pct: float | None, llm_pct: float | None) -> float | None:
    """The stand-up score from what answered in time (see the module docstring); None when neither did."""
    if humor_pct is not None:
        return round(HUMOR_WEIGHT * humor_pct + (1 - HUMOR_WEIGHT) * (NEUTRAL if llm_pct is None else llm_pct), 3)
    return llm_pct


_humor_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mc-humor")
_humor_state = {"on": None}  # None until first asked: whether the humour model is installed and loads
_humor_lock = threading.Lock()


def humor_on() -> bool:
    """Whether the stand-up humour model is installed (MC_HUMOR_MODEL_DIR and its deps); checked once."""
    with _humor_lock:
        if _humor_state["on"] is None:
            try:
                from . import humor

                _humor_state["on"] = humor.enabled()
            except Exception:  # noqa: BLE001 - the optional deps are absent: the LLM judges alone
                _humor_state["on"] = False
        return bool(_humor_state["on"])


def warm() -> None:
    """Load the humour model at boot (about 1 s) so the first stand-up line does not pay for it. Never raises."""
    if not humor_on():
        return
    try:
        from . import humor

        humor.load()
        log.info("judge: humour model loaded (%s)", humor.model_dir())
    except Exception as err:  # noqa: BLE001 - every verdict then comes from the LLM alone
        log.warning("judge: the humour model did not load (%s); the LLM judges alone", type(err).__name__)
        with _humor_lock:
            _humor_state["on"] = False


def _humor_score(req: JudgeRequest) -> float:
    from . import humor

    return float(humor.score(req.text, list(req.context))["score"])


def params(mid: str) -> dict:
    """JSON mode, a tiny answer, no sampling noise. Reasoning models get a little room and low effort."""
    if mid.startswith("openai.gpt-oss"):
        return {"max_tokens": 400, "reasoning_effort": "low", "response_format": {"type": "json_object"}}
    return {"max_tokens": JUDGE_MAX_TOKENS, "temperature": 0, "response_format": {"type": "json_object"}}


async def _ask(req: JudgeRequest, mid: str, timeout_s: float) -> str:
    from . import mc  # the lasting client and loop; imported here so the models stay importable without Strands

    client = mc._client(mc.region()).with_options(timeout=httpx.Timeout(timeout_s + 0.2))
    mc._last_call = time.monotonic()
    try:
        out = await client.chat.completions.create(model=mid, messages=messages(req), **params(mid))
    finally:
        mc._last_call = time.monotonic()
    return out.choices[0].message.content or ""


def verdict(req: JudgeRequest, model: str | None = None, timeout_s: float | None = None) -> dict:
    """Exactly one of {"verdict": {...}} or {"unavailable": {...}}. Never raises, never waits past the budget (plus
    HUMOR_GRACE_S for a humour model that started first)."""
    from . import mc

    mid = model or model_id()
    budget = JUDGE_TIMEOUT_S if timeout_s is None else timeout_s
    start = time.monotonic()
    humor_future: Future | None = _humor_pool.submit(_humor_score, req) if req.act == "standup" and humor_on() else None
    future = asyncio.run_coroutine_threadsafe(_ask(req, mid, budget), mc._event_loop())
    dims: dict[str, float] | None = None
    reason: str | None = None
    try:
        dims, reason = parse(req.act, future.result(timeout=budget))
    except FutureTimeout:
        future.cancel()
        gone = McUnavailable(reason="timeout", detail=f"no verdict within {budget:g} s")
    except ValueError as err:
        gone = McUnavailable(reason="model-error", detail=str(err)[:160])
    except Exception as err:  # noqa: BLE001 - any failure is an honest "unavailable"; the room uses timing and features
        gone = mc.classify(err)
    humor_pct: float | None = None
    if humor_future is not None:
        try:
            humor_pct = humor_future.result(timeout=max(budget + HUMOR_GRACE_S - (time.monotonic() - start), 0.0))
        except Exception as err:  # noqa: BLE001 - late or failed: the LLM's answer stands alone
            humor_future.cancel()
            log.info("judge/standup line %d: humour model missed (%s)", req.line_id, type(err).__name__)
    if dims is None and humor_pct is None:
        log.info("judge/%s line %d: unavailable (%s) after %.0f ms", req.act, req.line_id, gone.reason,
                 (time.monotonic() - start) * 1000)
        return {"unavailable": gone.model_dump(exclude_none=True)}
    if req.act == "standup":
        llm_pct = llm_percentile(combine(req.act, dims), mid) if dims is not None else None
        score = ensemble(humor_pct, llm_pct)
        shown = {**(dims or {}), **({"humor": round(humor_pct, 3)} if humor_pct is not None else {})}
        used = "+".join(x for x in (HUMOR_MODEL if humor_pct is not None else "", mid if dims is not None else "") if x)
    else:
        score, shown, used = combine(req.act, dims), dims, mid
    ms = round((time.monotonic() - start) * 1000)
    out = JudgeVerdict(line_id=req.line_id, act=req.act, score=score, dims=shown, reason=reason, model=used, ms=ms,
                       source="ai")
    log.info("judge/%s line %d: %.2f in %d ms (%s)", req.act, req.line_id, out.score, ms, used)
    return {"verdict": out.model_dump(exclude_none=True)}
