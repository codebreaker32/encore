#!/usr/bin/env bash
# One scripted take on the VVD, recorded with the device's sound: bill -> OK -> about a minute live -> OK (end) -> cut
# sheet. Needs `vvd.sh up`, Encore installed (CROWDGL null in src/crowdgl/CrowdGl.js), and on this machine the relay and the MC:
#   cd ~/strumble && RELAY_DEBUG_ROOMS=1 corepack yarn workspace @strumble/relay start
#   cd ~/strumble/services/mc-agent && ~/.local/bin/uv sync && \
#     MC_VOICE_REGION=us-east-1 MC_VOICE_PREMIUM_REGION=us-east-1 ~/.local/bin/uv run python -m mc_agent.app
# (the box is in us-east-1, which has Polly's generative and long-form engines, so both voice URLs are signed there)
#   vvd-take.sh [OUT_DIR]     (default ~/shots/take; SEED=7 picks the scripted phone's timings)
# Output: take.webm (the console's recording), encore-vvd-take.mp4 (H.264/AAC), 01–06 screenshots, app.log, sink.wav,
# cutsheet.wav (25 s from the end of the set: the debrief voice).
set -u
T=$(cd "$(dirname "$0")" && pwd)
S=${1:-$HOME/shots/take}
REPO=$(cd "$T/../../.." && pwd)
mkdir -p "$S" && rm -f "$S"/*
export PULSE_SERVER=unix:$HOME/.cache/vvd/pulse.sock
VDA=$("$HOME/vega/bin/vega" which vda)
(timeout 140 "$VDA" shell "loggingctl log -f -v com.strumble.vega" > "$S/app.log" 2>&1 &)
cd "$REPO"
# The newest open room is the app's (an older install's room can linger on the relay).
R=$(curl -s localhost:8787/rooms | python3 -c "import json,sys; print(json.load(sys.stdin)['rooms'][-1])")
(setsid nohup corepack yarn workspace @strumble/relay fake-phone --room "$R" --seed "${SEED:-7}" > "$S/fake-phone.log" 2>&1 < /dev/null &)
sleep 8
(setsid nohup timeout 100 parecord -d vvd.monitor --rate=48000 --file-format=wav "$S/sink.wav" > /dev/null 2>&1 < /dev/null &)
python3 "$T/vvd-console.py" "screenrecord start --time-limit 95 --fps 30 --bit-rate 6M $S/take.webm" > /dev/null
sleep 6
"$T/vvd.sh" shot "$S/01-bill.png"
"$T/vvd.sh" key KEY_ENTER
sleep 20
"$T/vvd.sh" shot "$S/02-live.png"
sleep 20
"$T/vvd.sh" shot "$S/03-live.png"
sleep 22
"$T/vvd.sh" shot "$S/04-live.png"
"$T/vvd.sh" key KEY_ENTER
# the cut sheet's own sound, where only the MC's debrief voice should play (the room tone stops with the set)
(setsid nohup timeout 25 parecord -d vvd.monitor --rate=48000 --file-format=wav "$S/cutsheet.wav" > /dev/null 2>&1 < /dev/null &)
sleep 8
"$T/vvd.sh" shot "$S/05-cutsheet.png"
sleep 12
"$T/vvd.sh" shot "$S/06-cutsheet.png"
sleep 6
ffmpeg -y -loglevel error -i "$S/take.webm" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k \
  -movflags +faststart "$S/encore-vvd-take.mp4"
ls -la "$S"
