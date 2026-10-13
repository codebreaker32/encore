#!/bin/bash
# On the box: four consecutive laughs per venue (laughvenues.mjs), as mp3 in ~/lv/laugh-venues-v1-<venue>.mp3 with the
# mixes each laugh used in ~/lv/<venue>.json. Each argument is venue:gap (seconds between laughs).
#   tools/render/laughvenues.sh openmic:6.5 club:7 theatre:8 arena:9    (server on :8092 serving ~/c3d)
cd "$(dirname "$0")"
mkdir -p ~/lv
for vg in "$@"; do
  v=${vg%%:*}; g=${vg##*:}
  timeout 600 node laughvenues.mjs "http://localhost:8092/index.html?preset=tv&host=1&venue=$v&hud=0" ~/lv/$v.webm 0.5,0.85,0.35,0.95 $g > ~/lv/$v.json 2>&1
  ffmpeg -v error -y -i ~/lv/$v.webm -codec:a libmp3lame -b:a 160k ~/lv/laugh-venues-v1-$v.mp3
done
echo done > ~/lv/ALLDONE
