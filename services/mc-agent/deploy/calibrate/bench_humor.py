"""Measure mc_agent.humor as the service would run it (a fresh process, batch size 1): load time, resident memory,
milliseconds per line at several thread counts, its Spearman on the test sample, and the dev-sample quantiles that
humor.QUANTILES holds (internal evaluation; build box).

    MC_HUMOR_MODEL_DIR=~/judge/models/humor-int8 PYTHONPATH=~/judge/mc-agent/src \
        ~/judge/calib-venv/bin/python bench_humor.py ~/judge/data/sample.jsonl ~/judge/data/dev_sample.jsonl --threads 2
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np


def rss_mb() -> float:
    for line in Path("/proc/self/status").read_text().splitlines():
        if line.startswith("VmRSS:"):
            return int(line.split()[1]) / 1024
    return float("nan")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("test", type=Path)
    ap.add_argument("dev", type=Path)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--n", type=int, default=1000)
    a = ap.parse_args()
    os.environ["MC_HUMOR_THREADS"] = str(a.threads)
    before = rss_mb()
    t = time.monotonic()
    from mc_agent import humor

    humor.load()
    load_s = time.monotonic() - t
    after = rss_mb()
    test = [json.loads(x) for x in a.test.read_text().splitlines()][: a.n]
    ms, raw = [], []
    for r in test:
        t = time.perf_counter()
        raw.append(humor.load().raw(humor.text_for(r["body"], [r["title"]])))
        ms.append((time.perf_counter() - t) * 1000)
    from scipy.stats import spearmanr

    out = {
        "threads": a.threads, "load_s": round(load_s, 2), "rss_mb_before": round(before), "rss_mb_loaded": round(after),
        "rss_mb_after_run": round(rss_mb()), "n": len(test),
        "ms_p50": round(float(np.percentile(ms, 50)), 1), "ms_p90": round(float(np.percentile(ms, 90)), 1),
        "ms_p99": round(float(np.percentile(ms, 99)), 1),
        "rho_test": round(float(spearmanr([r["score"] for r in test], raw).statistic), 3),
    }
    if a.threads == 2:
        dev = [json.loads(x) for x in a.dev.read_text().splitlines()]
        dev_raw = [humor.load().raw(humor.text_for(r["body"], [r["title"]])) for r in dev]
        out["dev_quantiles"] = [round(float(q), 3) for q in np.percentile(dev_raw, np.arange(0, 101, 5))]
    print(json.dumps(out))


if __name__ == "__main__":
    main()
