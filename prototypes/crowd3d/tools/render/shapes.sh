#!/bin/bash
# On the box: shapesheet.mjs for each venue, and docs-ready sheets: ~/shp/shapes-v1-<venue>.png, before | after, one row
# per frame (three reaction setups, one person close), each 960×540 from the 1280×720 screen of an 800×450 drawing.
#   tools/render/shapes.sh <before page> <after page> [venues...]
cd "$(dirname "$0")"
b=$1; a=$2; shift 2
for v in ${@:-club openmic theatre arena}; do
  timeout 900 node shapesheet.mjs "$b" "$a" $v ~/shp 2>&1 | tail -1
  L=""; for k in 0 1 2 3; do L="$L $HOME/shp/$v-before-$k.png $HOME/shp/$v-after-$k.png"; done
  ~/.local/bin/uv run -q --no-project --with pillow python3 sheet.py ~/shp/shapes-v1-$v.png 2 960 $L
done
