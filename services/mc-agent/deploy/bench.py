"""Latency of the MC per kind: the local service (MC_BACKEND=local) against the forwarder to AgentCore
(MC_BACKEND=agentcore), measured as the TV sees it (POST /invocations on this machine, wall time to the full body).

  uv run python deploy/bench.py [--runs 5] [--backends local agentcore] [--arn ARN] [--warm] [--first] [--parallel]

--warm      one service per backend; one unmeasured call per kind, then --runs calls per kind, the backends
            interleaved so both see the same model and network conditions.
--first     a fresh service per call: the first request after start. For agentcore the keep-warm is off and each
            process takes a new session, so every call meets a cold microVM (the process stops its session on exit).
--parallel  a line and a debrief sent together, on one service (one AgentCore session), --runs times.
Kinds default to line-intro line-between debrief chat, all with speak: true. Prints a Markdown table.
Run it on the build box from services/mc-agent; it uses ports 8093 (local) and 8094 (forwarder).
"""

import argparse
import json
import os
import signal
import statistics
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke import describe, payload, post  # noqa: E402

PORTS = {"local": 8093, "agentcore": 8094}
LOGS = Path(os.environ.get("ENCORE_MC_BENCH_LOGS", Path.home() / "encore-mc-build" / "bench-logs"))


class Service:
    """One MC service process on this machine."""

    def __init__(self, backend: str, arn: str, keep_warm: bool, tag: str):
        self.backend, self.port = backend, PORTS[backend]
        env = {**os.environ, "MC_BACKEND": backend, "PORT": str(self.port)}
        if backend == "agentcore":
            env.update(MC_AGENTCORE_ARN=arn, MC_AGENTCORE_KEEPWARM_S="300" if keep_warm else "0")
        LOGS.mkdir(parents=True, exist_ok=True)
        self.log = open(LOGS / f"{backend}-{tag}.log", "w")
        self.proc = subprocess.Popen([sys.executable, "-m", "mc_agent.app"], env=env, stdout=self.log,
                                     stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/ping", timeout=1) as res:
                    if res.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            self.stop()
            raise RuntimeError(f"{backend} service did not start; see {self.log.name}")
        if backend == "agentcore" and keep_warm:  # wait for the warm-up call, as a TV would meet it
            while time.monotonic() < deadline and "warm-up" not in Path(self.log.name).read_text():
                time.sleep(0.2)

    def call(self, kind: str) -> tuple[float, str]:
        body = json.dumps(payload(kind)).encode()
        start = time.monotonic()
        try:
            data = post(f"http://127.0.0.1:{self.port}", body, timeout=30)
        except Exception as err:  # noqa: BLE001
            return time.monotonic() - start, f"failed:{type(err).__name__}"
        took = time.monotonic() - start
        shape, _, audio = describe(data)
        return took, shape + ("" if audio or shape.startswith(("unavailable", "error")) else "(no audio)")

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
            try:
                self.proc.wait(15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.log.close()


def stats(xs: list[float]) -> str:
    return f"{statistics.median(xs):.2f} / {max(xs):.2f}" if xs else "–"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--backends", nargs="+", default=["local", "agentcore"], choices=list(PORTS))
    ap.add_argument("--kinds", nargs="+", default=["line-intro", "line-between", "debrief", "chat"])
    ap.add_argument("--arn", default=os.environ.get("MC_AGENTCORE_ARN", ""))
    ap.add_argument("--warm", action="store_true")
    ap.add_argument("--first", action="store_true")
    ap.add_argument("--parallel", action="store_true")
    args = ap.parse_intermixed_args()
    if not (args.warm or args.first or args.parallel):
        args.warm = args.first = True
    if "agentcore" in args.backends and not args.arn:
        ap.error("the agentcore backend needs --arn or MC_AGENTCORE_ARN")
    results: dict[tuple[str, str, str], list[float]] = {}
    shapes: dict[tuple[str, str, str], list[str]] = {}
    load = [os.getloadavg()[0]]

    def record(mode: str, backend: str, kind: str, took: float, shape: str) -> None:
        results.setdefault((mode, backend, kind), []).append(took)
        shapes.setdefault((mode, backend, kind), []).append(shape)
        print(f"{mode:8} {backend:9} {kind:13} {took:6.2f}s {shape}", flush=True)

    if args.warm:
        services = {b: Service(b, args.arn, keep_warm=True, tag="warm") for b in args.backends}
        try:
            for kind in args.kinds:
                for s in services.values():
                    s.call(kind)  # unmeasured: warms this kind's path
            for _ in range(args.runs):
                for kind in args.kinds:
                    for b, s in services.items():
                        record("warm", b, kind, *s.call(kind))
        finally:
            for s in services.values():
                s.stop()
        load.append(os.getloadavg()[0])

    if args.first:
        for i in range(args.runs):
            for kind in args.kinds:
                for b in args.backends:
                    s = Service(b, args.arn, keep_warm=False, tag=f"first-{i}-{kind}")
                    try:
                        record("first", b, kind, *s.call(kind))
                    finally:
                        s.stop()
        load.append(os.getloadavg()[0])

    if args.parallel:
        for b in args.backends:
            s = Service(b, args.arn, keep_warm=True, tag="parallel")
            try:
                s.call("line-end")
                s.call("debrief")
                for _ in range(args.runs):
                    out: dict[str, tuple[float, str]] = {}
                    threads = [threading.Thread(target=lambda k=k: out.__setitem__(k, s.call(k))) for k in ("line-end", "debrief")]
                    for t in threads:
                        t.start()
                    for t in threads:
                        t.join()
                    for k in ("line-end", "debrief"):
                        record("parallel", b, k, *out[k])
            finally:
                s.stop()

    modes = [m for m, on in (("warm", args.warm), ("first", args.first), ("parallel", args.parallel)) if on]
    kinds = args.kinds + (["line-end"] if args.parallel and "line-end" not in args.kinds else []) + \
        (["debrief"] if args.parallel and "debrief" not in args.kinds else [])
    print(f"\nload average (1 min) during the run: {', '.join(f'{x:.1f}' for x in load)} on {os.cpu_count()} CPUs\n")
    print("| mode | kind | local median / max (s) | AgentCore median / max (s) | AgentCore overhead (median) | answers |")
    print("|---|---|---|---|---|---|")
    for mode in modes:
        for kind in kinds:
            loc, ac = results.get((mode, "local", kind), []), results.get((mode, "agentcore", kind), [])
            if not loc and not ac:
                continue
            over = f"{statistics.median(ac) - statistics.median(loc):+.2f} s" if loc and ac else "–"
            seen = sorted(set(shapes.get((mode, "local", kind), []) + shapes.get((mode, "agentcore", kind), [])))
            print(f"| {mode} | {kind} | {stats(loc)} | {stats(ac)} | {over} | {', '.join(seen)} |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
