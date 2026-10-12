#!/usr/bin/env bash
# One scripted set on the Android TV emulator with the 3D room on: bill -> OK -> LIVE_S live -> OK -> CUT_S cut sheet.
# Needs emu.sh up, Encore installed, the relay (RELAY_DEBUG_ROOMS=1, :8787) and the MC (:8080) on this box.
#   take2.sh NEW_OUT_DIR [none|console|adb|xrec]  xrec: x11grab of the emulator window + the null sink (xrec.sh), from the bill
#   take.sh NEW_OUT_DIR [none|console|adb]  console: the emulator console recorder (VP9 + the device sound, <=180 s)
#                                           adb: adb shell screenrecord (H.264, no sound)
# Env: LIVE_S (75), CUT_S (25), SEED (7), MIDMEM (1; 0 skips the mid-set meminfo, which can stall a frame on camera). OUT_DIR must not exist yet.
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; REC=${2:-none}; LIVE_S=${LIVE_S:-75}; CUT_S=${CUT_S:-25}
mkdir -p "$(dirname "$D")"
mkdir "$D" || { echo "$D exists; pick a new directory"; exit 1; }
ts() { date -u +%H:%M:%S.%N | cut -c1-12; }
mark() { echo "$(ts) $*" | tee -a "$D/timeline.txt"; }
webview_pid() { adb shell ps -A -o PID,NAME | grep sandboxed_process | awk '{print $1}' | head -1; }
APP=com.strumble.tv
adb reverse tcp:8787 tcp:8787 > /dev/null; adb reverse tcp:18080 tcp:8080 > /dev/null
adb shell am force-stop $APP
adb logcat -c
setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime" > "$D/logcat.txt" 2>&1 < /dev/null &
mark "launch"
adb shell am start -W -n $APP/.MainActivity > "$D/launch.txt"
sleep 8
mark "deep link stage?crowd=3d"
adb shell am start -W -a android.intent.action.VIEW -d "com.strumble.tv://stage?crowd=3d" >> "$D/launch.txt"
sleep 12
if [ "$REC" = xrec ]; then ~/emu/xrec.sh start "$D/take.mkv" 30 > /dev/null; mark "x11grab recorder started"; sleep 4; fi
R=$(curl -s localhost:8787/rooms | python3 -c 'import json,sys; print(json.load(sys.stdin)["rooms"][-1])')
mark "room $R; fake phone joins"
(cd ~/strumble && setsid bash -c "echo \$\$ > $D/phone.pid; exec corepack yarn workspace @strumble/relay fake-phone --room $R --seed ${SEED:-7}" > "$D/fake-phone.log" 2>&1 < /dev/null &)
sleep 6
adb shell dumpsys meminfo $APP > "$D/meminfo-1-bill.txt"
WV=$(webview_pid); [ -n "$WV" ] && adb shell dumpsys meminfo "$WV" > "$D/meminfo-1-bill-webview.txt"
if [ "$REC" = console ]; then
  adb emu screenrecord start --time-limit 180 --fps 30 --bit-rate 8000000 "$D/take.webm" > /dev/null; mark "console recorder started"
elif [ "$REC" = adb ]; then
  setsid bash -c "echo \$\$ > $D/rec.pid; exec adb shell screenrecord --bit-rate 8000000 --time-limit 180 /sdcard/take.mp4" > "$D/rec.log" 2>&1 < /dev/null &
  mark "adb screenrecord started"
fi
sleep 5
adb shell dumpsys gfxinfo $APP reset > /dev/null
mark "OK (go live)"
adb shell input keyevent KEYCODE_DPAD_CENTER
sleep $((LIVE_S / 2))
top -b -n 1 -w 200 | sed -n 1,12p > "$D/top-host-live.txt"
adb shell top -b -n 1 -m 8 > "$D/top-guest-live.txt"
if [ "${MIDMEM:-1}" = 1 ]; then
  adb shell dumpsys meminfo $APP > "$D/meminfo-2-live.txt"
  WV=$(webview_pid); [ -n "$WV" ] && adb shell dumpsys meminfo "$WV" > "$D/meminfo-2-live-webview.txt"
fi
mark "mid-live samples taken"
sleep $((LIVE_S - LIVE_S / 2))
adb shell dumpsys gfxinfo $APP > "$D/gfxinfo-live.txt"
adb shell dumpsys gfxinfo $APP reset > /dev/null
mark "OK (end set)"
adb shell input keyevent KEYCODE_DPAD_CENTER
sleep "$CUT_S"
adb shell dumpsys gfxinfo $APP > "$D/gfxinfo-cutsheet.txt"
adb shell dumpsys meminfo $APP > "$D/meminfo-3-cutsheet.txt"
WV=$(webview_pid); [ -n "$WV" ] && adb shell dumpsys meminfo "$WV" > "$D/meminfo-3-cutsheet-webview.txt"
mark "cut sheet samples taken"
if [ "$REC" = console ]; then
  adb emu screenrecord stop > /dev/null; mark "console recorder stopped"
elif [ "$REC" = adb ]; then
  kill -INT -- -"$(cat "$D/rec.pid")" 2>/dev/null; sleep 3; adb pull /sdcard/take.mp4 "$D/take.mp4" > /dev/null
  adb shell rm -f /sdcard/take.mp4; mark "adb screenrecord stopped"
elif [ "$REC" = xrec ]; then
  ~/emu/xrec.sh stop > /dev/null; mark "x11grab recorder stopped"
fi
adb exec-out screencap -p > "$D/end.png"
kill -- -"$(cat "$D/phone.pid")" 2>/dev/null
sleep 2
kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
grep -E "\[crowd\]" "$D/logcat.txt" > "$D/crowd-lines.txt"
mark "done"
ls -la "$D"
