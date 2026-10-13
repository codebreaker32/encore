#!/usr/bin/env bash
# frameat.sh REC.mkv OUTDIR HH:MM:SS.mmm [...]  : the frame at each UTC wall time (recording made with brec.sh)
V=$1; O=$2; shift 2; mkdir -p "$O"
S=$(ffprobe -v error -show_entries format=start_time -of csv=p=0 "$V" | tr -d ,)
D=$(date -u +%Y-%m-%d)
for T in "$@"; do
  E=$(date -u -d "$D $T" +%s.%N); off=$(python3 -c "print(max(0,$E-$S))")
  ffmpeg -nostdin -v error -y -ss "$off" -i "$V" -frames:v 1 -vf scale=960:540 -q:v 3 "$O/at-${T//:/}.jpg"
done; ls "$O"
