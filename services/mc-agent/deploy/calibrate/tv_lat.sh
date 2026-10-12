# Time judge requests from the TV's own shell: POST /invocations over a fresh TCP connection (toybox nc) to
# 127.0.0.1:18097, which adb reverse carries to the laptop, an SSH tunnel to the build box's MC on :8097.
# t0 before the request is written, t1 the moment nc returns (the server closed after the full response).
# mksh's $EPOCHREALTIME needs no fork; toybox nc closes on stdin EOF, so stdin stays open until nc is done.
# usage: sh tv_lat.sh BODIES OUT [PATH]   (one JSON body per line, ASCII only; PATH /invocations or /ping)
IN=$1; OUT=$2; P=${3:-/invocations}; D=/data/local/tmp/lat_done; R=/data/local/tmp/lat_r.txt; T=/data/local/tmp/lat_t1
: > $OUT
i=0
while IFS= read -r B; do
  i=$((i+1)); rm -f $D
  if [ "$P" = /ping ]; then REQ="GET /ping HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"; B=""; else
    REQ="POST $P HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${#B}\r\nConnection: close\r\n\r\n"; fi
  t0=$EPOCHREALTIME
  (printf "$REQ"; printf '%s' "$B"; while [ ! -e $D ]; do sleep 0.02; done) | { nc 127.0.0.1 18097 > $R; echo $EPOCHREALTIME > $T; touch $D; }
  echo "$i $t0 $(cat $T) $(tail -n 1 $R)" >> $OUT
done < $IN
echo done $i
