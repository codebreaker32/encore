"""Build the held-out rJokes sample the content judge is calibrated on (internal evaluation only; the data stays out of
the repo, under ~/judge/data on the build box).

rJokes (Weller & Seppi, LREC 2020; github.com/orionw/rJokesData; Reddit licence and terms) ships `data/test.tsv.gz`
as `score<TAB>title + " " + selftext`, where score = int(ln(upvotes)). The title is the setup and the selftext the
punch, so each joke maps to the judge's shape: context = [title], text = body. The title/body split is recovered from
`data/preprocessed.csv.gz` (same `joke` string).

Leakage, as the humor-roberta-large card does it: a test joke is dropped when its normalised text (lowercase, letters
and digits only, single spaces) also appears in train or dev, when it repeats inside test, or when it has fewer than
five words. Then only stage-sized jokes stay (title <= 200 chars, body 1..400 chars) and N are drawn with a fixed seed.
`--split dev` draws the same way from dev (dropping what is also in train or test), for choosing prompt variants.

    python make_sample.py ~/judge/data/rJokesData/data ~/judge/data/sample.jsonl [--n 1000] [--seed 20261012]
    python make_sample.py ~/judge/data/rJokesData/data ~/judge/data/dev_sample.jsonl --split dev --n 300
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
from pathlib import Path

import pandas as pd

NON_WORD = re.compile(r"[^a-z0-9]+")


def norm(text: str) -> str:
    return NON_WORD.sub(" ", str(text).lower()).strip()


def read_split(path: Path) -> pd.DataFrame:
    # The same dialect preprocess.py wrote it with.
    return pd.read_csv(path, sep="\t", header=None, names=["score", "joke"], quoting=csv.QUOTE_NONE, escapechar="\\",
                       encoding="utf-8", dtype={"joke": str}, keep_default_na=False)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=20261012)
    ap.add_argument("--split", default="test", choices=["test", "dev"],
                    help="dev: a separate sample for choosing prompt variants, so the test sample stays untouched")
    a = ap.parse_args()

    splits = {s: read_split(a.data / f"{s}.tsv.gz") for s in ("train", "dev", "test")}
    test = splits.pop(a.split)  # the split sampled from; the other two are what it must not repeat
    seen = set().union(*(set(df.joke.map(norm)) for df in splits.values()))
    pre = pd.read_csv(a.data / "preprocessed.csv.gz", dtype=str, keep_default_na=False)
    # preprocessed.csv: joke = title + " " + selftext (newlines -> spaces), punchline = title, body = selftext.
    split = {}
    for joke, title, body in zip(pre.joke, pre.punchline, pre.body):
        split.setdefault(joke, (title, body))

    stats = {a.split: len(test)}
    test = test.assign(n=test.joke.map(norm))
    leak = test.n.isin(seen)
    stats["in_" + "_or_".join(splits)] = int(leak.sum())
    test = test[~leak]
    dup = test.n.duplicated(keep=False)
    stats["repeated_in_" + a.split] = int(dup.sum())
    test = test[~dup]
    short = test.n.str.split().str.len() < 5
    stats["under_5_words"] = int(short.sum())
    test = test[~short]
    stats["clean_" + a.split] = len(test)

    rows, unmatched = [], 0
    for score, joke in zip(test.score, test.joke):
        if joke not in split:
            unmatched += 1
            continue
        title, body = (" ".join(s.split()) for s in split[joke])
        if not title or not body or len(title) > 200 or len(body) > 400:
            continue
        if body.lower() in ("[removed]", "[deleted]"):
            continue
        rows.append({"score": int(score), "title": title, "body": body})
    stats["unmatched_title_body"] = unmatched
    stats["stage_sized"] = len(rows)

    rng = random.Random(a.seed)
    sample = rng.sample(rows, min(a.n, len(rows)))
    with a.out.open("w") as f:
        for i, r in enumerate(sample, 1):
            f.write(json.dumps({"id": i, **r}) + "\n")
    stats["sample"] = len(sample)
    stats["seed"] = a.seed
    hist: dict[int, int] = {}
    for r in sample:
        hist[r["score"]] = hist.get(r["score"], 0) + 1
    stats["sample_score_hist"] = dict(sorted(hist.items()))
    json.dump(stats, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
