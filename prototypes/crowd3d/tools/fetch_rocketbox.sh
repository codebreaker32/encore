#!/usr/bin/env bash
# Download the Microsoft Rocketbox avatars listed in avatars.json (MIT licence) into a cache folder.
# Only the facial FBX and the colour/normal/opacity textures are fetched (no specular maps).
# Usage: tools/fetch_rocketbox.sh [cache_dir]   (default ~/.cache/encore-rocketbox)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cache="${1:-$HOME/.cache/encore-rocketbox}"
base="https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Adults"
python3 -I -c 'import json,sys; [print(n, *t) for n, t in json.load(open(sys.argv[1])).items()]' "$here/avatars.json" |
while read -r name textures; do
  mkdir -p "$cache/$name/Export" "$cache/$name/Textures"
  fbx="$cache/$name/Export/${name}_facial.fbx"
  [ -s "$fbx" ] || curl -fsSL --retry 3 -o "$fbx" "$base/$name/Export/${name}_facial.fbx"
  for t in $textures; do
    out="$cache/$name/Textures/$t"
    [ -s "$out" ] || curl -fsSL --retry 3 -o "$out" "$base/$name/Textures/$t"
  done
  echo "ok $name"
done
