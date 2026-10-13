#!/usr/bin/env bash
# Every reaction setup of every venue, forced (crowdtest, state=laugh&setup=i, tv preset, stage look): one screenshot
# 9 s in (the laugh is under way), and its brightness. usage: setups.sh OUTDIR [VENUES] [N]
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; VS=${2:-"openmic club theatre arena"}; N=${3:-10}; mkdir -p "$D"
for v in $VS; do for i in $(seq ${START:-0} $((N-1))); do
  inner="file:///android_asset/crowd/index.html?preset=tv&venue=$v&state=laugh&setup=$i&s=0.8"
  enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$inner")
  adb shell am force-stop com.strumble.tv
  adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=$enc" > /dev/null
  sleep 11; adb exec-out screencap -p > "$D/$v-$i.png"
  echo "$v $i $(date -u +%T) qemu_rss_mb $(( $(ps -o rss= -C qemu-system-x86_64 | head -1) / 1024 ))"
done; done
