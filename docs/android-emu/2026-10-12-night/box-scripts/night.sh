#!/usr/bin/env bash
# Three scripted sets with words on (stand-up, poetry, speech) on the Android TV emulator, 3D room on, each recorded
# (x11grab + the null sink). Needs emu.sh up host, Encore installed and cleared, svc.sh start (relay + MC).
#   night.sh NEW_OUT_DIR
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; mkdir "$D" || exit 1
APP=com.strumble.tv
ts() { date -u +%H:%M:%S.%N | cut -c1-12; }
mark() { echo "$(ts) $*" | tee -a "$D/timeline.txt"; }
key() { adb shell input keyevent "$1"; mark "key $1"; sleep "${2:-1.2}"; }
shot() { adb exec-out screencap -p > "$D/$1.png"; mark "screenshot $1"; }
room() { curl -s localhost:8787/rooms | python3 -c "import json,sys; print(json.load(sys.stdin)[\"rooms\"][-1])"; }
phone() { # name script
  (cd ~/strumble && exec setsid bash -c "echo \$\$ > $D/phone-$1.pid; exec corepack yarn workspace @strumble/relay fake-phone --room $R --words $2") > "$D/phone-$1.log" 2>&1 < /dev/null &
  mark "fake phone $1 joins room $R with $2"; }
phone_stop() { kill -- -"$(cat "$D/phone-$1.pid")" 2>/dev/null; mark "fake phone $1 stopped"; }
wait_end() { # name: until the phone logs finished (or 330 s)
  for i in $(seq 1 330); do grep -q "\[phone\] finished" "$D/phone-$1.log" && break; sleep 1; done; mark "phone $1: $(grep -m1 -oE "live: .*" "$D/phone-$1.log")"; mark "phone $1 finished"; }
set_run() { # name script cut_wait
  sleep 9  # the phone is on the table; the intro warms 0.9 s after the bill settles
  shot "$1-bill"
  key KEYCODE_DPAD_CENTER 0.5; mark "OK: go live ($1)"
  wait_end "$1"
  sleep "$3"; shot "$1-cutsheet"; sleep 2; shot "$1-cutsheet-2"
}
adb reverse tcp:8787 tcp:8787 > /dev/null; adb reverse tcp:18080 tcp:8080 > /dev/null
adb shell am force-stop $APP; adb logcat -c
(exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
mark "launch"; adb shell am start -W -n $APP/.MainActivity > "$D/launch.txt"; sleep 8
mark "deep link stage?crowd=3d"; adb shell am start -W -a android.intent.action.VIEW -d "com.strumble.tv://stage?crowd=3d" >> "$D/launch.txt"; sleep 12
R=$(room); mark "room $R"
# 1. stand-up at the Comedy Club (the bill opens on stand-up, the club, sarcastic)
~/emu/xrec.sh start "$D/standup.mkv" 30 > /dev/null; mark "recorder started (standup)"; sleep 3
phone standup scripts/standup-demo.json
set_run standup scripts/standup-demo.json 40
~/emu/xrec.sh stop > /dev/null; mark "recorder stopped (standup)"; phone_stop standup
# 2. poetry: cut sheet -> Back (DEL) -> green room -> Right -> bill; Up to the act row; Right twice (singing, poetry)
~/emu/xrec.sh start "$D/poetry.mkv" 30 > /dev/null; mark "recorder started (poetry)"
phone poetry scripts/poetry-demo.json; sleep 3
key KEYCODE_DEL 2; key KEYCODE_DPAD_RIGHT 2; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_RIGHT; key KEYCODE_DPAD_RIGHT
set_run poetry scripts/poetry-demo.json 40
~/emu/xrec.sh stop > /dev/null; mark "recorder stopped (poetry)"; phone_stop poetry
# 3. speech: the same way back; Right once (speech)
~/emu/xrec.sh start "$D/speech.mkv" 30 > /dev/null; mark "recorder started (speech)"
phone speech scripts/speech-demo.json; sleep 3
key KEYCODE_DEL 2; key KEYCODE_DPAD_RIGHT 2; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_RIGHT
set_run speech scripts/speech-demo.json 40
~/emu/xrec.sh stop > /dev/null; mark "recorder stopped (speech)"; phone_stop speech
# the remote's real Back key (KEYCODE_BACK = 4) on the cut sheet: does Encore stay in front?
key KEYCODE_BACK 3; mark "focus after KEYCODE_BACK: $(adb shell dumpsys window | grep -m1 mCurrentFocus | tr -s " ")"; shot after-back
kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
mark "done"
