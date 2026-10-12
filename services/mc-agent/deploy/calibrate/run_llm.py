"""Run the Bedrock content judge (`mc_agent.judge.verdict`, the service's own prompt and parser) over the held-out
rJokes sample or the sanity pairs, one model at a time (internal evaluation; results stay on the build box).

Each result is appended to OUT as one JSON line as soon as it arrives, so a dropped connection loses nothing: a rerun
skips the keys already in OUT that got a verdict (and retries the rest).

    cd ~/judge/mc-agent && MC_WARM=0 ~/.local/bin/uv run python ~/judge/calib/run_llm.py \
        --model qwen.qwen3-32b --rjokes ~/judge/data/sample.jsonl --out ~/judge/work/llm/qwen.qwen3-32b.base.jsonl
    ... --sanity ~/judge/calib/sanity_pairs.json --out ~/judge/work/llm/<model>.sanity.base.jsonl

--variant names a rubric override from VARIANTS (default "base" = judge.py as it is). The override only replaces the
system prompt in this process; judge.py is not changed.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from mc_agent import judge
from mc_agent.models import JudgeRequest

# Candidate rubric changes, tried on the same sample. "anchors" adds worked examples of each end of the scale.
VARIANTS: dict[str, dict[str, str]] = {
    "base": {},
    "anchors": {
        "standup": judge._RUBRIC["standup"]
        + "\nAnchors: a plain statement or a pun everyone saw coming: punch 0.1-0.3. A neat wordplay or a fair twist: "
        "0.4-0.6. A line that reframes the whole setup in a few words: 0.7-0.9. Keep 0.9+ for the rare great one.",
    },
    "critic": {
        "standup": (
            "You are a tough comedy-club booker rating one line from a live stand-up set: how hard would the room "
            "laugh? Judge only the words; the earlier lines are its setup. Be stingy: most lines, and most jokes, get "
            "a polite smile at best.\n"
            'Reply with JSON only: {"punch": 0-1, "surprise": 0-1, "reason": "at most 8 words"}\n'
            "punch: how big the laugh is (0 silence, 0.2 a groan, 0.4 a smile, 0.6 a real laugh, 0.8 a big laugh, "
            "1 the best joke of the night).\n"
            "surprise: it turns the expectation the setup built (0 predictable, or a joke everyone has heard; 1 a "
            "sharp twist nobody saw coming)."
        ),
    },
}


def rjokes_items(path: Path) -> list[dict]:
    items = []
    for line in path.read_text().splitlines():
        r = json.loads(line)
        items.append({"key": str(r["id"]), "act": "standup", "text": r["body"], "context": [r["title"]]})
    return items


def sanity_items(path: Path, act: str | None) -> list[dict]:
    items = []
    for p in json.loads(path.read_text())["pairs"]:
        if act and p["act"] != act:
            continue
        for side in ("strong", "flat"):
            items.append({"key": f"{p['id']}:{side}", "act": p["act"], "text": p[side], "context": p["context"]})
    return items


def done_keys(out: Path) -> set[str]:
    if not out.exists():
        return set()
    keys = set()
    for line in out.read_text().splitlines():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "verdict" in r:
            keys.add(r["key"])
    return keys


def throttled(out: dict) -> bool:
    detail = str(out.get("unavailable", {}).get("detail", ""))
    return "429" in detail or "rate_limit" in detail or "Throttl" in detail


def one(item: dict, model: str, timeout_s: float, n: int) -> dict:
    """One judgement. A 429 (the account's per-model request quota, hit only by this batch's concurrency, never by
    one TV's one line every few seconds) is retried after a backoff and counted, not recorded as the answer."""
    req = JudgeRequest.model_validate(
        {"kind": "judge", "act": item["act"], "lineId": n, "text": item["text"][:400], "context": item["context"][-4:]}
    )
    for attempt in range(8):
        t = time.monotonic()
        out = judge.verdict(req, model=model, timeout_s=timeout_s)
        wall = round((time.monotonic() - t) * 1000)
        if not throttled(out):
            break
        time.sleep(min(30.0, 2.0 * 2**attempt) * (0.5 + random.random()))
    return {"key": item["key"], "act": item["act"], "model": model, "wall_ms": wall, "throttled": attempt, **out}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--rjokes", type=Path)
    src.add_argument("--sanity", type=Path)
    ap.add_argument("--act", help="sanity only: one act")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--timeout", type=float, default=5.0)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--variant", default="base", choices=sorted(VARIANTS))
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    judge._RUBRIC.update(VARIANTS[a.variant])
    items = rjokes_items(a.rjokes) if a.rjokes else sanity_items(a.sanity, a.act)
    if a.limit:
        items = items[: a.limit]
    skip = done_keys(a.out)
    todo = [it for it in items if it["key"] not in skip]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    print(f"{a.model} {a.variant}: {len(todo)} to do, {len(skip)} done", flush=True)
    ok = bad = 0
    reasons: dict[str, int] = {}
    with a.out.open("a") as f, ThreadPoolExecutor(a.workers) as pool:
        futures = [pool.submit(one, it, a.model, a.timeout, i + 1) for i, it in enumerate(todo)]
        for k, fut in enumerate(as_completed(futures), 1):
            r = fut.result()
            r["variant"] = a.variant
            f.write(json.dumps(r) + "\n")
            f.flush()
            if "verdict" in r:
                ok += 1
            else:
                bad += 1
                reason = r["unavailable"].get("reason", "?")
                reasons[reason] = reasons.get(reason, 0) + 1
            if k % 100 == 0:
                print(f"  {k}/{len(todo)} ok={ok} unavailable={bad} {reasons}", flush=True)
    print(f"DONE {a.model} {a.variant}: ok={ok} unavailable={bad} {reasons}", flush=True)
    sys.exit(0)


if __name__ == "__main__":
    main()
