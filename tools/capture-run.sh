#!/usr/bin/env bash
# 本番ビルドで全画面キャプチャ。start→capture→stop を1スクリプトに閉じる(kill||true)。
set +e
cd /mnt/c/tools/matching-app
PORT=3600; BASE="http://127.0.0.1:${PORT}"; OUT=/tmp/cap; mkdir -p "$OUT"; : > "$OUT/run.log"
say(){ echo "$@" | tee -a "$OUT/run.log"; }
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
# 本番ビルド(.next)を使う。無ければビルド。
if [ ! -f .next/BUILD_ID ]; then say "[cap] building"; npm run build > "$OUT/build.log" 2>&1; fi
say "[cap] build_id=$(cat .next/BUILD_ID 2>/dev/null||echo none)"
PORT=${PORT} MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 nohup npm start > "$OUT/start.log" 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 60); do curl -s -m2 -o /dev/null "$BASE" 2>/dev/null && { ready=yes; break; }; sleep 1; done
say "[cap] ready=$ready waited=${i}s"
if [ "$ready" = "yes" ]; then
  PORT=${PORT} timeout 200 node tools/capture-screens.mjs >> "$OUT/run.log" 2>&1
  say "[cap] capture exit=$?"
else
  tail -15 "$OUT/start.log" | tee -a "$OUT/run.log"
fi
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
say "[cap] done"
exit 0
