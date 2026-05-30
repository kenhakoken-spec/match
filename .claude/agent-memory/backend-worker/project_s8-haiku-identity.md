---
name: s8-haiku-identity
description: S8 要望2 AI(Haiku) identity first-pass verdict — what was wired (verify→record→auto-approve), the 18+ safeguard, and the real-Haiku swap point
metadata:
  type: project
---

S8 要望2 (AI一次判定) implemented 2026-05-31 (backend-worker). 正典 `docs/01_s8_spec.md`
要望2; foundation already had `IdentityVerification.aiVerdict/aiReason/aiCheckedAt`
+ `identities.setAiVerdict` (records verdict only, does NOT change status — see [[s8-foundation]]).

**Why:** age-verification liability is heavy for a dating-adjacent app, so the AI
first-pass auto-approves only the obvious-OK and leaves grey/under-age for ops, and
the verdict reasoning MUST be recorded for audit.

**Files (mine):**
- NEW `src/lib/haiku-verify.ts`: `verifyIdentityImage(input)` → `{verdict: ok|review|ng, reason}`.
  Decision separated from approval. `isMockAiEnabled()` fail-closed (prod always false →
  real; non-prod default ON, `MOCK_AI=0` to disable — same shape as env.ts mockFlag).
  Deterministic mock (no RNG): under-18 (isAdult) → **ng**; blobRef contains
  blurry/unreadable/noface → **review**; else **ok**. `reason` is an audit summary only
  — NEVER contains blobRef/PII/secret. Real Haiku is a `realVerify()` stub that THROWS
  `HaikuVerificationUnavailableError(503)` (no silent mock fallback in prod); TODO there
  documents the swap: Anthropic Messages API (claude-haiku), key via `env` (not hardcoded),
  structured age/face/readability prompt → normalize to ok|review|ng, errors fail safe to review.
- EDIT `src/app/api/identity/route.ts` POST: after `submit`, look up profile (need birthdate),
  run `verifyIdentityImage` → `setAiVerdict(iv.id, verdict, reason)` (audit). Auto-approve
  ONLY if `verdict==="ok" && isAdult(profile.birthdate, new Date())` — the **double 18+
  safeguard**: AI ok but under-18 is never approved. Auto-approve calls existing
  `approve(iv.id, "ai")` (reviewedBy="ai") + `sendNotification(identity_approved)`.
  review/ng stay pending (ops confirm; ng → ops reject). No profile (birthdate unknown)
  → skip AI, stay pending. Response adds `aiVerdict`.

**Wiring facts to reuse:** `notify-mock` exports `sendNotification` (payload-bearing) and
`logNotificationMock` (legacy {userId,type}) — NOT `notify`. `isAdult` takes TWO args
`(birthdate, now)`. `approve` already nulls blobRef + sets imageDeletedAt (PII delete).

**Tests:** NEW `haiku-verify.test.ts` (12: verdict branches, 18 boundary, determinism,
reason-no-secret, prod-throw/503) + `haiku-verify-flow.test.ts` (6: verify→record→
auto-approve wiring, review/ng stay pending, the 18+ safeguard, no-profile). Flow test
uses `new MemoryRepo()` directly to dodge the getRepo singleton trap — see
[[feedback-repo-singleton-vitest]].

**Gates (2026-05-31):** my-surface tsc rc0 (temp `/tmp/tsconfig.haiku.json` extending repo
tsconfig, excluding sibling broken `admin/venues/venues-route.test.ts`); shared `tsc
--noEmit` rc2 BUT the ONLY error file is that sibling venue-worker test (Request vs
NextRequest), not mine. Full suite: 289 passed / 8 failed — all 8 in the sibling venues
file (fails 18/20 even in isolation = its own bug, independent of me). My 18 AI tests:
all PASS. Related: [[s8-foundation]], [[cross-wiring-status]].
