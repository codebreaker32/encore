#!/bin/bash
# The life-v1 deliverables from lifevideo.mjs outputs: before | after side by side (each 640×360, labelled), for the
# mid shot and the face close, as docs/mockups/life-v1-<venue>.mp4 (mid on top, face below) and a still sheet
# docs/mockups/life-v1-<venue>-frames.png (listening at t 11.0 and the laugh at t 13.0, both shots).
#   tools/render/lifecompose.sh <before dir> <after dir> <venue> <mockups dir>
set -eu
B=$1; A=$2; v=$3; M=$4
F=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
lab() { echo "scale=640:360,drawtext=fontfile=$F:text='$1':fontcolor=white:fontsize=16:x=6:y=6:box=1:boxcolor=black@0.5"; }
ffmpeg -v error -y -i "$B/mid.mp4" -i "$A/mid.mp4" -i "$B/face.mp4" -i "$A/face.mp4" -filter_complex \
  "[0]$(lab "$v mid · before")[a];[1]$(lab "$v mid · after")[b];[2]$(lab "$v face · before")[c];[3]$(lab "$v face · after")[d];[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack" \
  -c:v libx264 -crf 24 -preset medium -pix_fmt yuv420p -movflags +faststart "$M/life-v1-$v.mp4"
ffmpeg -v error -y -ss 1.0 -i "$M/life-v1-$v.mp4" -frames:v 1 /tmp/lc-$v-a.png
ffmpeg -v error -y -ss 3.0 -i "$M/life-v1-$v.mp4" -frames:v 1 /tmp/lc-$v-b.png
ffmpeg -v error -y -i /tmp/lc-$v-a.png -i /tmp/lc-$v-b.png -filter_complex vstack "$M/life-v1-$v-frames.png"
ls -la "$M/life-v1-$v.mp4" "$M/life-v1-$v-frames.png"
