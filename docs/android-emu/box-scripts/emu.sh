#!/usr/bin/env bash
# The Android TV emulator (API 34, 1080p), headless on this GPU-less box: Xvfb :99, a PulseAudio null sink, KVM.
#   emu.sh up [host|swiftshader_indirect]   start (default -gpu host: Mesa llvmpipe through GLX on Xvfb)
#   EMU_EXTRA="-no-window" EMU_TAG=-nowin emu.sh up host   extra emulator flags, log suffix
#   emu.sh down                             stop the emulator (Xvfb and PulseAudio stay)
#   emu.sh console "cmd" …                  emulator console commands (port 5554)
set -euo pipefail
export ANDROID_HOME=$HOME/Android ANDROID_SDK_ROOT=$HOME/Android
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
RUN=$HOME/.cache/emu
mkdir -p "$RUN"
export DISPLAY=:99
export PULSE_SERVER=unix:$RUN/pulse.sock
case "${1:-}" in
  up)
    GPU=${2:-host}
    if ! pgrep -x Xvfb > /dev/null; then
      setsid nohup Xvfb :99 -screen 0 ${XVFB_SIZE:-1920x1080x24} +extension GLX +render -noreset > "$RUN/xvfb.log" 2>&1 < /dev/null &
      sleep 1
    fi
    if ! pactl info > /dev/null 2>&1; then
      XDG_RUNTIME_DIR=$RUN setsid nohup pulseaudio -n --daemonize=no --exit-idle-time=-1 --disallow-exit \
        -L "module-native-protocol-unix socket=$RUN/pulse.sock auth-anonymous=1" \
        -L "module-null-sink sink_name=emu sink_properties=device.description=emu rate=48000" \
        > "$RUN/pulse.log" 2>&1 < /dev/null &
      sleep 1
    fi
    setsid nohup emulator -avd encore_tv34 -gpu "$GPU" -accel on -no-snapshot -no-boot-anim -no-metrics \
      -ports 5554,5555 ${EMU_EXTRA:-} > "$RUN/emulator-$GPU${EMU_TAG:-}.log" 2>&1 < /dev/null &
    t0=$(date +%s)
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d r)" = 1 ]; do sleep 2; done
    echo "booted in $(( $(date +%s) - t0 )) s with -gpu $GPU"
    ;;
  down) adb emu kill > /dev/null 2>&1 || true; sleep 3; pgrep -f qemu-system > /dev/null && echo "still running" || echo "stopped" ;;
  console) shift; python3 "$HOME/strumble/apps/vega/tools/vvd-console.py" "$@" ;;
  *) sed -n 2,6p "$0"; exit 2 ;;
esac
