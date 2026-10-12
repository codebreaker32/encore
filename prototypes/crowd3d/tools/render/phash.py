"""Perceptual hashes of a cut-sheet strip's thumbnails, in order: no two neighbours may be near-identical.
  ~/pyenv/bin/python3 -I phash.py <strip.png> <img> <img> ...   (Pillow only)
Prints each neighbouring pair's Hamming distance (64-bit DCT pHash; 0 = the same picture, under 12 = near-identical)
and writes the thumbnails side by side to <strip.png>. Exits 1 if any neighbours are near-identical."""
import math
import sys

from PIL import Image

NEAR = 12


N = 32
COS = [[math.cos(math.pi * (2 * x + 1) * u / (2 * N)) for x in range(N)] for u in range(8)]


def phash(path):
    g = list(Image.open(path).convert('L').resize((N, N), Image.LANCZOS).getdata())
    rows = [g[y * N:(y + 1) * N] for y in range(N)]
    # the 8x8 lowest frequencies of the 2-D DCT (rows, then columns)
    r = [[sum(c * v for c, v in zip(COS[u], row)) for u in range(8)] for row in rows]
    d = [sum(COS[v][y] * r[y][u] for y in range(N)) for v in range(8) for u in range(8)][1:]
    med = sorted(d)[len(d) // 2]
    return [x > med for x in d]


def main():
    out, paths = sys.argv[1], sys.argv[2:]
    hs = [phash(p) for p in paths]
    dist = [sum(x != y for x, y in zip(a, b)) for a, b in zip(hs, hs[1:])]
    near = [i for i, d in enumerate(dist) if d < NEAR]
    ims = [Image.open(p).convert('RGB').resize((320, 180)) for p in paths]
    strip = Image.new('RGB', (len(ims) * 324 - 4, 180), (0, 0, 0))
    for i, im in enumerate(ims):
        strip.paste(im, (i * 324, 0))
    strip.save(out)
    print({'neighbours': dist, 'min': min(dist) if dist else None, 'near_identical': near})
    sys.exit(1 if near else 0)


main()
