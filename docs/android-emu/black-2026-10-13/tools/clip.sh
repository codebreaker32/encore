#!/usr/bin/env bash
# clip.sh REC.mkv OUT.mp4 FROM_HH:MM:SS.mmm SECONDS : a 960x540 clip at a UTC wall time
V=$1; O=$2; T=$3; L=$4
S=$(ffprobe -v error -show_entries format=start_time -of csv=p=0 "$V" | tr -d ,)
E=$(date -u -d "$(date -u +%F) $T" +%s.%N); off=$(python3 -c "print(max(0,$E-$S))")
ffmpeg -nostdin -v error -y -ss "$off" -i "$V" -t "$L" -vf scale=960:540 -c:v libx264 -crf 26 -preset veryfast -an "$O"
