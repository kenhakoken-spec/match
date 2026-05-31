#!/usr/bin/env bash
# 本人認証 AI 判定トリガーの **ローカル実証ランナー**（dev モード）。
#
# 重要: next start は NODE_ENV=production になり、フェイルクローズ設計(SEC-001)で
#   MOCK_AUTH/MOCK_DB が無視される（dev-login=404 / 実DB接続=失敗）。トリガーフローを
#   モックで実証するには **next dev**（NODE_ENV=development）で動かす必要がある。
#
# 流れ: dev起動 → テストユーザーで提出(pending) → トリガー実行(キュー→判定→書き戻し)
#       → GET /api/identity が approved になることを確認 → 停止。
# start→run→stop を1スクリプトに閉じる(kill||true)。本番では本スクリプトは不要。
set +e
cd /mnt/c/tools/matching-app
PORT=3702; BASE="http://127.0.0.1:${PORT}"; ORIGIN="$BASE"; OUT=/tmp/aitrig; mkdir -p "$OUT"; : > "$OUT/run.log"
say(){ echo "$@" | tee -a "$OUT/run.log"; }
export AI_TRIGGER_TOKEN="dev-ai-trigger-token"
export AI_TRIGGER_BASE_URL="$BASE"

fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
sleep 1
# dev モード（NODE_ENV=development → モック有効）。.next を dev が使うので build 検証後に実行すること。
MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 nohup ./node_modules/.bin/next dev -p ${PORT} > "$OUT/start.log" 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 90); do
  curl -s -m2 -o /dev/null "$BASE/api/me" 2>/dev/null && { ready=yes; break; }
  sleep 1
done
say "[aitrig] mode=dev ready=$ready waited=${i}s"

if [ "$ready" = "yes" ]; then
  J="$OUT/cookies.txt"; : > "$J"
  # 同一オリジン Origin を付けて CSRF(SEC-003) を通す。dev は missing-origin も許容だが明示する。
  H_ORIGIN=(-H "Origin: ${ORIGIN}")
  H_JSON=(-H 'content-type: application/json')

  # 1) dev-login（dev モードなので有効）
  curl -s -c "$J" -X POST "$BASE/api/auth/dev-login" "${H_ORIGIN[@]}" "${H_JSON[@]}" \
    -d '{"lineUserId":"aitrig-user"}' > "$OUT/login.json" 2>&1
  say "[aitrig] login: $(cat "$OUT/login.json")"

  # 2) プロフィール（18歳以上の生年月日 → ok 判定で自動承認される）
  curl -s -b "$J" -c "$J" -X PUT "$BASE/api/profile" "${H_ORIGIN[@]}" "${H_JSON[@]}" \
    -d '{"displayName":"トリガー太郎","gender":"male","birthdate":"1994-04-01","areaPref":["ebisu"],"bio":"よろしく"}' > "$OUT/profile.json" 2>&1
  say "[aitrig] profile: $(cat "$OUT/profile.json")"

  # 3) 身分証提出（AIは同期で呼ばれない → status=pending のはず）
  curl -s -b "$J" -c "$J" -X POST "$BASE/api/identity" "${H_ORIGIN[@]}" "${H_JSON[@]}" \
    -d '{"docType":"drivers_license","blobRef":"mock-blob://clear-aitrig"}' > "$OUT/submit.json" 2>&1
  say "[aitrig] submit(期待 pending): $(cat "$OUT/submit.json")"

  # 4) トリガージョブ（キュー取得→judge→書き戻し→18+安全弁付き自動承認）
  AI_TRIGGER_BASE_URL="$BASE" AI_TRIGGER_TOKEN="dev-ai-trigger-token" node tools/ai-identity-trigger.mjs >> "$OUT/run.log" 2>&1
  say "[aitrig] trigger exit=$?"

  # 5) 結果確認（GET /api/identity が approved になっていれば実証成功）
  curl -s -b "$J" "$BASE/api/identity" "${H_ORIGIN[@]}" > "$OUT/status.json" 2>&1
  say "[aitrig] final status(期待 approved): $(cat "$OUT/status.json")"
else
  say "[aitrig] server not ready; start.log tail:"; tail -20 "$OUT/start.log" | tee -a "$OUT/run.log"
fi

fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
say "[aitrig] done"
exit 0
