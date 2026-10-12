#!/usr/bin/env python3
"""Before/after pairs for the judges: each pair side by side at half size, labelled, plus the tv numbers table.
    python3 pairs.py <before dir> <after dir> <out dir> [before prefix=crowd3d-v5-before] [after prefix=crowd3d-v5]
→ <out>/crowd3d-v5-pair-<venue>-<state>.png and <out>/crowd3d-v5-numbers.md (from stats-<venue>.json in both dirs).
Runs on the render box (PIL)."""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

before, after, out = sys.argv[1:4]
bp = sys.argv[4] if len(sys.argv) > 4 else 'crowd3d-v5-before'
ap = sys.argv[5] if len(sys.argv) > 5 else 'crowd3d-v5'
op = sys.argv[6] if len(sys.argv) > 6 else 'crowd3d-v5-pair'
lb = sys.argv[7] if len(sys.argv) > 7 else 'AFTER (Batch 1)'
VENUES = ['club', 'theatre', 'openmic', 'arena']
STATES = ['listen', 'laugh-wide', 'laugh', 'preview', 'after']
os.makedirs(out, exist_ok=True)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except OSError:
    font = ImageFont.load_default()
W, H, BAR = 960, 540, 34
for v in VENUES:
    for s in STATES:
        a, b = f'{before}/{bp}-{v}-{s}.png', f'{after}/{ap}-{v}-{s}.png'
        if not (os.path.exists(a) and os.path.exists(b)):
            continue
        img = Image.new('RGB', (W * 2 + 8, H + BAR), (12, 11, 14))
        img.paste(Image.open(a).convert('RGB').resize((W, H)), (0, BAR))
        img.paste(Image.open(b).convert('RGB').resize((W, H)), (W + 8, BAR))
        d = ImageDraw.Draw(img)
        d.text((12, 5), f'BEFORE  {v} · {s}', fill=(200, 190, 170), font=font)
        d.text((W + 20, 5), f'{lb}  {v} · {s}', fill=(230, 200, 120), font=font)
        img.save(f'{out}/{op}-{v}-{s}.png')


def stats(d, p):
    res = {}
    for v in VENUES:
        f = f'{d}/stats-{v}.json'
        if os.path.exists(f):
            for k, x in json.load(open(f)).items():
                res[k.replace(p + '-', '')] = x
    return res


B, A = stats(before, bp), stats(after, ap)
rows = ['| Venue · state | Draws before → after | Triangles before → after | Textures MB before → after |', '| --- | --- | --- | --- |']
for v in VENUES:
    for s in STATES:
        k = f'{v}-{s}'
        if k in B and k in A:
            b, a = B[k], A[k]
            rows.append(f"| {v} · {s} | {b.get('calls')} → {a.get('calls')} | {b.get('triangles', 0) / 1000:.1f}k → {a.get('triangles', 0) / 1000:.1f}k | {b.get('texMB', 0):.1f} → {a.get('texMB', 0):.1f} |")
open(f'{out}/{op}-numbers.md', 'w').write('\n'.join(rows) + '\n')
print('\n'.join(rows))
