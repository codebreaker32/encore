#!/usr/bin/env python3
"""Mood check: display luminance of a frame against the listen frame of the same venue (on the render box, Pillow).
    python3 lumadiff.py <listen.png> <other.png> [...]
For each image: the mean of the whole frame, the median of the wall band (15–40% from the top, 10–90% across, where the
room's walls and back sit) and the mean of the people band (45–75% from the top), each as display values 0–1, and the
difference from the first image."""
import sys

from PIL import Image


def bands(path):
    im = Image.open(path).convert('L')
    w, h = im.size
    px = im.load()

    def region(x0, y0, x1, y1, step=4):
        return [px[x, y] / 255 for y in range(int(y0 * h), int(y1 * h), step) for x in range(int(x0 * w), int(x1 * w), step)]

    full, wall, ppl = region(0, 0, 1, 1), sorted(region(0.1, 0.15, 0.9, 0.4)), region(0.1, 0.45, 0.9, 0.75)
    return sum(full) / len(full), wall[len(wall) // 2], sum(ppl) / len(ppl)


base = bands(sys.argv[1])
print(f'{"image":48s} frame   walls   people   (Δ vs {sys.argv[1].split("/")[-1]})')
for p in sys.argv[1:]:
    b = bands(p)
    print(f'{p.split("/")[-1]:48s} {b[0]:.3f}  {b[1]:.3f}  {b[2]:.3f}    Δ {b[0] - base[0]:+.3f} {b[1] - base[1]:+.3f} {b[2] - base[2]:+.3f}')
