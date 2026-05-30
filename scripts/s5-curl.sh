#!/usr/bin/env bash
# =============================================================================
# S5 相互評価 curl E2E（PORT=3405）。dev サーバ専用（build-first は WSL DrvFs で
# .next を壊すため使わない / feedback-build-proof-isolation）。
#
# 使い方（kill 系の exit144 巻き添えを避けるため、起動とcurlは分離推奨）:
#   1) 別ターミナルで:  ./node_modules/.bin/next dev -p 3405
#      （`npm run dev` は port 3000 固定なので **直接バイナリ** を -p 付きで叩く）
#   2) 立ち上がったら:   bash scripts/s5-curl.sh
#
# 本スクリプトは「起動済み dev サーバ」前提で curl のみ流す（kill しない）。
# 検証する受入条件（契約§5）:
#   (1) done 参加者が同席者を評価 → 200 → summary に反映（avg=4.5,count=2）
#   (2) 同じ相手を二重評価 → 409 already_rated
#   (3) 自分自身を評価 → 400 self_rate
#   (4) 非参加者/非同席者が評価 → 403 forbidden（IDOR）
# 付随: score 6/3.5 → 400 / 未ログイン → 401 / 非done枠 → 403 / pending は評価済みを除外。
# =============================================================================
set -u
PORT=3405
BASE="http://127.0.0.1:${PORT}"
CM1=/tmp/s5c_m1.txt; CM2=/tmp/s5c_m2.txt; COUT=/tmp/s5c_out.txt
rm -f "$CM1" "$CM2" "$COUT"

# 起動確認（最大60s ポーリング。200/401 で「起動済み」とみなす）。
echo "=== wait for dev server on ${PORT} (200/401) ==="
UP=0
for i in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/me")
  if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then UP=1; echo "up (code=${CODE})"; break; fi
  sleep 2
done
if [ "$UP" != "1" ]; then echo "SERVER_NOT_RUNNING — start it first: ./node_modules/.bin/next dev -p ${PORT}"; exit 1; fi

st() { curl -s -o /dev/null -w "HTTP=%{http_code}\n" "$@"; }  # 状態のみ（本文と分離）

echo ""; echo "###### [0] seed done event + 6 members ######"
curl -s -X POST "${BASE}/api/ratings/_dev-seed"; echo ""
st -X POST "${BASE}/api/ratings/_dev-seed"

echo ""; echo "###### [1] dev-login as rate-m1 (done 同席メンバー) ######"
curl -s -c "$CM1" -X POST "${BASE}/api/auth/dev-login" -H 'content-type: application/json' -d '{"lineUserId":"Urate_rate-m1"}'; echo ""

echo ""; echo "###### [2] GET pending (未評価の同席者5名・PIIは userId/displayName のみ) ######"
curl -s -b "$CM1" "${BASE}/api/ratings/pending"; echo ""

echo ""; echo "###### [3] self評価 → 400 self_rate ######"
curl -s -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-m1","score":5}'; echo ""
st -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-m1","score":5}'

echo ""; echo "###### [4] 正常評価 rate-m1→rate-f1 score=4 (comment サニタイズ) → 200 + summary ######"
curl -s -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":4,"comment":"<b>tag</b>\ttab  multi"}'; echo ""

echo ""; echo "###### [5] 二重評価 rate-m1→rate-f1 → 409 already_rated ######"
curl -s -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":2}'; echo ""
st -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":2}'

echo ""; echo "###### [6] rate-m2 も rate-f1 を score=5 → summary avg=4.5 count=2 ######"
curl -s -c "$CM2" -X POST "${BASE}/api/auth/dev-login" -H 'content-type: application/json' -d '{"lineUserId":"Urate_rate-m2"}' -o /dev/null -w "login HTTP=%{http_code}\n"
curl -s -b "$CM2" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":5}'; echo ""

echo ""; echo "###### [7] rate-f1 の summary → avg=4.5 count=2 ######"
curl -s -c /tmp/s5c_f1.txt -X POST "${BASE}/api/auth/dev-login" -H 'content-type: application/json' -d '{"lineUserId":"Urate_rate-f1"}' -o /dev/null -w "login HTTP=%{http_code}\n"
curl -s -b /tmp/s5c_f1.txt "${BASE}/api/ratings/received/summary"; echo ""
st -b /tmp/s5c_f1.txt "${BASE}/api/ratings/received/summary"

echo ""; echo "###### [8] 非参加者 rate-outsider が done 同席者を評価 → 403 (IDOR) ######"
curl -s -c "$COUT" -X POST "${BASE}/api/auth/dev-login" -H 'content-type: application/json' -d '{"lineUserId":"Urate_outsider"}' -o /dev/null -w "login HTTP=%{http_code}\n"
curl -s -b "$COUT" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":5}'; echo ""
st -b "$COUT" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":5}'

echo ""; echo "###### [9] score=6 範囲外 → 400 / score=3.5 非整数 → 400 ######"
st -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f2","score":6}'
st -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-done","rateeId":"rate-f2","score":3.5}'

echo ""; echo "###### [10] 未ログインで pending → 401 ######"
st "${BASE}/api/ratings/pending"

echo ""; echo "###### [11] 非done枠(seed-slot-normal)で評価 → 403 ######"
st -b "$CM1" -X POST "${BASE}/api/ratings" -H 'content-type: application/json' -d '{"slotId":"seed-slot-normal","rateeId":"rate-f2","score":5}'

echo ""; echo "###### [12] rate-m1 の pending 再取得 → 評価済みを除外 ######"
curl -s -b "$CM1" "${BASE}/api/ratings/pending"; echo ""

rm -f "$CM1" "$CM2" "$COUT" /tmp/s5c_f1.txt
echo ""; echo "=== DONE (teardown は別途: fuser -k ${PORT}/tcp || true) ==="
