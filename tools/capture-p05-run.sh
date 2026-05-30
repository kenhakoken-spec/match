#!/usr/bin/env bash
# P-05 だけを本番ビルド(.next)に対しPORT3700で撮り直す。start→capture→stop を1スクリプトに閉じる(kill||true)。
set +e
cd /mnt/c/tools/matching-app
PORT=3700; BASE="http://127.0.0.1:${PORT}"; OUT=/tmp/capp05; mkdir -p "$OUT"; : > "$OUT/run.log"
say(){ echo "$@" | tee -a "$OUT/run.log"; }
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
sleep 1
say "[p05] build_id=$(cat .next/BUILD_ID 2>/dev/null || echo none)"
PORT=${PORT} MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 RELEASE_MODE=open nohup npm start -- -p ${PORT} > "$OUT/start.log" 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 60); do curl -s -m2 -o /dev/null "$BASE/explore" 2>/dev/null && { ready=yes; break; }; sleep 1; done
say "[p05] ready=$ready waited=${i}s"
if [ "$ready" = "yes" ]; then
  PORT=${PORT} timeout 120 node tools/capture-p05.mjs >> "$OUT/run.log" 2>&1
  say "[p05] capture exit=$?"
else
  tail -20 "$OUT/start.log" | tee -a "$OUT/run.log"
fi
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
say "[p05] size=$(stat -c %s docs/screens/P-05_explore_detail.png 2>/dev/null || echo MISSING)"
say "[p05] done"
exit 0
