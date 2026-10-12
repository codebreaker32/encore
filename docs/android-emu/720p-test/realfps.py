"""The recording's real frame rate: how many captured frames are new (mpdecimate keeps only frames that changed).

usage: python3 -I realfps.py REC.mkv [START END LABEL ...]
"""
import re
import subprocess
import sys

rec = sys.argv[1]
spans = sys.argv[2:]
out = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", rec, "-an", "-vf",
                      "mpdecimate=hi=256:lo=64:frac=0.1,showinfo", "-fps_mode", "vfr", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
pts = [float(m) for m in re.findall(r"pts_time:([\d.]+)", out)]
total = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_read_packets", "-of", "csv=p=0", rec], capture_output=True, text=True).stdout.strip()
print(f"captured frames: {total}; changed frames: {len(pts)} over {pts[-1] - pts[0]:.1f} s")
for i in range(0, len(spans), 3):
    a, b, label = float(spans[i]), float(spans[i + 1]), spans[i + 2]
    sel = [p for p in pts if a <= p < b]
    gaps = [y - x for x, y in zip(sel, sel[1:])]
    big = sum(1 for g in gaps if g > 0.1)
    print(f"{label:<10} {a:6.1f}-{b:6.1f} s: {len(sel) / (b - a):5.1f} new frames/s; longest hold {max(gaps) * 1000:4.0f} ms;"
          f" holds over 100 ms: {big}; median gap {sorted(gaps)[len(gaps) // 2] * 1000:.0f} ms")
