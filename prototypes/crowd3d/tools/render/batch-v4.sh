#!/usr/bin/env bash
# Round 4 on the build box: the --tv pack from file://, the v4 preview/after set and the arena close-up.
set -euo pipefail
OUT=${1:-/tmp/v4}
cd "$(dirname "$0")"
mkdir -p "$OUT"
( cd ../.. && rm -rf /tmp/crowdpack-tv && node tools/pack.mjs /tmp/crowdpack-tv --tv )
node shots.mjs "$OUT/pack" 1280 720 \
  "file-club=file:///tmp/crowdpack-tv/index.html?preset=tv&still&t=2" \
  "file-arena=file:///tmp/crowdpack-tv/index.html?preset=tv&venue=arena&state=preview&still&t=10" \
  "file-host=file:///tmp/crowdpack-tv/index.html?preset=tv&host=1&still&t=2"
B="http://localhost:8091/index.html?still&preset=tv&hud=0"
args=()
for v in club theatre openmic arena; do
  args+=("crowd3d-v4-$v-preview=$B&venue=$v&state=preview&t=14" "crowd3d-v4-$v-after=$B&venue=$v&state=after&t=13")
done
args+=("crowd3d-v4-arena-close=$B&venue=arena&state=laugh&t=1.5")
node shots.mjs "$OUT" 1280 720 "${args[@]}"
