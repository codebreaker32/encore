#!/usr/bin/env bash
# Usage: tools/anim/fetch.sh  (run on the build box, never on the laptop; needs FBX2glTF 0.9.7 next to this script)
# Fetch the Rocketbox animation FBX files listed in clips.txt (MIT) and convert each to GLB with FBX2glTF 0.9.7.
set -uo pipefail
cd "$(dirname "$0")"
B=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Animations
mkdir -p fbx glb
grep -v '^#' clips.txt | while read -r folder name fps max; do
  [ -z "$name" ] && continue
  src="$name"; [ "$name" = f_sit_chair_idle_finger_nail ] && src="f_sit_chair_idle_finger nail"
  f="fbx/$name.max.fbx"
  [ -s "$f" ] || curl -fsSL --retry 3 -o "$f" "$B/all_animations_max_motextr_$folder/${src// /%20}.max.fbx" || { echo "FAIL fetch $name"; continue; }
  [ -s "glb/$name.glb" ] || ./FBX2glTF -b -i "$f" -o "glb/$name" > /dev/null 2>&1 || echo "FAIL convert $name"
done
ls glb | wc -l
