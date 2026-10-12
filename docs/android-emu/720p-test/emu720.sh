#!/usr/bin/env bash
# The 720p Android TV emulator (encore_tv34_720: API 34 Android TV x86, 1280x720 @ 213 dpi), headless with -gpu host.
#   emu720.sh up [TAG]        Xvfb :99 (1920x1080), a PulseAudio null sink, the emulator; LP_NUM_THREADS passes through
#   emu720.sh down
#   emu720.sh probe DIR [S]   launch Encore, open the 3D stage, wait S s on the bill; [crowd] lines, host/guest top
#   emu720.sh rec start OUT.mkv | rec stop    x11grab of the 1280x720 window at +100+100 (30 fps) + the null sink
set -u
export ANDROID_HOME=$HOME/Android ANDROID_SDK_ROOT=$HOME/Android
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.local/bin:$PATH
RUN=$HOME/.cache/emu; mkdir -p "$RUN"
export DISPLAY=:99 PULSE_SERVER=unix:$RUN/pulse.sock
APP=com.strumble.tv
case "${1:-}" in
  up)
    TAG=${2:-}
    pgrep -x Xvfb > /dev/null || { (exec setsid Xvfb :99 -screen 0 1920x1080x24 +extension GLX +render -noreset) > "$RUN/xvfb.log" 2>&1 < /dev/null & sleep 1; }
    pactl info > /dev/null 2>&1 || { (XDG_RUNTIME_DIR=$RUN exec setsid pulseaudio -n --daemonize=no --exit-idle-time=-1 --disallow-exit \
        -L "module-native-protocol-unix socket=$RUN/pulse.sock auth-anonymous=1" \
        -L "module-null-sink sink_name=emu sink_properties=device.description=emu rate=48000") > "$RUN/pulse.log" 2>&1 < /dev/null & sleep 1; }
    echo "LP_NUM_THREADS=${LP_NUM_THREADS:-unset}"; printf "window.x = 100\nwindow.y = 100\nwindow.scale = 1.000000\n" > ~/.android/avd/encore_tv34_720.avd/emulator-user.ini
    (exec setsid emulator -avd encore_tv34_720 -gpu host -accel on -no-snapshot -no-boot-anim -no-metrics -ports 5554,5555 ${EMU_EXTRA:-}) \
      > "$RUN/emulator-720$TAG.log" 2>&1 < /dev/null &
    t0=$(date +%s); adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
    for w in $(xdotool search --name "Emulator Running in Nested" 2> /dev/null); do xdotool windowunmap "$w"; done
    echo "booted in $(( $(date +%s) - t0 )) s; $(adb shell wm size | tr -d '\r'); $(adb shell wm density | tr -d '\r')"
    xwininfo -root -tree | grep "Android Emulator" ;;
  down) adb emu kill > /dev/null 2>&1; sleep 4; pgrep -x qemu-system-x86 > /dev/null && echo "still running" || echo stopped ;;
  probe)
    D=$2; S=${3:-40}; mkdir -p "$D"
    adb reverse tcp:8787 tcp:8787 > /dev/null; adb reverse tcp:18080 tcp:8080 > /dev/null
    adb shell am force-stop $APP; adb logcat -c
    (exec setsid bash -c "echo \$\$ > $D/logcat.pid; exec adb logcat -v threadtime") > "$D/logcat.txt" 2>&1 < /dev/null &
    adb shell am start -W -n $APP/.MainActivity | grep -E "TotalTime"; sleep 8
    adb shell am start -W -a android.intent.action.VIEW -d "com.strumble.tv://stage?crowd=3d" > /dev/null
    sleep "$S"
    top -b -n 1 -w 200 | sed -n 1,12p > "$D/host-top.txt"; adb shell top -b -n 1 -m 8 > "$D/guest-top.txt"
    adb exec-out screencap -p > "$D/bill.png"
    kill -- -"$(cat "$D/logcat.pid")" 2>/dev/null
    grep -E "\[crowd\]" "$D/logcat.txt" > "$D/crowd-lines.txt"
    sed -n 7,9p "$D/host-top.txt"; sed -n 4,9p "$D/guest-top.txt"
    grep -E "\] [0-9]+ fps" "$D/crowd-lines.txt" | awk 'NR>2 {for(i=1;i<=NF;i++){if($(i+1)=="fps") f=$i; if($(i+1)=="ms") m=$i} c++; sf+=f; sm+=m} END{printf "bill: %d reports, mean %.1f fps, %.1f ms\n", c, sf/c, sm/c}'
    grep -E "\[crowd\] view" "$D/crowd-lines.txt" | tail -1 ;;
  rec)
    if [ "$2" = start ]; then
      xdotool mousemove 0 0 2> /dev/null
      (exec setsid ffmpeg -loglevel warning -y -thread_queue_size 1024 -f x11grab -draw_mouse 0 -framerate 30 -video_size 1280x720 -i :99+100,100 \
        -thread_queue_size 1024 -f pulse -i emu.monitor -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p -threads 2 \
        -c:a aac -b:a 128k "$3") > "$3.log" 2>&1 < /dev/null &
      echo $! > "$RUN/xrec.pid"; echo "recording $3"
    else kill -INT "$(cat "$RUN/xrec.pid")" 2>/dev/null; sleep 3; echo stopped; fi ;;
  *) sed -n 2,6p "$0"; exit 2 ;;
esac
