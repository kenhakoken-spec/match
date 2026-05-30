#!/usr/bin/env bash
# S7 E2E ランナー: next dev起動→warmup→s7-coreloop.mjs→停止。kill内包(||true)。
set +e
cd /mnt/c/tools/matching-app
PORT=3500
BASE="http://127.0.0.1:${PORT}"
OUT=/tmp/s7; mkdir -p "$OUT"
: > "$OUT/run.log"
say(){ echo "$@" | tee -a "$OUT/run.log"; }

fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
say "[s7] starting next dev on ${PORT}"
PORT=${PORT} MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 nohup npx next dev -p ${PORT} > "$OUT/dev.log" 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 90); do curl -s -m2 -o /dev/null "$BASE" 2>/dev/null && { ready=yes; break; }; sleep 1; done
say "[s7] ready=$ready waited=${i}s"
if [ "$ready" != "yes" ]; then tail -15 "$OUT/dev.log" | tee -a "$OUT/run.log"; kill $SRV 2>/dev/null||true; exit 1; fi

# warmup（dev on-demand compile）
for p in / /onboarding /identity /profile/new /browse /applications /ratings /mypage /admin/matches /admin/slots /admin/badges "/api/me" "/api/slots"; do
  code=$(curl -s -m60 -o /dev/null -w "%{http_code}" "$BASE$p" 2>/dev/null || echo ERR)
  say "[warm] $p -> $code"
done

say "[s7] running coreloop e2e"
PORT=${PORT} SMOKE_T=30000 timeout 240 node tools/s7-coreloop.mjs >> "$OUT/run.log" 2>&1
say "[s7] coreloop exit=$?"

fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
pkill -f "chrome.*headless" >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
say "[s7] done"
exit 0
