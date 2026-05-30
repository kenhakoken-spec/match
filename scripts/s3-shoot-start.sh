#!/usr/bin/env bash
# Screenshot capture against the PRODUCTION build (next start) — no on-demand
# compilation, so dynamic routes don't 500/404 on first hit. Requires a prior
# successful `next build` (.next/BUILD_ID present). All kill tolerance is inside
# this script. Progress -> verdict file.
set +e
APP=/mnt/c/tools/matching-app
PORT="${PORT:-3500}"
OUT=/tmp/s3-shots
V=/tmp/s3fe-verdict.log
export OUT BASE="http://127.0.0.1:$PORT"
mkdir -p "$OUT"
: > "$V"
say() { echo "$1" | tee -a "$V"; }

cd "$APP" || { say "CD_FAILED"; exit 90; }
if [ ! -f "$APP/.next/BUILD_ID" ]; then say "NO_BUILD"; exit 94; fi

pre=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)
if [ "$pre" != "000" ] && [ -n "$pre" ]; then say "PORT_BUSY $PORT (HTTP $pre)"; exit 92; fi

./node_modules/.bin/next start -p "$PORT" > /tmp/s3fe-start.log 2>&1 &
SRV=$!
say "START_PID=$SRV"
cleanup() { kill "$SRV" 2>/dev/null || true; sleep 1 || true; kill -9 "$SRV" 2>/dev/null || true; say "CLEANED_UP"; }
trap cleanup EXIT

UP=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "404" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then UP=1; break; fi
  sleep 1
done
say "SERVER_UP=$UP"
if [ "$UP" != "1" ]; then say "SERVER_FAILED"; tail -30 /tmp/s3fe-start.log >> "$V"; exit 91; fi

for r in "/matches/m_notified" "/matches/pending_venue" "/admin/matches" "/admin/matches/m_pending" "/applications"; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "http://127.0.0.1:$PORT$r" 2>/dev/null)
  say "check $c $r"
done

node "$APP/scripts/s3-shots.cjs" >> "$V" 2>&1
RC=$?
say "PLAYWRIGHT_RC=$RC"
ls -la "$OUT"/*.png >> "$V" 2>&1
say "DONE_MARKER"
exit $RC
