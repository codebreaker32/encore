"""Map each TV hush (a crowd cue) to the scripted line just before it.

usage: python3 -I cuemap.py PHONE_LOG [SKIP_BEFORE_HH:MM:SS]
The 1.5 s hush leases before the first line are the MC's intro voice, not crowd cues; they are listed separately.
"""
import re
import sys
from collections import Counter


def secs(t: str) -> float:
    h, m, x = t.split(":")
    return int(h) * 3600 + int(m) * 60 + float(x)


last = None
first_line = None
cues, leases = [], []
roles = Counter()
for raw in open(sys.argv[1]):
    m = re.match(r"(\S+) \[phone\] (\w+)\s+bit (\d+) · (.*)", raw)
    if m:
        last = (m.group(1), m.group(2), int(m.group(3)), m.group(4))
        roles[m.group(2)] += 1
        first_line = first_line or m.group(1)
        continue
    m = re.match(r"(\S+) \[tv\] hush for ([\d.]+) s", raw)
    if m:
        if last is None:
            leases.append((m.group(1), m.group(2)))
        else:
            gap = secs(m.group(1)) - secs(last[0])
            cues.append((m.group(1), m.group(2), last, gap))
print(f"lines by role: {dict(roles)}")
print(f"hush leases before the first line (the intro voice): {len(leases)} {[l[0] for l in leases]}")
by = Counter(c[2][1] for c in cues)
print(f"{len(cues)} crowd cues; the line before each, by scripted role: {dict(by)}")
for t, dur, (lt, role, bit, text), gap in cues:
    print(f"{t} hush {dur:>4} s  {gap:4.1f} s after  {role:<6} bit {bit:>2}  {text[:80]}")
