#!/usr/bin/env bash
# Every gate of the box brief in one run (real-v1, 18 Oct): the anatomy sweep, handsweep, bindcheck and handocc in all
# four venues, then the tv pack and packcheck. One heavy job at a time, at nice 10. Prints a summary at the end.
#   tools/render/gates.sh [page url, default http://127.0.0.1:8091/index.html] [outdir]
set -u
page=${1:-http://127.0.0.1:8091/index.html}
out=${2:-/tmp/gates}
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
N="nice -n 10"
sum=()
$N node "$here/anatomy.mjs" "$page" > "$out/anatomy.txt" 2>&1; sum+=("anatomy: $(grep -o 'TOTAL.*' "$out/anatomy.txt" | tail -1) (exit $?)")
$N bash "$here/handsweep.sh" "$page" > "$out/handsweep.txt" 2>&1; sum+=("handsweep: $(tail -1 "$out/handsweep.txt")")
BASE=$page $N node "$here/bindcheck.mjs" "$out/bind" > "$out/bindcheck.txt" 2>&1; sum+=("bindcheck: $(tail -1 "$out/bindcheck.txt")")
for v in club theatre openmic arena; do
  $N node "$here/handocc.mjs" "$page" "$v" > "$out/handocc-$v.txt" 2>&1
  sum+=("handocc $v: $(grep -io 'flickers[^,]*' "$out/handocc-$v.txt" | tail -1)")
done
rm -rf "$out/pack" && node "$here/../pack.mjs" "$out/pack" --tv > "$out/pack.txt" 2>&1
sum+=("pack: $(tail -1 "$out/pack.txt")")
$N node "$here/packcheck.mjs" "$out/pack" > "$out/packcheck.txt" 2>&1; sum+=("packcheck: $(tail -2 "$out/packcheck.txt" | tr '\n' ' ')")
printf '%s\n' "${sum[@]}" | tee "$out/summary.txt"
