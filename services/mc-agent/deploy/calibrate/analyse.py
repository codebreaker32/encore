"""Agreement of every candidate judge with the held-out rJokes sample, and pairwise accuracy on the sanity pairs
(docs/judge-calibration.md). Reads what run_llm.py / run_roberta.py / the latency runs wrote under WORK and prints
one JSON summary (internal evaluation; runs on the build box).

    ~/judge/calib-venv/bin/python -I analyse.py ~/judge/data/sample.jsonl ~/judge/calib/sanity_pairs.json ~/judge/work

Spearman's rho against the log-upvote score, with a 95% percentile bootstrap CI (2,000 resamples of the jokes, seed
7); for each judge also the paired bootstrap of rho minus the best simple baseline's rho. Ties count as half in the
pairwise accuracy. A judge's missing answers are left out of its own rho (n is reported).
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
from scipy.stats import rankdata, spearmanr

B = 2000
RNG = np.random.default_rng(7)


def last_by_key(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "key" in r and ("verdict" in r or r["key"] not in out):
            out[r["key"]] = r
    return out


def rho(x: np.ndarray, y: np.ndarray) -> float:
    return float(spearmanr(x, y).statistic)


def boot(gold: np.ndarray, pred: np.ndarray, base: np.ndarray | None, idx: np.ndarray) -> dict:
    """rho, its CI, and (with base) the CI of rho(pred) - rho(base) on the same resamples."""
    r = rho(gold, pred)
    rs, ds = [], []
    for row in idx:
        g, p = gold[row], pred[row]
        rs.append(rho(g, p))
        if base is not None:
            ds.append(rs[-1] - rho(g, base[row]))
    out = {"rho": round(r, 3), "ci": [round(float(np.percentile(rs, 2.5)), 3), round(float(np.percentile(rs, 97.5)), 3)]}
    if base is not None:
        out["minus_best_baseline_ci"] = [round(float(np.percentile(ds, 2.5)), 3), round(float(np.percentile(ds, 97.5)), 3)]
    return out


def z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() or 1.0)


def pairwise(scores: dict[str, float], pairs: list[dict], act: str) -> dict | None:
    got, n = 0.0, 0
    for p in pairs:
        if p["act"] != act:
            continue
        s, f = scores.get(f"{p['id']}:strong"), scores.get(f"{p['id']}:flat")
        if s is None or f is None:
            continue
        n += 1
        got += 1.0 if s > f else 0.5 if s == f else 0.0
    return {"acc": round(got / n, 3), "n": n} if n else None


def main() -> None:
    sample_path, sanity_path, work = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    sample = [json.loads(x) for x in sample_path.read_text().splitlines()]
    pairs = json.loads(sanity_path.read_text())["pairs"]
    keys = [str(r["id"]) for r in sample]
    gold = np.array([r["score"] for r in sample], float)
    N = len(keys)
    idx = RNG.integers(0, N, size=(B, N))
    summary: dict = {"n": N, "rjokes": {}, "sanity": {}, "service_ms": {}}

    # Baselines.
    punch_words = np.array([len(r["body"].split()) for r in sample], float)
    rnd = np.array(random.Random(11).sample(range(N), N), float)
    baselines = {"baseline: punch length (words)": punch_words, "baseline: random": rnd}
    # Tier 1: packages/crowd tools/tier1-score.ts, {"id", "tier1": 0..0.3, "features"} per line.
    tier1 = work / "tier1_out.jsonl"
    if tier1.exists():
        t1 = {str(json.loads(x)["id"]): json.loads(x)["tier1"] for x in tier1.read_text().splitlines() if x.strip()}
        if all(k in t1 and t1[k] is not None for k in keys):
            baselines["Tier 1 (deterministic content score)"] = np.array([t1[k] for k in keys], float)
            summary["tier1_nonzero"] = int(sum(1 for k in keys if t1[k] > 0))
    best_base = max(("baseline: punch length (words)", "baseline: random"), key=lambda k: rho(gold, baselines[k]))
    for name, x in baselines.items():
        summary["rjokes"][name] = {**boot(gold, x, None, idx), "n": N}
    base_x = baselines[best_base]
    summary["best_baseline"] = best_base

    # Pairwise accuracy of the length baseline on the sanity sets (longer = stronger).
    length_scores = {f"{p['id']}:{s}": float(len(p[s].split())) for p in pairs for s in ("strong", "flat")}
    summary["sanity"]["baseline: line length (words)"] = {a: pairwise(length_scores, pairs, a) for a in ("standup", "poetry", "speech")}
    t1s = {}
    for act in ("standup", "poetry", "speech"):
        f = work / f"tier1_sanity_{act}_out.jsonl"
        if f.exists():
            t1s.update({json.loads(x)["id"]: json.loads(x)["tier1"] for x in f.read_text().splitlines() if x.strip()})
    if t1s:
        summary["sanity"]["Tier 1 (deterministic content score)"] = {a: pairwise(t1s, pairs, a) for a in ("standup", "poetry", "speech")}

    # LLM judges: score and each dimension alone.
    llm_scores: dict[str, np.ndarray] = {}
    for f in sorted((work / "llm").glob("*.rjokes.*.jsonl")):
        model, _, variant = f.name[: -len(".jsonl")].rsplit(".", 2)
        rows = last_by_key(f)
        ok = [k for k in keys if "verdict" in rows.get(k, {})]
        first_pass_unavail = sum(1 for line in f.read_text().splitlines() if '"unavailable"' in line and '"rate_limit' not in line)
        m = np.array([k in rows and "verdict" in rows[k] for k in keys])
        name = f"{model} [{variant}]"
        for dim in ("score", "punch", "surprise"):
            vals = np.array([(rows[k]["verdict"]["score"] if dim == "score" else rows[k]["verdict"]["dims"][dim]) if m[i] else np.nan
                             for i, k in enumerate(keys)])
            sub = np.where(m)[0]
            sidx = RNG.integers(0, len(sub), size=(B, len(sub)))
            res = boot(gold[sub], vals[sub], base_x[sub], sidx)
            summary["rjokes"][f"{name} {dim}"] = {**res, "n": int(m.sum())}
            if dim == "score":
                llm_scores[name] = vals
        ms = np.array([rows[k]["verdict"]["ms"] for k in ok], float)
        summary["service_ms"][name] = {"batch_p50": float(np.percentile(ms, 50)), "batch_p90": float(np.percentile(ms, 90)),
                                       "non_verdict_records": first_pass_unavail,
                                       "distinct_scores": int(len(set(llm_scores[name][m].round(3))))}

    # RoBERTa variants.
    rob: dict[str, np.ndarray] = {}
    for f in sorted((work / "roberta").glob("*.jsonl")):
        rows = [json.loads(x) for x in f.read_text().splitlines()]
        meta = next((r["meta"] for r in rows if "meta" in r), {})
        preds = {r["key"]: r for r in rows if "key" in r}
        if not all(k in preds for k in keys):
            continue
        x = np.array([preds[k]["pred"] for k in keys])
        ms = np.array([preds[k]["ms"] for k in keys])
        name = f"humor-roberta-large {f.stem}"
        rob[name] = x
        summary["rjokes"][name] = {**boot(gold, x, base_x, idx), "n": N, "load_s": meta.get("load_s"),
                                   "ms_p50": round(float(np.percentile(ms, 50)), 1), "ms_p90": round(float(np.percentile(ms, 90)), 1),
                                   "ms_p99": round(float(np.percentile(ms, 99)), 1)}
        sc = {k: v["pred"] for k, v in preds.items() if v.get("set") == "sanity"}
        if sc:
            summary["sanity"][name] = {"standup": pairwise(sc, pairs, "standup")}

    # Ensembles: RoBERTa (int8 ONNX if present) with each LLM score, z- and rank-averaged, on the jokes both answered.
    rname = next((n for n in rob if "onnx-int8" in n), next(iter(rob), None))
    if rname:
        for name, v in llm_scores.items():
            m = ~np.isnan(v)
            sub = np.where(m)[0]
            sidx = RNG.integers(0, len(sub), size=(B, len(sub)))
            r, l = rob[rname][sub], v[sub]
            summary["rjokes"][f"ensemble z(RoBERTa)+z({name})"] = {**boot(gold[sub], z(r) + z(l), base_x[sub], sidx), "n": len(sub)}
            summary["rjokes"][f"ensemble rank(RoBERTa)+rank({name})"] = {
                **boot(gold[sub], rankdata(r) + rankdata(l), base_x[sub], sidx), "n": len(sub)}
            summary["rjokes"][f"ensemble 0.7 rank(RoBERTa)+0.3 rank({name})"] = {
                **boot(gold[sub], 0.7 * rankdata(r) + 0.3 * rankdata(l), base_x[sub], sidx), "n": len(sub)}

    # LLM sanity pairs, and the same 50/50 ensembles on the stand-up pairs: each judge's score as its percentile among
    # its own scores on the rJokes sample (a fixed table, as a service would hold), averaged. On rJokes itself this
    # is exactly the rank average above.
    rsan = {}
    if rname:
        f = work / "roberta" / (rname.split(" ", 1)[1] + ".jsonl")
        rsan = {r["key"]: r["pred"] for r in map(json.loads, f.read_text().splitlines()) if r.get("set") == "sanity"}

    def ecdf(ref: np.ndarray, x: float) -> float:
        ref = ref[~np.isnan(ref)]
        return float((np.sum(ref < x) + 0.5 * np.sum(ref == x)) / len(ref))

    for f in sorted((work / "llm").glob("*.sanity.*.jsonl")):
        model, _, variant = f.name[: -len(".jsonl")].rsplit(".", 2)
        name = f"{model} [{variant}]"
        rows = last_by_key(f)
        sc = {k: r["verdict"]["score"] for k, r in rows.items() if "verdict" in r}
        summary["sanity"][name] = {a: pairwise(sc, pairs, a) for a in ("standup", "poetry", "speech")}
        if rsan and name in llm_scores:
            ens = {k: ecdf(rob[rname], rsan[k]) + ecdf(llm_scores[name], v) for k, v in sc.items() if k in rsan}
            summary["sanity"][f"ensemble rank(RoBERTa)+rank({name})"] = {"standup": pairwise(ens, pairs, "standup")}
            ens7 = {k: 0.7 * ecdf(rob[rname], rsan[k]) + 0.3 * ecdf(llm_scores[name], v) for k, v in sc.items() if k in rsan}
            summary["sanity"][f"ensemble 0.7 rank(RoBERTa)+0.3 rank({name})"] = {"standup": pairwise(ens7, pairs, "standup")}
    if rsan:
        summary["roberta_sanity_raw"] = {p["id"]: [rsan.get(f"{p['id']}:strong"), rsan.get(f"{p['id']}:flat")]
                                         for p in pairs if p["act"] == "standup"}

    # Exploratory: a weighted percentile mix w * RoBERTa + (1 - w) * LLM. The weight is looked at on the DEV sample
    # (work/dev, work/dev_roberta), then reported on the test sample and the stand-up pairs; nothing here was tuned on
    # the test sample.
    dev_path = sample_path.parent / "dev_sample.jsonl"
    drob = work / "dev_roberta" / "onnx-int8.t2.jsonl"
    if rname and rsan and dev_path.exists() and drob.exists():
        dev = [json.loads(x) for x in dev_path.read_text().splitlines()]
        dkeys = [str(r["id"]) for r in dev]
        dgold = np.array([r["score"] for r in dev], float)
        dr = {r["key"]: r["pred"] for r in map(json.loads, drob.read_text().splitlines()) if "key" in r}
        grid = {}
        for name, v in llm_scores.items():
            model = name.split(" ")[0]
            dl = last_by_key(work / "dev" / f"{model}.rjokes.base.jsonl")
            dk = [k for k in dkeys if k in dr and "verdict" in dl.get(k, {})]
            if len(dk) < 250:
                continue
            g = dgold[[dkeys.index(k) for k in dk]]
            drr = rankdata([dr[k] for k in dk]) / len(dk)
            dll = rankdata([dl[k]["verdict"]["score"] for k in dk]) / len(dk)
            m = ~np.isnan(v)
            tr, tl = rankdata(rob[rname][m]) / m.sum(), rankdata(v[m]) / m.sum()
            sl = last_by_key(work / "llm" / f"{model}.sanity.base.jsonl")
            rows = {}
            for w in (0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
                sc = {k: w * ecdf(rob[rname], rsan[k]) + (1 - w) * ecdf(v, r["verdict"]["score"])
                      for k, r in sl.items() if "verdict" in r and k in rsan}
                rows[str(w)] = {"dev_rho": round(rho(g, w * drr + (1 - w) * dll), 3),
                                "test_rho": round(rho(gold[m], w * tr + (1 - w) * tl), 3),
                                "standup_pairs": pairwise(sc, pairs, "standup")["acc"]}
            grid[name] = rows
        summary["exploratory_weights"] = grid

    json.dump(summary, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
