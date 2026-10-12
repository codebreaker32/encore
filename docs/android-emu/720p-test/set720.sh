#!/usr/bin/env bash
# One scripted stand-up set (words on) on the 720p emulator, recorded from the bill to the cut sheet; gfxinfo for the set.
#   set720.sh NEW_OUT_DIR
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; mkdir "$D" || exit 1
APP=com.strumble.tv
ts() { date -u +%H:%M:%S.%N | cut -c1-12; }
mark() { echo "$(ts) $*" | tee -a "$D/timeline.txt"; }
adb reverse tcp:8787 tcp:8787 > /dev/null; adb reverse tcp:18080 tcp:8080 > /dev/null
adb shell am force-stop $APP; adb logcat -c
(exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
mark launch; adb shell am start -W -n $APP/.MainActivity > "$D/launch.txt"; sleep 8
mark "deep link"; adb shell am start -W -a android.intent.action.VIEW -d "com.strumble.tv://stage?crowd=3d" >> "$D/launch.txt"; sleep 12
R=$(curl -s localhost:8787/rooms | python3 -c 'import json,sys; print(json.load(sys.stdin)["rooms"][-1])'); mark "room $R"
~/emu/emu720.sh rec start "$D/take.mkv" > /dev/null; mark "recorder started"; sleep 3
(cd ~/strumble && exec setsid bash -c "echo \$\$ > $D/phone.pid; exec corepack yarn workspace @strumble/relay fake-phone --room $R --words scripts/standup-demo.json") > "$D/phone.log" 2>&1 < /dev/null &
mark "phone joins"; sleep 10
adb shell dumpsys gfxinfo $APP reset > /dev/null
mark "OK"; adb shell input keyevent KEYCODE_DPAD_CENTER
sleep 60; top -b -n 1 -w 200 | sed -n 1,14p > "$D/host-top.txt"; adb shell top -b -n 1 -m 8 > "$D/guest-top.txt"; mark "mid-set top"
for i in $(seq 1 300); do grep -q "\[phone\] finished" "$D/phone.log" && break; sleep 1; done; mark "phone finished"
adb shell dumpsys gfxinfo $APP > "$D/gfxinfo-set.txt"; adb shell dumpsys gfxinfo $APP reset > /dev/null
sleep 30; adb shell dumpsys gfxinfo $APP > "$D/gfxinfo-cutsheet.txt"; adb shell dumpsys meminfo $APP > "$D/meminfo-cutsheet.txt"
adb exec-out screencap -p > "$D/cutsheet.png"; mark "cut sheet samples"
~/emu/emu720.sh rec stop > /dev/null; mark "recorder stopped"
kill -- -"$(cat "$D/phone.pid")" 2>/dev/null; kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
grep -E "\[crowd\]" "$D/logcat.txt" > "$D/crowd-lines.txt"
mark done
