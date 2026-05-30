#!/usr/bin/env bash
# Self-contained S3 screenshot capture: start next dev -> poll readiness ->
# warmup routes -> playwright -> stop. All kill tolerance is INSIDE this script
# (|| true, trap) so it never poisons a tool batch. Progress -> verdict file.
set +e
APP=/mnt/c/tools/matching-app
PORT="${PORT:-3408}"
OUT=/tmp/s3-shots
V=/tmp/s3fe-verdict.log
export OUT BASE="http://127.0.0.1:$PORT"
mkdir -p "$OUT"
rm -f "$OUT"/*.png 2>/dev/null
: > "$V"
say() { echo "$1" | tee -a "$V"; }

cd "$APP" || { say "CD_FAILED"; exit 90; }

pre=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)
if [ "$pre" != "000" ] && [ -n "$pre" ]; then
  say "PORT_BUSY $PORT (HTTP $pre)"; exit 92
fi

# A prior `next build` leaves a production .next that collides with `next dev`
# (dev can't find vendor-chunks → 500 on dynamic routes). Clear it so dev compiles
# cleanly. (We re-run `next build` separately for the BUILD_ID proof.)
rm -rf "$APP/.next" 2>/dev/null
./node_modules/.bin/next dev -p "$PORT" > /tmp/s3fe-dev.log 2>&1 &
DEV_PID=$!
say "DEV_PID=$DEV_PID"
cleanup() { kill "$DEV_PID" 2>/dev/null || true; sleep 1 || true; kill -9 "$DEV_PID" 2>/dev/null || true; say "CLEANED_UP"; }
trap cleanup EXIT

UP=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "404" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then UP=1; break; fi
  sleep 1
done
say "SERVER_UP=$UP"
if [ "$UP" != "1" ]; then say "SERVER_FAILED"; tail -40 /tmp/s3fe-dev.log >> "$V"; exit 91; fi
if grep -q "is in use, trying" /tmp/s3fe-dev.log 2>/dev/null; then say "PORT_SHIFTED"; exit 93; fi

for r in "/applications" "/matches/m_notified" "/matches/pending_venue" "/admin/matches" "/admin/matches/m_pending"; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 120 "http://127.0.0.1:$PORT$r" 2>/dev/null)
  say "warmup $c $r"
done

# Dynamic routes (/matches/[id], /admin/matches/[id]) compile lazily and the first
# hit can 500 while compiling. Warm each twice and wait for 200 before Playwright.
for r in "/matches/m_notified" "/matches/pending_venue" "/admin/matches/m_pending"; do
  for t in $(seq 1 25); do
    hc=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://127.0.0.1:$PORT$r" 2>/dev/null)
    if [ "$hc" = "200" ]; then break; fi
    sleep 1
  done
  say "ready $hc $r"
done

node "$APP/scripts/s3-shots.cjs" >> "$V" 2>&1
RC=$?
say "PLAYWRIGHT_RC=$RC"
ls -la "$OUT"/*.png >> "$V" 2>&1
say "DONE_MARKER"
exit $RC
