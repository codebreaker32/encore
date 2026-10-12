#!/usr/bin/env bash
# Record the emulator display (1920x1080 window at +100+100 on Xvfb :99, window.scale 1) and the device sound
# (PulseAudio null sink "emu") with one ffmpeg, so picture and sound share a clock.
#   xrec.sh start OUT.mkv [FPS]   |   xrec.sh stop
set -u
RUN=$HOME/.cache/emu
case "${1:-}" in
  start)
    OUT=$2; FPS=${3:-30}
    DISPLAY=:99 xdotool mousemove 0 0 2>/dev/null || true
    PULSE_SERVER=unix:$RUN/pulse.sock setsid nohup ffmpeg -loglevel warning -y \
      -thread_queue_size 1024 -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size 1920x1080 -i :99+100,100 \
      -thread_queue_size 1024 -f pulse -i emu.monitor \
      -c:v libx264 -preset ultrafast -crf 22 -pix_fmt yuv420p -threads 2 -c:a aac -b:a 128k "$OUT" \
      > "$OUT.log" 2>&1 < /dev/null &
    echo $! > $RUN/xrec.pid; echo "recording $OUT (pid $(cat $RUN/xrec.pid))" ;;
  stop) kill -INT "$(cat $RUN/xrec.pid)" 2>/dev/null; sleep 3; echo stopped ;;
  *) sed -n 2,4p "$0"; exit 2 ;;
esac
