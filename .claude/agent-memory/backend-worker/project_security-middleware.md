---
name: security-middleware
description: SEC-003 CSRF + SEC-004 rate-limit live in Next middleware; how the pieces fit and where exclusions are decided
metadata:
  type: project
---

SEC-003 (CSRF Origin/Referer) and SEC-004 (rate limit) are implemented as a single
Next.js `src/middleware.ts` with `config.matcher = ["/api/:path*"]`. Pure, testable
logic is split out into `src/lib/security/origin.ts` (`evaluateCsrf`) and
`src/lib/security/rate-limit.ts` (`applyRateLimit`, `consume`, `decideFixedWindow`,
`resetRateLimitForTest`). Rate-limit store is `globalThis.__mappRateLimit` (in-memory,
single-process; comment says swap to Redis for multi-instance prod).

**Why:** pre-prod hardening. Browser CSRF on state-changing routes + abuse/brute-force
throttling, enforced before route handlers run.

**How to apply:**
- Both **server-to-server Bearer** calls (`/api/admin/identity/ai-queue`,
  `/api/admin/identity/[id]/ai-verdict`) and `/api/webhooks/` are EXCLUDED from BOTH
  CSRF and rate limit. If you add another server-triggered or webhook route, it must
  send `Authorization: Bearer` or live under `/api/webhooks/`, else middleware will
  403/429 it. This is the thing most likely to "mysteriously break" a new route.
- CSRF only judges POST/PUT/PATCH/DELETE. Missing Origin+Referer is allowed in
  non-prod (curl/tests/same-process fetch) but **blocked in production**.
- Rate-limit categories by path: auth 20, identity(+upload) 10, venues/suggest 10,
  slots/[id]/apply 30, default 120 (per 60s fixed window). NOTE `/api/admin/identity*`
  review routes are NOT the `identity` category — they fall to `default`.
- middleware strips a spoofed `x-middleware-subrequest` header as a CVE-2025-29927
  mitigation (Next 14.2.5 is in the affected range; real fix is upgrading Next).
- middleware is Edge runtime: keep it to Request/Response + Map + Date, no Node fs.

See [[cross-wiring-status]] for the prior baseline; test baseline is now 359 (was 184).
