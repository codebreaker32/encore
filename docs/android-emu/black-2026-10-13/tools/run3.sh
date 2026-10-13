#!/usr/bin/env bash
# Launch with a venue key during the first load, venue changes 14 s apart, then a fast scroll (3 keys 0.4 s apart).
# usage: run3.sh OUTDIR
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; mkdir -p "$D"; APP=com.strumble.tv
mark() { echo "$(date -u +%H:%M:%S.%N | cut -c1-12) $*" | tee -a "$D/timeline.txt"; }
qr() { echo "qemu_rss_mb $(( $(ps -o rss= -C qemu-system-x86_64 | head -1) / 1024 ))"; }
adb reverse tcp:8787 tcp:8787 >/dev/null; adb reverse tcp:18080 tcp:8080 >/dev/null
adb shell am force-stop $APP; adb shell input keyevent KEYCODE_HOME; sleep 2; adb logcat -c
(exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
~/emu/bk/brec.sh start "$D/rec.mkv" | tee -a "$D/timeline.txt"; sleep 2
mark launch; adb shell am start -W -n $APP/.MainActivity | grep TotalTime
sleep 3.5; mark "key DPAD_RIGHT (during the first load)"; adb shell input keyevent KEYCODE_DPAD_RIGHT
sleep 20; mark "$(qr)"
for k in RIGHT RIGHT RIGHT LEFT; do mark "key DPAD_$k (venue row)"; adb shell input keyevent KEYCODE_DPAD_$k; sleep 14; mark "$(qr)"; done
mark "fast scroll: 3x DPAD_RIGHT"; for i in 1 2 3; do adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 0.3; done; sleep 15; mark "$(qr)"
adb shell dumpsys meminfo $APP | grep -E "TOTAL PSS" | head -1 | tee -a "$D/timeline.txt"
~/emu/bk/brec.sh stop; kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
mark done
