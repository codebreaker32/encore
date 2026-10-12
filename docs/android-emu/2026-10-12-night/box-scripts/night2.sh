#!/usr/bin/env bash
# Poetry and speech, scripted with words on, on the Android TV emulator (3D room on), each recorded (x11grab + the null
# sink). Continues night.sh's session: the app is on the bill with the act row focused and stand-up selected.
# Each set gets its own performer name: the relay keeps a departed player's seat (and name) for resume, and the fake
# phone cannot resume it, so a second "Aman" is refused with name-taken.
#   ROOM=ABCD night2.sh NEW_OUT_DIR
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; mkdir "$D" || exit 1
R=${ROOM:?set ROOM}
ts() { date -u +%H:%M:%S.%N | cut -c1-12; }
mark() { echo "$(ts) $*" | tee -a "$D/timeline.txt"; }
key() { adb shell input keyevent "$1"; mark "key $1"; sleep "${2:-1.2}"; }
shot() { adb exec-out screencap -p > "$D/$1.png"; mark "screenshot $1"; }
phone() { # name script performer
  (cd ~/strumble && exec setsid bash -c "echo \$\$ > $D/phone-$1.pid; exec corepack yarn workspace @strumble/relay fake-phone --room $R --name $3 --words $2") > "$D/phone-$1.log" 2>&1 < /dev/null &
  mark "fake phone $1 joins room $R with $2 as $3"; }
phone_stop() { kill -- -"$(cat "$D/phone-$1.pid")" 2>/dev/null; mark "fake phone $1 stopped"; }
wait_end() { # name: until the phone logs finished (or 330 s)
  for i in $(seq 1 330); do grep -q "\[phone\] finished" "$D/phone-$1.log" && break; sleep 1; done
  mark "phone $1: $(grep -m1 -oE "live: .*" "$D/phone-$1.log")"; mark "phone $1 finished"; }
set_run() { # name cut_wait
  sleep 9  # the phone is on the table; the intro warms 0.9 s after the bill settles
  shot "$1-bill"
  key KEYCODE_DPAD_CENTER 0.5; mark "OK: go live ($1)"
  wait_end "$1"
  sleep "$2"; shot "$1-cutsheet"; sleep 2; shot "$1-cutsheet-2"
}
# 2. poetry: Right twice (singing, poetry)
~/emu/xrec.sh start "$D/poetry.mkv" 30 > /dev/null; mark "recorder started (poetry)"
phone poetry scripts/poetry-demo.json Riya; sleep 3
grep -q "joined room" "$D/phone-poetry.log" || { mark "poetry phone did not join: $(cat "$D/phone-poetry.log")"; }
key KEYCODE_DPAD_RIGHT; key KEYCODE_DPAD_RIGHT
set_run poetry 40
~/emu/xrec.sh stop > /dev/null; mark "recorder stopped (poetry)"; phone_stop poetry
# 3. speech: cut sheet -> Back (DEL) -> green room -> Right -> bill; Up (act row); Right once (speech)
~/emu/xrec.sh start "$D/speech.mkv" 30 > /dev/null; mark "recorder started (speech)"
phone speech scripts/speech-demo.json Kabir; sleep 3
key KEYCODE_DEL 2; key KEYCODE_DPAD_RIGHT 2; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_UP; key KEYCODE_DPAD_RIGHT
set_run speech 40
~/emu/xrec.sh stop > /dev/null; mark "recorder stopped (speech)"; phone_stop speech
# The remote's real Back key (KEYCODE_BACK = 4) on the cut sheet: does Encore stay in front?
key KEYCODE_BACK 3
mark "focus after KEYCODE_BACK: $(adb shell dumpsys window | grep -m1 mCurrentFocus | tr -s ' ')"
shot after-back
mark "done"
