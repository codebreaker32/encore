#!/usr/bin/env bash
# The caption band (top of the frame, full resolution) at each time in a cues file, stacked with labels.
#   capstrip.sh REC.mkv CUES.txt OUT.jpg [CROP_W:CROP_H:X:Y]
set -u
REC=$1; CUES=$2; OUT=$3; CROP=${4:-1400:170:0:30}
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
T=$(mktemp -d)
i=0
while read -r t label clock; do
  i=$((i + 1))
  ffmpeg -nostdin -loglevel error -y -ss "$t" -i "$REC" -frames:v 1 \
    -vf "crop=$CROP,pad=iw+260:ih:260:0:black,drawtext=fontfile=$F:text='$i $clock':x=8:y=12:fontsize=26:fontcolor=yellow" \
    "$T/$(printf %03d $i).png"
done < "$CUES"
ffmpeg -loglevel error -y -pattern_type glob -i "$T/*.png" -vf "tile=1x$i" -frames:v 1 -q:v 3 "$OUT"
rm -rf "$T"
echo "$OUT: $i bands"
