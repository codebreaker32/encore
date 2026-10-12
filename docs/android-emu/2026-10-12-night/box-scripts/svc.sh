#!/usr/bin/env bash
# Relay (:8787, RELAY_DEBUG_ROOMS=1) and MC (:8080, instance role; the humour model when ~/models/humor-int8 exists).
#   svc.sh start LOGDIR | stop
set -u
export PATH=$HOME/.local/bin:$PATH
case "${1:-}" in
  start)
    D=$2; mkdir -p "$D"
    (cd ~/strumble && RELAY_DEBUG_ROOMS=1 exec setsid nohup corepack yarn workspace @strumble/relay start) > "$D/relay.log" 2>&1 < /dev/null &
    H=""; [ -f ~/models/humor-int8/model.int8.onnx ] && H=$HOME/models/humor-int8
    (cd ~/strumble/services/mc-agent && MC_HUMOR_MODEL_DIR=$H exec setsid nohup ~/.local/bin/uv run --group humor python -m mc_agent.app) > "$D/mc.log" 2>&1 < /dev/null &
    echo "started (humour model: ${H:-none})" ;;
  stop)
    for port in 8787 8080; do pid=$(ss -ltnp | grep ":$port " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
      [ -n "$pid" ] && kill -- -"$(ps -o pgid= -p "$pid" | tr -d " ")" && echo "stopped :$port"; done ;;
esac
