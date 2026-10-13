#!/usr/bin/env bash
# One scripted set, recorded, from a fresh launch: bill (venue, act) -> live -> finale -> cut sheet -> green room ⇄ cut
# sheet -> bill. usage: setrun.sh OUTDIR ACT VENUE [SCRIPT|-] [again]
#   again: from the cut sheet, OK starts a second set (in the room the debrief picked), and it runs to the cut sheet.
set -u
export PATH=$HOME/.local/bin:$HOME/Android/platform-tools:$PATH
D=$1; ACT=$2; VEN=$3; SC=${4:--}; AGAIN=${5:-}; mkdir -p "$D"; APP=com.strumble.tv; export QA=$D
mark() { echo "$(date -u +%H:%M:%S.%N | cut -c1-12) $*" | tee -a "$D/timeline.txt"; }
key() { adb shell input keyevent "KEYCODE_$1"; mark "key $1${2:+ ($2)}"; }
adb reverse tcp:8787 tcp:8787 >/dev/null; adb reverse tcp:18080 tcp:8080 >/dev/null
adb shell am force-stop $APP; adb shell input keyevent KEYCODE_HOME; sleep 2; adb logcat -c
(exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
~/emu/bk/brec.sh start "$D/rec.mkv" | tee -a "$D/timeline.txt"; sleep 1.5
mark "launch"; adb shell am start -W -n $APP/.MainActivity | grep TotalTime; sleep 14
S=""; [ "$SC" != - ] && S="scripts/$SC.json"
bash ~/emu/qa.sh phone p Aman $S > /dev/null
sleep 3
case $VEN in openmic) key DPAD_LEFT venue;; theatre) key DPAD_RIGHT venue;; arena) key DPAD_RIGHT venue; sleep 0.6; key DPAD_RIGHT venue;; esac
sleep 12
case $ACT in singing) n=1;; poetry) n=2;; speech) n=3;; *) n=0;; esac
if [ $n -gt 0 ]; then key DPAD_UP; for i in $(seq 1 $n); do sleep 0.6; key DPAD_RIGHT act; done; sleep 0.6; key DPAD_DOWN; fi
sleep 4; adb exec-out screencap -p > "$D/bill.png"
key ENTER "start $ACT at $VEN"
if [ "$ACT" = singing ]; then sleep 45; key ENTER "end the set"; else bash ~/emu/qa.sh waitfin p 240 > /dev/null; mark "phone finished"; fi
sleep 5; mark "(finale plate 3 s, then the cut sheet)"; sleep 15
key BACK "to the green room"; sleep 7; key BACK "to the cut sheet"; sleep 6; key BACK "to the green room"; sleep 6
if [ -n "$AGAIN" ]; then key BACK "to the cut sheet"; sleep 5; key ENTER "next set from the cut sheet"
  for i in $(seq 1 240); do [ "$(grep -c "\[phone\] finished" "$D/phone-p.log")" -ge 2 ] && break; sleep 1; done; mark "second set finished"; sleep 22; key BACK "to the green room"; sleep 6; fi
key DPAD_RIGHT "to the bill"; sleep 16
adb shell dumpsys meminfo $APP | grep -E "TOTAL PSS" | head -1 | tee -a "$D/timeline.txt"
bash ~/emu/qa.sh phonestop p > /dev/null
~/emu/bk/brec.sh stop > /dev/null; kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null; mark done
grep -E "\[tv\] arm|finished" "$D/phone-p.log" | tail -4
