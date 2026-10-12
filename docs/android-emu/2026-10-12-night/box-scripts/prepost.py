"""Is each crowd cue audible? Level in the 3 s after a cue against the 3 s before it.

usage: python prepost.py REC.mkv CUES.txt   (cues.py output, which adds +1.2 s; subtracted back here)
"""
import subprocess
import sys

import numpy as np

SR = 16000
pcm = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", sys.argv[1], "-vn", "-ac", "1", "-ar", str(SR),
                      "-f", "s16le", "-"], check=True, capture_output=True).stdout
a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def db(x0: float, x1: float) -> float:
    s = a[int(x0 * SR): int(x1 * SR)]
    return float(20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9))


deltas = []
for line in open(sys.argv[2]):
    t, label, clock = line.split()[:3]
    c = float(t) - 1.2
    pre, post = db(c - 3.2, c - 0.2), db(c + 0.3, c + 3.3)
    deltas.append(post - pre)
    print(f"{clock} {label:<9} before {pre:6.1f} dB  after {post:6.1f} dB  change {post - pre:+5.1f} dB")
d = np.array(deltas)
print(f"{len(d)} cues: change median {np.median(d):+.1f} dB, min {d.min():+.1f}, max {d.max():+.1f}; louder by 3 dB or more: {(d >= 3).sum()}")
