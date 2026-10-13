#!/bin/bash
# On the box: edgecheck.mjs for all four venues on a packed page, at the TV's viewport and at a wider one (1018×541,
# the shape that left a band on the TV); prints each shot's band widths. Out: ~/edge-<tag>/
#   tools/render/edgeall.sh <tag> <file:// page url>
cd "$(dirname "$0")"
tag=$1; url=$2
for v in club openmic theatre arena; do
  for vp in "962 541" "1018 541"; do
    set -- $vp
    timeout 900 node edgecheck.mjs "$url" $v ~/edge-$tag/$1 $1 $2 1.33125 2>&1 | tail -1 | python3 -c "
import json,sys
d=json.loads(sys.stdin.read()); print('$tag', d['venue'], '$1x$2', 'maxBandR', max(o['bandR'] for o in d['out']), 'maxBandL', max(o['bandL'] for o in d['out']), 'maxBandB', max(o['bandB'] for o in d['out']), 'maxBandT', max(o['bandT'] for o in d['out']), 'shots', len(d['out']), d['errors'])"
  done
done
