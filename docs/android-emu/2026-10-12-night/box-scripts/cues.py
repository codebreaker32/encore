"""Frame times for a recorded set: one per TV hush (a crowd cue), plus extra marks.

usage: python3 -I cues.py PHONE_LOG REC_START_HH:MM:SS.mmm [OFFSET_S] [EXTRA_HH:MM:SS.mmm=label ...]
prints: <seconds into the recording> <label> <wall clock>
"""
import re
import sys


def secs(t: str) -> float:
    h, m, x = t.split(":")
    return int(h) * 3600 + int(m) * 60 + float(x)


log, start = sys.argv[1], secs(sys.argv[2])
off = float(sys.argv[3]) if len(sys.argv) > 3 else 1.2
for line in open(log):
    m = re.match(r"(\S+) \[tv\] hush for ([\d.]+) s", line)
    if m:
        print(f"{secs(m.group(1)) - start + off:.1f} hush{m.group(2)} {m.group(1)}")
for extra in sys.argv[4:]:
    t, label = extra.split("=")
    print(f"{secs(t) - start:.1f} {label} {t}")
