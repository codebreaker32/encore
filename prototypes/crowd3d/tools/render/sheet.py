#!/usr/bin/env python3
"""A contact sheet of renders, to look at a whole set in one image (on the render box, Pillow).
    python3 sheet.py <out.png> <columns> <width per image> <image>...   (missing images are skipped)"""
import os
import sys

from PIL import Image

out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
paths = [p for p in sys.argv[4:] if os.path.exists(p)]
h = w * 9 // 16
rows = (len(paths) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for i, p in enumerate(paths):
    sheet.paste(Image.open(p).convert('RGB').resize((w, h)), ((i % cols) * w, (i // cols) * h))
sheet.save(out, quality=85)
