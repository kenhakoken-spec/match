---
name: line-jwks-verify
description: LINE id_token verification switched from verify API to local JWKS signature check (jose) to fix prod 401 "id token expired"
metadata:
  type: project
---

LINE login id_token verification now uses **local JWKS signature verification (jose)**, NOT the LINE verify API.

**Why:** In production, LINE's verify API (`https://api.line.me/oauth2/v2.1/verify`) returned `400 / invalid_request / "id token expired"` → login 401'd. LIFF `getIDToken()` tokens have a short exp; by the time they reach the server the verify API's strict exp check rejects them.

**How to apply:**
- `src/lib/auth/line-verify.ts` → `verifyLineIdTokenViaApi(idToken)` (name/signature unchanged for back-compat, but it no longer calls any API) uses `jose` `createRemoteJWKSet(https://api.line.me/oauth2/v2.1/certs)` + `jwtVerify(token, JWKS, { issuer:"https://access.line.me", audience: LINE_LOGIN_CHANNEL_ID, clockTolerance: "2 h" })`.
- **Signature/iss/aud stay strict** (anti-spoofing). Only exp is loosened via `clockTolerance` (currently `"2 h"` = 7200s) to absorb short-lived LIFF token expiry. If exp issues recur, raise CLOCK_TOLERANCE — do NOT remove signature checks.
- `LINE_LOGIN_CHANNEL_ID` unset still throws `LineVerificationUnavailableError` (→ 503 via http.ts) = fail-close. Bad signature/iss/aud → null → route 401.
- JWKS verify is side-effect-free → naturally idempotent (diagnostic page double-calls are safe).
- Route `src/app/api/auth/line/route.ts` and dispatcher `line-mock.ts` (verifyLineIdToken→verifyLineIdTokenReal→dynamic import) were NOT changed.
- Tests: `line-verify.test.ts` mocks `jose` (not fetch); the mock's `jwtVerify` faithfully re-checks issuer/audience and throws on mismatch, proving channelId→audience wiring. See [[feedback_vitest-route-testing]].

`jose` added to deps (^6.2.3). Full vitest suite is now **389 PASS / 27 files** (grew from the 214 noted in [[project_s8-foundation]] as parallel workers added tests).
