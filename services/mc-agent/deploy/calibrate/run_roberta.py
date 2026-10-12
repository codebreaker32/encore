"""Score the held-out rJokes sample and the stand-up sanity pairs with iamahmadyasin/humor-roberta-large (MIT) on CPU,
one variant at a time, at batch size 1 as the service would call it (internal evaluation; runs on the build box).

Variants: fp32 (PyTorch), int8 (PyTorch dynamic quantisation of the Linear layers), onnx (ONNX Runtime, fp32),
onnx-int8 (ONNX Runtime dynamic quantisation, QInt8 weights). The input is "title body", the same string the model
was trained on (rJokes `joke`), truncated to 128 tokens like its training. Each line's milliseconds cover the
tokeniser and the forward pass. Results are appended per item to OUT (a rerun skips what is there).

    ~/judge/calib-venv/bin/python run_roberta.py --variant onnx-int8 --threads 2 \
        --model ~/judge/models/humor-roberta-large --rjokes ~/judge/data/sample.jsonl \
        --sanity ~/judge/calib/sanity_pairs.json --out ~/judge/work/roberta/onnx-int8.t2.jsonl
"""

from __future__ import annotations

import argparse
import json
import resource
import time
from pathlib import Path

import numpy as np

MAX_LEN = 128


def items(rjokes: Path, sanity: Path | None) -> list[dict]:
    out = []
    for line in rjokes.read_text().splitlines():
        r = json.loads(line)
        out.append({"key": str(r["id"]), "set": "rjokes", "text": f"{r['title']} {r['body']}"})
    if sanity:
        for p in json.loads(sanity.read_text())["pairs"]:
            if p["act"] != "standup":
                continue
            for side in ("strong", "flat"):
                out.append({"key": f"{p['id']}:{side}", "set": "sanity", "text": " ".join([*p["context"], p[side]])})
    return out


def onnx_path(model_dir: Path, int8: bool) -> Path:
    """Export once (legacy TorchScript exporter, opset 17, dynamic batch and length), quantise once."""
    import torch
    from transformers import AutoModelForSequenceClassification

    base = model_dir.parent / f"{model_dir.name}-onnx"
    base.mkdir(exist_ok=True)
    fp32 = base / "model.onnx"
    if not fp32.exists():
        m = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
        ids = torch.ones(1, 16, dtype=torch.long)
        torch.onnx.export(
            m, (ids, torch.ones_like(ids)), str(fp32), input_names=["input_ids", "attention_mask"],
            output_names=["logits"], opset_version=17, dynamo=False,
            dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "logits": {0: "b"}},
        )
        del m
    if not int8:
        return fp32
    q = base / "model.int8.onnx"
    if not q.exists():
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantize_dynamic(str(fp32), str(q), weight_type=QuantType.QInt8)
    return q


def loader(variant: str, model_dir: Path, threads: int):
    """A function text -> score, for the variant."""
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_dir)
    if variant in ("fp32", "int8"):
        import torch
        from transformers import AutoModelForSequenceClassification

        torch.set_num_threads(threads)
        m = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
        if variant == "int8":
            m = torch.ao.quantization.quantize_dynamic(m, {torch.nn.Linear}, dtype=torch.qint8)

        def score(text: str) -> float:
            enc = tok(text, return_tensors="pt", truncation=True, max_length=MAX_LEN)
            with torch.inference_mode():
                return float(m(**enc).logits[0, 0])

        return score
    import onnxruntime as ort

    path = onnx_path(model_dir, variant == "onnx-int8")
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])

    def score(text: str) -> float:
        enc = tok(text, return_tensors="np", truncation=True, max_length=MAX_LEN)
        feed = {"input_ids": enc["input_ids"].astype(np.int64), "attention_mask": enc["attention_mask"].astype(np.int64)}
        return float(sess.run(["logits"], feed)[0][0, 0])

    return score


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True, choices=["fp32", "int8", "onnx", "onnx-int8"])
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--rjokes", type=Path, required=True)
    ap.add_argument("--sanity", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    if a.variant.startswith("onnx"):
        onnx_path(a.model, a.variant == "onnx-int8")  # export/quantise outside the timed load
    t0 = time.monotonic()
    score = loader(a.variant, a.model, a.threads)
    score("warm up the kernels")
    load_s = time.monotonic() - t0
    rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    todo = items(a.rjokes, a.sanity)
    if a.limit:
        todo = todo[: a.limit]
    done = set()
    if a.out.exists():
        done = {json.loads(x)["key"] for x in a.out.read_text().splitlines() if '"key"' in x}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("a") as f:
        f.write(json.dumps({"meta": {"variant": a.variant, "threads": a.threads, "load_s": round(load_s, 2),
                                     "rss_after_load_mb": round(rss_mb)}}) + "\n")
        for k, it in enumerate(todo, 1):
            if it["key"] in done:
                continue
            t = time.perf_counter()
            s = score(it["text"])
            ms = (time.perf_counter() - t) * 1000
            f.write(json.dumps({"key": it["key"], "set": it["set"], "pred": round(s, 4), "ms": round(ms, 2)}) + "\n")
            if k % 200 == 0:
                f.flush()
                print(f"  {a.variant} {k}/{len(todo)}", flush=True)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"DONE {a.variant} t{a.threads}: load {load_s:.1f} s, peak RSS {peak:.0f} MB", flush=True)


if __name__ == "__main__":
    main()
