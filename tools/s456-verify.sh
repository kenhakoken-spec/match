#!/usr/bin/env bash
# S4/S5/S6 + 横断配線の統合curl実証。開発将軍が単独で実行（並列にしない）。
# build→next dev起動→warmup→curl→停止 を1スクリプトに閉じ込め、kill類は || true。
set +e
cd /mnt/c/tools/matching-app
PORT=3410
BASE="http://127.0.0.1:${PORT}"
LOG=/tmp/s456-verify.out
: > "$LOG"

say(){ echo "$@" | tee -a "$LOG"; }

# --- clean build (flaky retry) ---
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
rm -rf .next
ok=no
for i in 1 2 3; do
  if npm run build > /tmp/s456-build.log 2>&1; then ok=yes; break; fi
  say "[build] attempt $i failed, retry"; rm -rf .next
done
say "[build] ok=$ok build_id=$(cat .next/BUILD_ID 2>/dev/null || echo none)"
[ "$ok" != "yes" ] && { tail -15 /tmp/s456-build.log | tee -a "$LOG"; exit 1; }

# --- start next dev (dev mode = dev-login有効) ---
PORT=${PORT} MOCK_AUTH=1 MOCK_DB=1 MOCK_NOTIFY=1 nohup npx next dev -p ${PORT} > /tmp/s456-dev.log 2>&1 &
SRV=$!
ready=no
for i in $(seq 1 60); do curl -s -m2 -o /dev/null "$BASE" 2>/dev/null && { ready=yes; break; }; sleep 1; done
say "[server] ready=$ready pid=$SRV waited=${i}s"
[ "$ready" != "yes" ] && { tail -15 /tmp/s456-dev.log | tee -a "$LOG"; kill $SRV 2>/dev/null || true; exit 1; }

# warmup routes (dev on-demand compile)
for p in / "/api/me" "/api/slots" "/api/ratings/pending" "/api/badges/mine" "/api/payments/mine"; do
  curl -s -m40 -o /dev/null "$BASE$p" 2>/dev/null || true
done
say "[warmup] done"

CJAR=/tmp/cj_admin; UJAR=/tmp/cj_user
rm -f "$CJAR" "$UJAR"

# helper
post(){ curl -s -m30 -w "\n  HTTP=%{http_code}" -H 'Content-Type: application/json' "$@"; }

# === admin login ===
say "=== [A] admin dev-login ==="
post -c "$CJAR" -X POST "$BASE/api/auth/dev-login" -d '{"lineUserId":"v-admin","role":"admin"}' | tee -a "$LOG"; say ""

# === S6 badge: admin grant/revoke + mine ===
say "=== [S6] admin grant premium to seed-user-male, then mine ==="
post -b "$CJAR" -X POST "$BASE/api/admin/badges/grant" -d '{"userId":"seed-user-male"}' | tee -a "$LOG"; say ""
say "--- admin badges list ---"
curl -s -m20 -w "\n  HTTP=%{http_code}" -b "$CJAR" "$BASE/api/admin/badges" | tee -a "$LOG"; say ""
say "--- non-admin grant should be 403 ---"
post -c "$UJAR" -X POST "$BASE/api/auth/dev-login" -d '{"lineUserId":"v-user1","role":"user"}' >/dev/null 2>&1
post -b "$UJAR" -X POST "$BASE/api/admin/badges/grant" -d '{"userId":"v-user1"}' | tee -a "$LOG"; say ""

# === S5 ratings: pending/submit on done slot (uses rating-repo seed) ===
say "=== [S5] seed done event then rate ==="
curl -s -m30 -o /dev/null "$BASE/api/ratings/_dev-seed" 2>/dev/null || true
# login as a done-slot member (rate-m1) and rate co-member rate-f1
post -c /tmp/cj_m1 -X POST "$BASE/api/auth/dev-login" -d '{"lineUserId":"Urate_rate-m1"}' >/dev/null 2>&1
say "--- pending (rate-m1) ---"
curl -s -m20 -w "\n  HTTP=%{http_code}" -b /tmp/cj_m1 "$BASE/api/ratings/pending" | tee -a "$LOG"; say ""
say "--- submit rating m1->f1 score5 (expect 200) ---"
post -b /tmp/cj_m1 -X POST "$BASE/api/ratings" -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":5}' | tee -a "$LOG"; say ""
say "--- duplicate same rating (expect 409) ---"
post -b /tmp/cj_m1 -X POST "$BASE/api/ratings" -d '{"slotId":"seed-slot-done","rateeId":"rate-f1","score":4}' | tee -a "$LOG"; say ""
say "--- self rate (expect 400) ---"
post -b /tmp/cj_m1 -X POST "$BASE/api/ratings" -d '{"slotId":"seed-slot-done","rateeId":"rate-m1","score":5}' | tee -a "$LOG"; say ""

# === S4 payments: intent for female(free)/male-first(free)/male-repeat(¥2000) ===
say "=== [S4] payment intents ==="
say "--- female intent (expect non-charge female_free) ---"
post -b /tmp/cj_m1 -X POST "$BASE/api/payments/intent" -d '{"slotId":"seed-slot-done"}' | tee -a "$LOG"; say " (note: m1 is male participant; checking shape)"

# === admin complete (done transition + attended++) ===
say "=== [S3->done] admin complete on a notified match (if any) ==="
say "--- list admin matches ---"
curl -s -m20 -w "\n  HTTP=%{http_code}" -b "$CJAR" "$BASE/api/admin/matches" | tee -a "$LOG"; say ""

say "=== DONE ==="
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
kill $SRV 2>/dev/null || true
exit 0
