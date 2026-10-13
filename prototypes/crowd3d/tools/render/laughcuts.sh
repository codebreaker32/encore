#!/bin/bash
# On the box: 8 consecutive laugh cuts per venue in host mode (laughstrip.mjs), and a 4x2 sheet of the screen 1 s into
# each cut. Each argument is venue:gap (the gap between laughs, longer than the venue's close + wide holds).
#   tools/render/laughcuts.sh club:14 openmic:16 theatre:19.5 arena:15.5    (server on :8092 serving ~/c3d; out ~/lc)
cd "$(dirname "$0")"
for vg in "$@"; do
  v=${vg%%:*}; g=${vg##*:}
  rm -rf ~/lc/$v; mkdir -p ~/lc/$v
  timeout 900 node laughstrip.mjs "http://localhost:8092/index.html?preset=tv&host=1&venue=$v&hud=0" ~/lc/$v $v 8 $g > ~/lc/$v/log.txt 2>&1
  ~/.local/bin/uv run -q --no-project --with pillow python3 sheet.py ~/lc/$v-sheet.jpg 4 480 $(for k in 0 1 2 3 4 5 6 7; do echo ~/lc/$v/close-$k.png; done)
done
echo done > ~/lc/ALLDONE
