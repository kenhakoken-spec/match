#!/usr/bin/env bash
# S8追加画面を本番ビルド(.next)に対しPORT3700で撮影。start→capture→stopを1スクリプトに閉じる(kill||true)。
# 既存の .next/BUILD_ID を再利用する（rebuild しない＝ビルド実証を壊さない）。
set +e
cd /mnt/c/tools/matching-app
PORT=3700; BASE="http://127.0.0.1:${PORT}"; OUT=/tmp/caps8; mkdir -p "$OUT"; : > "$OUT/run.log"
say(){ echo "$@" | tee -a "$OUT/run.log"; }
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
sleep 1
if [ ! -f .next/BUILD_ID ]; then say "[caps8] no build -> building"; npm run build > "$OUT/build.log" 2>&1; fi
say "[caps8] build_id=$(cat .next/BUILD_ID 2>/dev/null || echo none)"
PORT=${PORT} MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 RELEASE_MODE=open nohup npm start -- -p ${PORT} > "$OUT/start.log" 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 60); do curl -s -m2 -o /dev/null "$BASE/explore" 2>/dev/null && { ready=yes; break; }; sleep 1; done
say "[caps8] ready=$ready waited=${i}s pid=$SRV"
if [ "$ready" = "yes" ]; then
  PORT=${PORT} timeout 220 node tools/capture-s8.mjs >> "$OUT/run.log" 2>&1
  say "[caps8] capture exit=$?"
else
  say "[caps8] server not ready; tail start.log:"; tail -20 "$OUT/start.log" | tee -a "$OUT/run.log"
fi
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
say "[caps8] done"
exit 0
