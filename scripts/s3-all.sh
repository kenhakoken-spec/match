#!/usr/bin/env bash
# ATOMIC: build -> next start -> warmup -> playwright -> stop, all sequential in
# ONE process so nothing races on .next. Writes progress to a verdict file and
# never deletes .next after building. Kill tolerance via trap (no pkill).
set +e
APP=/mnt/c/tools/matching-app
PORT="${PORT:-3560}"
OUT=/tmp/s3-shots
V=/tmp/s3fe-verdict.log
export OUT BASE="http://127.0.0.1:$PORT"
mkdir -p "$OUT"
rm -f "$OUT"/*.png 2>/dev/null
: > "$V"
say() { echo "$1" | tee -a "$V"; }

cd "$APP" || { say "CD_FAILED"; exit 90; }

# 1) Build fresh (prisma generate + next build). Leave .next intact afterward.
say "BUILD_START"
rm -rf "$APP/.next"
npm run build > /tmp/s3fe-buildlog.txt 2>&1
BRC=$?
say "BUILD_RC=$BRC"
if [ ! -f "$APP/.next/BUILD_ID" ]; then say "NO_BUILD_ID"; tail -20 /tmp/s3fe-buildlog.txt >> "$V"; exit 94; fi
say "BUILD_ID=$(cat "$APP/.next/BUILD_ID")"

# 2) Start production server.
pre=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null)
if [ "$pre" != "000" ] && [ -n "$pre" ]; then say "PORT_BUSY $PORT"; exit 92; fi
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
if [ "$UP" != "1" ]; then say "SERVER_FAILED"; tail -20 /tmp/s3fe-start.log >> "$V"; exit 91; fi

# 3) Sanity-check each route returns 200 (prod = no compile).
for r in "/matches/m_notified" "/matches/pending_venue" "/admin/matches" "/admin/matches/m_pending" "/applications"; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "http://127.0.0.1:$PORT$r" 2>/dev/null)
  say "check $c $r"
done

# 4) Screenshots.
node "$APP/scripts/s3-shots.cjs" >> "$V" 2>&1
RC=$?
say "PLAYWRIGHT_RC=$RC"
ls -la "$OUT"/*.png >> "$V" 2>&1
say "DONE_MARKER"
exit $RC
