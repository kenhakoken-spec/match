---
name: e2e-dev-not-start
description: curl E2E must run against `next dev`, not `next start` — production fail-close disables all mocks
metadata:
  type: feedback
---

For curl/HTTP E2E of mock-backed endpoints, start the server with `next dev` (NODE_ENV=development), NOT `next start`.

**Why:** `src/lib/env.ts` is fail-close (SEC-001): in production (`NODE_ENV=production`, which `next start` sets) `isMockAuthEnabled()` / `isMockDbEnabled()` / `isMockNotifyEnabled()` return **false regardless of MOCK_* env vars**. Under `next start` the repo switches to PrismaRepo (no local DB) and `/api/auth/dev-login` returns 404 — so a mock-based E2E cannot log in or read seed data. Confirmed during S6: `npm run build` is fine for compile sanity, but the actual curl flow only works on `next dev -p PORT` with `MOCK_DB=1 MOCK_AUTH=1 MOCK_NOTIFY=1`.

**How to apply:** In a single E2E script: `npm run build` for compile sanity (optional), then `./node_modules/.bin/next dev -p <PORT>` for the live server, poll `GET /api/me` until it returns 401/200, run curls, then `kill "$PID" || true` (never bare pkill/fuser). See [[verification-trust]] for the kill-safety rule.
