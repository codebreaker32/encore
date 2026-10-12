#!/usr/bin/env bash
# Every venue × laugh (0.9 and 0.4), the laugh cycle, the after-set (applause, standing, coats, walking out) and
# the preview, through handcheck.mjs (box only). Prints one line per run and a total; exit 1 if any hand is invalid.
#   tools/render/handsweep.sh <page base url, e.g. http://127.0.0.1:8093/after/index.html> [venues...]
#   (SPECS='after 0 14 1;preview 0 36 2' to run only some of the states)
set -u
base=$1; shift
venues=${*:-club theatre openmic arena}
here=$(cd "$(dirname "$0")" && pwd)
bad=0
for v in $venues; do
  IFS=';' read -ra LIST <<< "${SPECS:-laugh&s=0.9 0 6 0.5;laugh&s=0.4 0 6 0.5;cycle 3 15 1;after 0 14 1;preview 0 36 2}"
  for spec in "${LIST[@]}"; do
    set -- $spec
    out=$(timeout 900 node "$here/handcheck.mjs" "$base?venue=$v&state=$1&preset=tv&capture=1&hud=0" $2 $3 $4 2>&1)
    last=$(echo "$out" | tail -1)
    n=$(echo "$last" | grep -o '^[0-9]*' || true)
    [ -n "$n" ] && bad=$((bad + n))
    echo "$v ${1%%&*}${1#laugh} : $last"
    [ -n "$n" ] && echo "$out" | grep '^t=' | head -3 | cut -c1-220
  done
done
echo "TOTAL invalid hands: $bad"
[ $bad -eq 0 ]
