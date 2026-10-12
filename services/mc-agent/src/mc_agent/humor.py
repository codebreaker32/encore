"""An optional CPU humour model for the stand-up content judge: `iamahmadyasin/humor-roberta-large` (MIT; RoBERTa-large
fine-tuned on rJokes to predict a joke's log-upvotes), exported to ONNX and quantised to int8.

Measured in docs/judge-calibration.md: on a held-out, leakage-cleaned rJokes sample its Spearman rho is about 0.37,
the best of every judge tried, at about 25 ms a line on 2 CPU threads. But it was trained on jokes only: it ranks jokes
and cannot tell a joke from a flat line (chance on our stand-up sanity pairs), so the calibration pairs it with the LLM
judge (0.7 * this percentile + 0.3 * the LLM's). Stand-up only; poetry and speech stay with the LLM judge or Tier 1.

Off unless MC_HUMOR_MODEL_DIR names a directory holding `model.int8.onnx` and `tokenizer.json` (built by
deploy/calibrate/run_roberta.py: the ONNX export of the Hugging Face checkpoint, then onnxruntime's dynamic int8
quantisation). Nothing on the default path imports this module, and its dependencies are an optional group:
`uv sync --group humor` (onnxruntime, tokenizers, numpy).

    from mc_agent import humor
    if humor.enabled():
        out = humor.score("He didn't say which winter.", ["My landlord said he'd fix the heating by winter."])
        # {"score": 0..1 (percentile among held-out rJokes jokes), "raw": log-upvote estimate, "ms": ...}

Env: MC_HUMOR_MODEL_DIR (off when unset), MC_HUMOR_THREADS (default 2).
"""

from __future__ import annotations

import bisect
import os
import threading
import time
from pathlib import Path
from typing import Any

MAX_TOKENS = 128  # the model's training length
CONTEXT_LINES = 2  # the setup: at most the last two earlier lines

# The model's raw output (a log-upvote estimate) at the 0th, 5th, ..., 100th percentile over 300 held-out rJokes dev
# jokes (deploy/calibrate, `--split dev`). `score` is the raw value's percentile among them: monotone, so it keeps
# the model's ranking, and 0.5 means a typical Reddit joke.
QUANTILES: tuple[float, ...] = (  # from deploy/calibrate/bench_humor.py (int8 ONNX, 2026-10-12)
    0.323, 0.481, 0.702, 0.747, 0.791, 0.814, 0.84, 0.865, 0.902, 0.994, 1.046,
    1.093, 1.236, 1.355, 1.516, 1.766, 2.058, 2.31, 2.62, 3.436, 5.157,
)

_lock = threading.Lock()
_model: Any = None


def model_dir() -> Path | None:
    d = os.environ.get("MC_HUMOR_MODEL_DIR")
    return Path(d).expanduser() if d else None


def enabled() -> bool:
    d = model_dir()
    return bool(d and (d / "model.int8.onnx").is_file() and (d / "tokenizer.json").is_file())


def text_for(text: str, context: list[str]) -> str:
    """The string the model reads: the setup then the line, like rJokes' "title body"."""
    setup = [c.strip() for c in context if c.strip()][-CONTEXT_LINES:]
    return " ".join([*setup, text.strip()])


def percentile(raw: float, quantiles: tuple[float, ...] = QUANTILES) -> float:
    """raw -> 0..1, piecewise linear between the stored quantiles (clamped at the ends)."""
    if len(quantiles) < 2:
        return min(1.0, max(0.0, raw / 6.0))
    if raw <= quantiles[0]:
        return 0.0
    if raw >= quantiles[-1]:
        return 1.0
    i = bisect.bisect_right(quantiles, raw) - 1
    lo, hi = quantiles[i], quantiles[i + 1]
    step = 1.0 / (len(quantiles) - 1)
    return round(step * (i + ((raw - lo) / (hi - lo) if hi > lo else 0.0)), 3)


class _Model:
    def __init__(self, d: Path, threads: int) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        # Keep the end of the text: the line itself is the punch; a long setup loses its start, not its end.
        self.tok.enable_truncation(MAX_TOKENS, direction="left")
        self.tok.no_padding()
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.sess = ort.InferenceSession(str(d / "model.int8.onnx"), so, providers=["CPUExecutionProvider"])

    def raw(self, text: str) -> float:
        import numpy as np

        enc = self.tok.encode(text)
        ids = np.array([enc.ids], dtype=np.int64)
        mask = np.array([enc.attention_mask], dtype=np.int64)
        return float(self.sess.run(["logits"], {"input_ids": ids, "attention_mask": mask})[0][0, 0])


def load() -> _Model:
    """Load once (about 1 s and about 0.6 GB resident for the int8 model); later calls reuse it."""
    global _model
    with _lock:
        if _model is None:
            d = model_dir()
            if not d or not enabled():
                raise RuntimeError("MC_HUMOR_MODEL_DIR is not set or lacks model.int8.onnx and tokenizer.json")
            _model = _Model(d, int(os.environ.get("MC_HUMOR_THREADS", "2")))
            _model.raw("warm up")
        return _model


def score(text: str, context: list[str] | None = None) -> dict:
    """One stand-up line: {"score": 0..1, "raw": float, "ms": int}. Raises when the model is off or fails; the caller
    turns that into an honest "unavailable"."""
    m = load()
    start = time.monotonic()
    raw = m.raw(text_for(text, context or []))
    return {"score": percentile(raw), "raw": round(raw, 3), "ms": round((time.monotonic() - start) * 1000)}
