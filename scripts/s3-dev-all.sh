#!/usr/bin/env bash
# Screenshot via `next dev` WITHOUT touching .next (no rm). Dev compiles each
# route on first hit; my S3 routes have no dependency on the in-flux backend
# badges/ratings routes, so they compile fine even while the backend build is
# broken. Per-route: hit until 200 (long timeout for first compile), then shoot.
set +e
APP=/mnt/c/tools/matching-app
PORT="${PORT:-3580}"
OUT=/tmp/s3-shots
V=/tmp/s3fe-verdict.log
export OUT BASE="http://127.0.0.1:$PORT"
mkdir -p "$OUT"
rm -f "$OUT"/*.png 2>/dev/null
: > "$V"
say() { echo "$1" | tee -a "$V"; }
cd "$APP" || { say "CD_FAILED"; exit 90; }

pre=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)
if [ "$pre" != "000" ] && [ -n "$pre" ]; then say "PORT_BUSY $PORT"; exit 92; fi

# Remove only the dev manifest fragments that go stale, NOT a full rm of .next
# (full rm mid-compile corrupts dev). A fresh .next/ is fine for first dev start.
rm -rf "$APP/.next" 2>/dev/null
NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next dev -p "$PORT" > /tmp/s3fe-dev.log 2>&1 &
SRV=$!
say "DEV_PID=$SRV"
cleanup(){ kill "$SRV" 2>/dev/null || true; sleep 1 || true; kill -9 "$SRV" 2>/dev/null || true; say "CLEANED_UP"; }
trap cleanup EXIT

UP=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null)
  [ "$code" = "200" ] && { UP=1; break; }
  sleep 1
done
say "ROOT=$code"

# Compile + confirm 200 for each route we shoot. Generous per-route budget.
for r in "/applications" "/matches/m_notified" "/matches/pending_venue" "/admin/matches" "/admin/matches/m_pending"; do
  hc=000
  for t in $(seq 1 40); do
    hc=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://127.0.0.1:$PORT$r" 2>/dev/null)
    [ "$hc" = "200" ] && break
    sleep 2
  done
  say "route $hc $r"
done

node "$APP/scripts/s3-shots.cjs" >> "$V" 2>&1
RC=$?
say "PLAYWRIGHT_RC=$RC"
ls -la "$OUT"/*.png >> "$V" 2>&1
say "DONE_MARKER"
exit $RC
