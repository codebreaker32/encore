#!/usr/bin/env bash
# Bill-screen fps probe: launch Encore, turn the 3D room on, wait, print the page's own [crowd] stats and CPU use.
#   probe.sh OUT_DIR [WAIT_S]
set -u
export PATH=$HOME/Android/platform-tools:$PATH
D=$1; W=${2:-45}
mkdir -p "$D"
adb logcat -c
(setsid nohup adb logcat -v threadtime > "$D/logcat.txt" 2>&1 < /dev/null &)
adb reverse tcp:8787 tcp:8787 > /dev/null; adb reverse tcp:18080 tcp:8080 > /dev/null
adb shell am force-stop com.strumble.tv
adb shell am start -W -n com.strumble.tv/.MainActivity | grep -E "TotalTime"
sleep 8
adb shell am start -W -a android.intent.action.VIEW -d "com.strumble.tv://stage?crowd=3d" > /dev/null
sleep "$W"
top -b -n 1 -w 200 | sed -n 7,9p > "$D/host-top.txt"
adb shell top -b -n 1 -m 6 > "$D/guest-top.txt"
adb exec-out screencap -p > "$D/bill.png"
cat "$D/host-top.txt"; sed -n 4,10p "$D/guest-top.txt"
grep -E "\[crowd\]" "$D/logcat.txt" | tail -12
