#!/usr/bin/env bash
# Frame-by-frame strips of an emulator clip for the judges (laugh-v2, 19 Oct): finds the camera cuts (the director cuts
# to the floor on a laugh), then tiles every frame of the 1.5 s after each cut (45 frames at 30 fps, 9 x 5 at 320x180)
# plus one strip from the clip's start; a pose that jumps between two neighbouring tiles is a glitch.
#   clipstrips.sh <clip.mp4> <outdir> [max strips=4]
set -eu
clip=$1; out=$2; max=${3:-4}
mkdir -p "$out"
name=$(basename "$clip" .mp4)
cuts=$(ffmpeg -nostdin -hide_banner -i "$clip" -vf "select='gt(scene,0.1)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | awk 'BEGIN{last=-9} {if ($1-last>1.6) {print $1; last=$1}}' | head -n "$((max - 1))")
i=0
for t in 0.1 $cuts; do
  s=$(awk -v t="$t" 'BEGIN{printf "%.2f", t+0.07}')
  ffmpeg -nostdin -v error -y -ss "$s" -t 1.5 -i "$clip" -vf "scale=320:180,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='%{n}':fontcolor=white:fontsize=12:x=3:y=3:box=1:boxcolor=black@0.5,tile=9x5" -frames:v 1 "$out/$name-strip$i-t$s.png"
  i=$((i + 1))
done
ls "$out" | grep "$name"
