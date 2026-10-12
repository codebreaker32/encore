#!/usr/bin/env bash
# The v3 render set, on the build box only (static server for prototypes/crowd3d on :8091):
#   bash tools/render/batch-v3.sh /tmp/v3      → crowd3d-v3-<venue>-<state>.png, host-finale, video/crowd3d-v3-<venue>-laugh.mp4
set -euo pipefail
OUT=${1:-/tmp/v3}
cd "$(dirname "$0")"
B="http://localhost:8091/index.html?still&preset=tv"
mkdir -p "$OUT/video"
for v in club theatre openmic arena; do
  node shots.mjs "$OUT" 1280 720 \
    "crowd3d-v3-$v-listen=$B&venue=$v&state=listen&t=3" \
    "crowd3d-v3-$v-laugh=$B&venue=$v&state=laugh&t=1.5" \
    "crowd3d-v3-$v-laugh-wide=$B&venue=$v&state=laugh&t=1.8&shot=wide" \
    "crowd3d-v3-$v-preview=$B&venue=$v&state=preview&t=14" \
    "crowd3d-v3-$v-after=$B&venue=$v&state=after&t=13"
  mv "$OUT/stats.json" "$OUT/stats-$v.json"
done
node hosttest.mjs "http://localhost:8091/index.html?host=1&preset=tv" "$OUT/host" club
cp "$OUT/host/host-finale.png" "$OUT/crowd3d-v3-host-finale.png"
for v in club theatre openmic arena; do
  node video.mjs "$OUT/video/crowd3d-v3-$v-laugh.mp4" "http://localhost:8091/index.html?capture=1&preset=tv&hud=0&state=cycle&venue=$v" 2.6 12.6 25 1280 720
done
ls -la "$OUT" "$OUT/video"
