# Like tv_lat.sh, but every request on ONE kept-alive connection (as an HTTP client with a connection pool would do).
# toybox nc runs as an mksh co-process (`|&`: no FIFO, which the shell user may not create in /data/local/tmp); the
# shell writes each request with `print -p` and reads the response lines with the builtin `read -p`, stamping the end
# of each response's headers with $EPOCHREALTIME (the small body follows in the same burst), then sends the next.
# Bodies have no newline, so a body is read glued to the next status line; the last body is not logged.
# usage: sh tv_lat_ka.sh BODIES OUT [PATH]
IN=$1; OUT=$2; P=${3:-/invocations}
: > $OUT
CR=$(printf '\rX'); CR=${CR%X}
nc 127.0.0.1 18097 |&
NC=$!
exec 4<$IN
i=0
send() {
  IFS= read -r B <&4 || return 1
  i=$((i+1))
  if [ "$P" = /ping ]; then R=$(printf 'GET /ping HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\nX'); B=""
  else R=$(printf 'POST %s HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\nX' "$P" ${#B}); fi
  R=${R%X}
  t0=$EPOCHREALTIME
  print -nrp -- "$R$B"
}
send || exit 0
while IFS= read -r -p L; do
  if [ "$L" = "$CR" ]; then t1=$EPOCHREALTIME; echo "$i $t0 $t1" >> $OUT; send || break
  else case $L in *'{"'*) echo "body $L" >> $OUT ;; esac; fi
done
kill $NC 2>/dev/null
echo done $i
