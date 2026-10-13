#!/usr/bin/env bash
# brec.sh start OUT.mkv | stop : x11grab of the emulator window, 30 fps, wall-clock timestamps (-copyts), no audio.
export DISPLAY=:99
RUN=$HOME/.cache/emu
if [ "$1" = start ]; then
  xdotool mousemove 0 0 2>/dev/null
  (exec setsid ffmpeg -loglevel warning -y -thread_queue_size 1024 -use_wallclock_as_timestamps 1 -f x11grab -draw_mouse 0 -framerate 30 -video_size 1280x720 -i :99+100,100 \
     -copyts -c:v libx264 -preset ultrafast -crf 22 -pix_fmt yuv420p -threads 2 "$2") > "$2.log" 2>&1 < /dev/null &
  echo $! > "$RUN/brec.pid"; echo "rec $2 $(date +%s.%N)"
else kill -INT "$(cat "$RUN/brec.pid")" 2>/dev/null; sleep 3; echo stopped; fi
