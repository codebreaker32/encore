#!/bin/bash
# The real-v1 deliverable sheet for a venue: realsheet.mjs before (BEFORE, the baseline tree) and after (the page), as
# a 2-column sheet (before | after), five rows (three setups, a person close, a face close), each frame at 640×360.
#   tools/render/sheetrv.sh <after page> <before page> <venue> <out.png>
set -eu
after=$1; before=$2; v=$3; out=$4
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
BEFORE=$before nice -n 10 node "$here/realsheet.mjs" "$after" "$v" "$tmp" '' '' > "$tmp/log.json"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
args=(); lay=(); i=0
for n in 0 1 2 3 4; do for tag in before after; do
  ffmpeg -v error -y -i "$tmp/$v-$tag-$n.png" -vf "scale=640:360,drawtext=fontfile=$FONT:text='$v $tag $n':fontcolor=white:fontsize=16:x=6:y=6:box=1:boxcolor=black@0.5" "$tmp/t-$tag-$n.png"
  args+=(-i "$tmp/t-$tag-$n.png"); c=$([ $tag = before ] && echo 0 || echo 640); lay+=("${c}_$((n * 360))"); i=$((i + 1))
done; done
ffmpeg -v error -y "${args[@]}" -filter_complex "xstack=inputs=$i:layout=$(IFS='|'; echo "${lay[*]}")" -frames:v 1 "$out"
cat "$tmp/log.json"; rm -rf "$tmp"
