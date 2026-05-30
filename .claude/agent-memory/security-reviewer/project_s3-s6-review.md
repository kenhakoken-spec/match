---
name: s3-s6-review
description: Security review outcome for matching-app S3-S6 backend + cross-cutting wiring (2026-05-30)
metadata:
  type: project
---

S3-S6 backend + wiring security review (2026-05-30). Result: **CRITICAL 0 / HIGH 0 / MED 2 / LOW 3** (new findings only; S1/S2 known issues not re-counted). Verdict: safe to proceed to frontend integration + E2E; no new HIGH+ blockers. S7 prod hardening still needs SEC-002 (real LINE verify) and SEC-005/006 (blob).

**New findings (S3-S6):**
- SEC-004 (recurring, MED): still no rate limiting on payments/intent, ratings, _dev-seed, etc. (pre-existing).
- SEC-003 (recurring, MED): still only sameSite=lax, no Origin/Referer check on state-changing POSTs incl. webhooks/admin (pre-existing).
- NO new high/med specific to S3-S6 code itself.

**Corrected earlier mistake — venueUrl is SAFE (do NOT re-flag):**
`setVenueSchema.venueUrl` in src/lib/validation.ts:103-114 uses an anchored regex `/^https?:\/\//i` applied AFTER `.trim()`, so `javascript:`/`data:`/`vbscript:` are rejected. (I initially mis-assumed it used zod `.url()` which would have accepted those schemes — that was wrong; the real code does NOT use `.url()`.) The rendered `<a href={match.venue.venueUrl}>` in src/app/matches/[id]/page.tsx:97 also uses target=_blank rel="noopener noreferrer". No venueUrl XSS.

**Verified GOOD in S3-S6 (do not re-flag without re-reading):**
- IDOR everywhere resolves owner from session sub, never body/URL: match detail (isMatchParticipant, 404 to non-participants), payments (createIntentForSlot/confirmPayment check userId), ratings (rater = session sub, canRate re-checks co-membership server-side), badges/mine (requireUser only).
- All /api/admin/* (matches venue/notify/complete, badges grant/revoke) call requireAdmin() which re-reads role from DB.
- Payment fee is server-computed (computeFee from gender + pastAcceptedCount + slot.feeMale); client never supplies amount. Female/first-male free, non-match no-capture (manual capture on confirm). No card data stored (assertNoCardData guard in stripe-mock). Webhook verifyWebhookSignature fails-closed in real mode (returns false until constructEvent implemented); mock only checks header presence.
- PII minimization: serializers strip lineUserId; notify payloads carry only operational fields; match members = displayName/gender only; venue only exposed after notified (toVenueDTO gate).
- Double-action guards: Match creation idempotent by slotId; notify idempotent (already_notified 409 + listByMatch check); complete blocks non-notified + already-done (no double attendedCount); ratings unique (slotId,raterId,rateeId) in-memory pairKeys + Prisma @@unique + P2002→DuplicateRatingError; badge grant idempotent (created flag).
- Badge premium grant is server pure-function gated (qualifiesForPremium: avg>=4.0, count>=5, attended>=2); admin manual grant snapshots criteria.
- _dev-seed route gated by isMockAuthEnabled() → 404 in production (fail-closed); seedDoneEventForTest no-ops when !isMockDbEnabled.
- No raw SQL injection surface: only one $queryRaw in prisma-repo.ts:297 and it's a Prisma tagged template (parameterized FOR UPDATE). zod on all route bodies; sanitizeText strips C0+DEL. No console.* in src. No dangerouslySetInnerHTML.

**Note on requiresBadge gate:** Slot.requiresBadge exists in schema + SlotDTO but evaluateEligibility (src/lib/domain/eligibility.ts) does NOT check premium/hasPremium, and apply route does not gate on it. If "premium-only slots" is a real product requirement, the limited-slot gate is currently unenforced server-side. Confirm with product whether requiresBadge is meant to be enforced at apply time (potential gap, flagged LOW pending requirement confirmation).

**Why:** Captures which S3-S6 controls were validated-good vs. open, so the next diff review can skip re-deriving and focus on regressions.
**How to apply:** On any diff touching venue rendering / payment amount / admin guards / rating-co-membership / badge criteria, re-check the GOOD item still holds. Re-check SEC-011 got a protocol allowlist before S7. See [[known-scaffold-vulns]] and [[scaffold-stage]].
