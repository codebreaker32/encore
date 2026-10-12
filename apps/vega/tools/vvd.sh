#!/usr/bin/env bash
# The Vega Virtual Device, headless, on an Ubuntu box without a GPU (the EC2 Vega box; docs/dev-setup.md, "Vega on AWS").
#
#   vvd.sh up                  Xvfb :99, a PulseAudio null sink, then the VVD's emulator with -gpu host (see below)
#   vvd.sh down                stop the emulator
#   vvd.sh repack [Debug|Release]  the built x86_64 package without the WebView need -> build/vvd/encore_vvd.vpkg
#   vvd.sh install             install that package and launch Encore
#   vvd.sh launch | stop-app   launch or terminate Encore
#   vvd.sh key KEY [KEY…]      remote buttons through inputd-cli (KEY_ENTER is OK, KEY_BACK, KEY_UP, …)
#   vvd.sh shot OUT.png        a 1920x1080 screenshot from the emulator console
#   vvd.sh record SEC OUT.mp4  record the screen and the device's sound (emulator console, at most 180 s), then H.264/AAC
#   vvd.sh log [PATTERN]       follow Encore's log on the device (optionally grep it)
#
# Why not `vega virtual-device start`: on a host without a GPU its default renderer (swangle_indirect) and the
# --no-gl-accel fallback (swiftshader_indirect) both leave the screen black, and the CLI cannot choose another mode.
# The emulator it wraps renders correctly with `-gpu host` on Mesa's llvmpipe under Xvfb. The CLI is still used once to
# create the instance. Audio goes to PulseAudio when a server is running; the null sink makes it recordable.
set -euo pipefail

APP=com.strumble.vega.main
HERE=$(cd "$(dirname "$0")" && pwd)
VEGA_APP=$(dirname "$HERE")
RUN=$HOME/.cache/vvd
mkdir -p "$RUN"
export DISPLAY=${DISPLAY:-:99}
export PULSE_SERVER=unix:$RUN/pulse.sock

# shellcheck disable=SC1091
[ -f "$HOME/vega/env" ] && . "$HOME/vega/env"
SDK=$(vega -v --json 2>/dev/null | jq -r .sdkPath)
VVD=$SDK/vvd
AGENT=$VVD/images/tv/vmtools/agent
vda() { "$(vega which vda)" "$@"; }
console() { python3 "$HERE/vvd-console.py" "$@"; }
instance() { ls -td "$VVD"/instances/*/ 2>/dev/null | head -1 | sed 's:/$::'; }
booted() { vega device running-apps 2>/dev/null | grep -q keplerlauncherapp; }

up() {
  if ! pgrep -x Xvfb > /dev/null; then
    setsid nohup Xvfb "$DISPLAY" -screen 0 1920x1080x24 +extension GLX +render -noreset > "$RUN/xvfb.log" 2>&1 < /dev/null &
    sleep 1
  fi
  if ! pactl info > /dev/null 2>&1; then
    # without the session bus: a login's own PulseAudio may hold the D-Bus name, and this one would then exit at once
    env -u DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR=$RUN setsid nohup pulseaudio -n --daemonize=no --exit-idle-time=-1 --disallow-exit \
      -L "module-native-protocol-unix socket=$RUN/pulse.sock auth-anonymous=1" \
      -L "module-null-sink sink_name=vvd sink_properties=device.description=vvd rate=48000" \
      > "$RUN/pulse.log" 2>&1 < /dev/null &
    sleep 1
  fi
  if [ -z "$(instance)" ]; then
    vega virtual-device start --no-gui --timeout 240 && vega virtual-device stop
  fi
  if booted; then echo "already running"; return; fi
  local i; i=$(instance)
  (cd "$AGENT" && setsid nohup ./emulator -avd-arch x86_64 -skindir "$AGENT/skins" -skin tv-remote -ports 5554,5555 \
    -dns-server auto -sysdir "$i" -datadir "$i" -data "$i/userdata.qcow2" \
    -keyboard-mapping KEY_ESC:KEY_BACK,KEY_F1:KEY_HOMEPAGE,KEY_F2:KEY_MENU,KEY_F3:KEY_REWIND,KEY_F4:KEY_PLAYPAUSE,KEY_F5:KEY_FASTFORWARD \
    -gpu host -qemu -qmp unix:/tmp/qmp-socket-5554.sock,server,nowait > "$RUN/emulator.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 60); do
    if booted; then
      # The "nested virtualization is not recommended" notice opens on every start; with no window manager it stays on top.
      for w in $(xdotool search --name 'Emulator Running in Nested' 2> /dev/null); do xdotool windowunmap "$w" || true; done
      echo "VVD ready"
      return
    fi
    sleep 5
  done
  echo "VVD did not boot in 5 minutes; see $RUN/emulator.log" >&2
  exit 1
}

down() { console kill > /dev/null 2>&1 || vega virtual-device stop; }

repack() {
  local type=${1:-Debug} src out
  src=$VEGA_APP/build/private/vega/x86_64/$type
  out=$VEGA_APP/build/vvd
  [ -f "$src/manifest.toml" ] || { echo "build $type first (yarn build:vega:debug)" >&2; exit 1; }
  rm -rf "$out" && mkdir -p "$out" && cp -r "$src" "$out/src"
  # The VVD on Ubuntu has no WebView (docs/friction-log.md), and the build makes every Vega library a hard need.
  python3 - "$out/src/manifest.toml" << 'EOF'
import re, sys
p = sys.argv[1]
s = open(p).read()
t = re.sub(r'\[\[needs\.module\]\]\s*\nid = "/com\.amazon\.kepler\.webview_3@IWebview_3"\s*\n', '', s)
if t == s:
    sys.exit('no WebView need found in ' + p)
open(p, 'w').write(t)
EOF
  "$(vega which vpt)" pack "$out/src" -n encore_vvd -d "$out" --validate | tail -1
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  repack) repack "${2:-Debug}" ;;
  install) vega run-app "$VEGA_APP/build/vvd/encore_vvd.vpkg" "$APP" -d VirtualDevice ;;
  launch) vega device launch-app -a "$APP" ;;
  stop-app) vega device terminate-app -a "$APP" ;;
  key)
    shift
    for k in "$@"; do vda shell "inputd-cli button_press $k" > /dev/null; done
    ;;
  shot)
    dir=$(mktemp -d)
    console "screenrecord screenshot $dir" > /dev/null
    mv "$dir"/*.png "$2" && rmdir "$dir"
    ;;
  record)
    sec=$2 out=$3 raw=${3%.*}.webm
    console "screenrecord start --time-limit $sec --fps 30 --bit-rate 8M $raw" > /dev/null
    sleep $((sec + 3))
    console "screenrecord stop" > /dev/null 2>&1 || true
    ffmpeg -y -loglevel error -i "$raw" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k \
      -movflags +faststart "$out"
    ls -la "$out"
    ;;
  log)
    if [ -n "${2:-}" ]; then vda shell "loggingctl log -f -v com.strumble.vega" | grep --line-buffered -E "$2"
    else vda shell "loggingctl log -f -v com.strumble.vega"; fi
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 2
    ;;
esac
