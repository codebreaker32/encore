"""Summarise the real-path latency runs (docs/judge-calibration.md): the TV's own timings from tv_lat.sh (a fresh
connection per request) and tv_lat_ka.sh (one kept-alive connection), the laptop's curl timings through the SSH
tunnel, and the service's own `ms` from each verdict. Prints one JSON object; light enough for the laptop.

    python3 latency.py LAT_DIR
LAT_DIR holds tv_judge.<judge>.txt, tv_judge_ka.<judge>.txt, tv_ping.txt, tv_ping_ka.txt, laptop_ping.<judge>.txt,
laptop_judge.<judge>.txt as the driver wrote them.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def pct(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 1)


def stats(xs: list[float]) -> dict:
    return {"n": len(xs), "p50": pct(xs, 50), "p90": pct(xs, 90), "p99": pct(xs, 99),
            "max": round(max(xs), 1) if xs else None}


MS = re.compile(r'"ms": (\d+)')


def tv_fresh(path: Path) -> tuple[list[float], list[float], int]:
    total, service, unavailable = [], [], 0
    for line in path.read_text().splitlines():
        parts = line.split(" ", 3)
        if len(parts) < 3:
            continue
        total.append((float(parts[2]) - float(parts[1])) * 1000)
        body = parts[3] if len(parts) > 3 else ""
        m = MS.search(body)
        if '"verdict"' in body and m:
            service.append(float(m.group(1)))
        else:
            unavailable += 1
    return total, service, unavailable


def tv_ka(path: Path) -> tuple[list[float], list[float], int]:
    total, service, bodies = [], [], 0
    for line in path.read_text().splitlines():
        if line.startswith("body "):
            bodies += 1
            m = MS.search(line)
            if '"verdict"' in line and m:
                service.append(float(m.group(1)))
            continue
        parts = line.split(" ")
        if len(parts) == 3:
            total.append((float(parts[2]) - float(parts[1])) * 1000)
    return total, service, bodies - len(service)


def main() -> None:
    d = Path(sys.argv[1])
    out: dict = {"judges": {}}
    for f in sorted(d.glob("tv_judge.*.txt")):
        name = f.name[len("tv_judge."):-4]
        total, service, bad = tv_fresh(f)
        row = {"tv_fresh": stats(total), "service_ms": stats(service), "not_a_verdict": bad}
        ka = d / f"tv_judge_ka.{name}.txt"
        if ka.exists():
            t2, s2, bad2 = tv_ka(ka)
            row["tv_keepalive"] = stats(t2)
            row["service_ms_keepalive"] = stats(s2)
            row["not_a_verdict_keepalive"] = bad2
        lj = d / f"laptop_judge.{name}.txt"
        if lj.exists():
            row["laptop_fresh"] = stats([float(x.rsplit(" ", 1)[1]) * 1000 for x in lj.read_text().splitlines() if x.strip()])
        out["judges"][name] = row
    if (d / "tv_ping.txt").exists():
        out["tv_ping_fresh"] = stats(tv_fresh(d / "tv_ping.txt")[0])
    if (d / "tv_ping_ka.txt").exists():
        out["tv_ping_keepalive"] = stats(tv_ka(d / "tv_ping_ka.txt")[0])
    pings = [float(x) * 1000 for f in d.glob("laptop_ping.*.txt") for x in f.read_text().split()]
    out["laptop_ping_fresh"] = stats(pings)
    json.dump(out, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
