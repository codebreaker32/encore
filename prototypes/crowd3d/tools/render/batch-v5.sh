#!/usr/bin/env bash
# Batch 1 of docs/crowd-visual-plan.md: the render set, on the render box (static server for prototypes/crowd3d on :8091).
#   bash tools/render/batch-v5.sh <out> [prefix=crowd3d-v5] [extra query, e.g. '&ab=norim']
#     → <prefix>-<venue>-{listen,laugh,laugh-wide,preview,after}.png and stats-<venue>.json (draws, triangles, textures)
#   EXTRAS=1 adds the false-colour and mirror=0 checks and the host finale (hosttest.mjs).
# Run it once on the old code with prefix crowd3d-v5-before for the before/after pairs (tools/render/pairs.py).
set -euo pipefail
OUT=${1:-/tmp/v5}
PRE=${2:-crowd3d-v5}
X=${3:-}
cd "$(dirname "$0")"
B="http://localhost:8091/index.html?still&preset=tv&hud=0$X"
mkdir -p "$OUT"
for v in club theatre openmic arena; do
  node shots.mjs "$OUT" 1280 720 \
    "$PRE-$v-listen=$B&venue=$v&state=listen&t=3" \
    "$PRE-$v-laugh=$B&venue=$v&state=laugh&t=1.5" \
    "$PRE-$v-laugh-wide=$B&venue=$v&state=laugh&t=1.8&shot=wide" \
    "$PRE-$v-preview=$B&venue=$v&state=preview&t=14" \
    "$PRE-$v-after=$B&venue=$v&state=after&t=13"
  mv "$OUT/stats.json" "$OUT/stats-$v.json"
done
if [ -n "${EXTRAS:-}" ]; then
  node shots.mjs "$OUT" 1280 720 \
    "$PRE-club-listen-false=$B&venue=club&state=listen&t=3&false=1" \
    "$PRE-theatre-listen-false=$B&venue=theatre&state=listen&t=3&false=1" \
    "$PRE-club-listen-mirror0=$B&venue=club&state=listen&t=3&mirror=0"
  mv "$OUT/stats.json" "$OUT/stats-extras.json"
  node hosttest.mjs "http://localhost:8091/index.html?host=1&preset=tv" "$OUT/host" club
  cp "$OUT/host/host-finale.png" "$OUT/$PRE-host-finale.png"
fi
ls "$OUT"
