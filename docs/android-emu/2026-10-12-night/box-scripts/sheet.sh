#!/usr/bin/env bash
# A labelled contact sheet from a recording at the times in a cues file (cues.py output).
#   sheet.sh REC.mkv CUES.txt OUT.jpg [COLS] [W]
set -u
REC=$1; CUES=$2; OUT=$3; COLS=${4:-4}; W=${5:-640}
H=$((W * 9 / 16))
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
T=$(mktemp -d)
i=0
while read -r t label clock; do
  i=$((i + 1))
  ffmpeg -nostdin -loglevel error -y -ss "$t" -i "$REC" -frames:v 1 \
    -vf "scale=$W:$H,drawtext=fontfile=$F:text='$i $label $clock':x=6:y=$((H - 30)):fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.7" \
    "$T/$(printf %03d $i).jpg"
done < "$CUES"
ROWS=$(( (i + COLS - 1) / COLS ))
ffmpeg -loglevel error -y -pattern_type glob -i "$T/*.jpg" -vf "tile=${COLS}x${ROWS}" -frames:v 1 -q:v 4 "$OUT"
rm -rf "$T"
echo "$OUT: $i frames"
