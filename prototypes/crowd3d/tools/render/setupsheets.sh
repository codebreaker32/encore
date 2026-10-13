#!/bin/bash
# On the box: one frame of every reaction setup per venue (setupsheet.mjs) and a contact sheet of them.
#   [ONLY=3,7] tools/render/setupsheets.sh club theatre ...    (server on :8092 serving ~/c3d; out ~/ss)
cd "$(dirname "$0")"
mkdir -p ~/ss
for v in "$@"; do
  rm -f ~/ss/$v-*.png
  timeout 500 node setupsheet.mjs http://localhost:8092/index.html $v ~/ss 2>&1 | tr -d '\n' | cut -c1-1500; echo
  ~/.local/bin/uv run -q --no-project --with pillow python3 sheet.py ~/ss/$v-sheet.jpg 3 480 $(ls ~/ss/$v-[0-9]*.png | sort -t- -k2 -n)
done
