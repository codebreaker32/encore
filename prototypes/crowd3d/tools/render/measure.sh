#!/usr/bin/env bash
# Draw calls, triangles, texture memory and downloads per venue and preset (wide listen and close laugh), on the box.
set -euo pipefail
cd "$(dirname "$0")"
OUT=${1:-/tmp/measure}
for q in tv low high; do
  args=()
  for v in club theatre openmic arena; do
    args+=("$v-$q-wide=http://localhost:8091/index.html?still&preset=$q&venue=$v&state=listen&t=3" "$v-$q-close=http://localhost:8091/index.html?still&preset=$q&venue=$v&state=laugh&t=1.5")
  done
  node shots.mjs "$OUT/$q" 1280 720 "${args[@]}" > "$OUT-$q.log" 2>&1
done
node -e '
const fs = require("fs");
for (const q of ["tv", "low", "high"]) { const s = JSON.parse(fs.readFileSync(process.argv[1] + "/" + q + "/stats.json"));
  for (const [k, x] of Object.entries(s)) console.log(k.padEnd(22), String(x.calls).padStart(3), "draws", String(Math.round(x.triangles / 100) / 10).padStart(6) + "k tris", "tex", (x.texMB || 0).toFixed(1).padStart(5), "MB", "dl", (x.dlMB || 0).toFixed(1), "MB", "people", `${x.front}+${x.mid}+${x.back}${x.sprites ? "+" + x.sprites : ""}`, (x.errors || []).length ? "ERR " + x.errors[0] : ""); }
' "$OUT"
