#!/usr/bin/env bash
# Launch + venue changes on the bill, recorded. usage: run1.sh OUTDIR [WAIT_AFTER_LAUNCH]
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; W=${2:-45}; mkdir -p "$D"; export QA=$D
APP=com.strumble.tv
mark() { echo "$(date -u +%H:%M:%S.%N | cut -c1-12) $*" | tee -a "$D/timeline.txt"; }
adb reverse tcp:8787 tcp:8787 >/dev/null; adb reverse tcp:18080 tcp:8080 >/dev/null
adb shell am force-stop $APP; adb shell input keyevent KEYCODE_HOME; sleep 2; adb logcat -c
(exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
~/emu/bk/brec.sh start "$D/rec.mkv" | tee -a "$D/timeline.txt"; sleep 2
mark launch; adb shell am start -W -n $APP/.MainActivity | grep TotalTime
sleep "$W"
for k in RIGHT RIGHT RIGHT RIGHT LEFT LEFT; do mark "key DPAD_$k (venue row)"; adb shell input keyevent KEYCODE_DPAD_$k; sleep 14; done
~/emu/bk/brec.sh stop; kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
mark done
