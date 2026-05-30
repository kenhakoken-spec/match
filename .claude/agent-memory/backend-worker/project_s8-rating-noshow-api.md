---
name: s8-rating-noshow-api
description: S8 3-axis rating API + no-show ¥5000 penalty wiring (builds on s8-foundation) — files, idempotency design, verification
metadata:
  type: project
---

# S8 — 3-axis rating API + no-show penalty (built on [[s8-foundation]])

Wired the multi-axis rating endpoint and the ドタキャン罰金 flow on top of the frozen foundation.

## Files (owned by this slice)
- `src/lib/rating-validation.ts` — submitRatingSchema now 3-axis: {slotId,rateeId,scoreAgain,scoreTalk,scoreManner,comment?,noShowReport?}. Dropped old single `score` from the body (server derives it).
- `src/lib/rating-service.ts` — submitRating takes 3 axes; saves back-compat score=round(overall); writes `profiles.setMultiAxisSummary`; calls `evaluateAndGrantOnRating`; if noShowReport → `evaluateNoShowForRatee`. getReceivedSummary now returns {again,talk,manner,overall,count, avg(=overall)}.
- `src/lib/repo/rating-repo.ts` — RatingEntity/CreateRatingInput gained scoreAgain/scoreTalk/scoreManner/noShowReport (score kept). Added receivedMultiAxis/getMultiAxisSummary/noShowReporterIds/countNoShowReports/rateesWithNoShowReports. recordRating returns rateeMultiAxis too.
- `src/lib/noshow-service.ts` — NEW. evaluateNoShowForRatee(slot,ratee): counts participant-only, self-report-excluded reports → isNoShowConfirmed(>=2) → chargeNoShowPenalty + incrementNoShow.
- `src/lib/payment-service.ts` — added chargeNoShowPenalty(ratee,slot): ¥5000, type=no_show_penalty, succeeded (capture immediately), idempotent.
- `src/lib/repo/payment-repo.ts` — PaymentEntity/CreatePaymentInput gained `type: PaymentKind` (default participation = back-compat). Added findBySlotUserAndType.
- routes: `src/app/api/ratings/route.ts` (3-axis body, returns {rating,summary,multiAxis,noShow}), `received/summary/route.ts` (multi-axis).

## no-show idempotency (the key design)
The **existence of a (slotId, ratee, no_show_penalty) Payment** is the single idempotency key. chargeNoShowPenalty returns charged=false if it already exists; noshow-service only does incrementNoShow when charged=true. So a 3rd/4th report after confirmation never double-charges nor double-counts noShowCount. Participant-only + self-report-excluded counting prevents false penalties.

## Verification (parallel-breakage caveat — see [[feedback-tsc-cache-and-ownership]])
Clean foreground baseline before edits: 214 PASS, tsc rc0.
My slice proven in isolation (full-suite tsc was rc2 ONLY from other workers' WIP: haiku-verify*, admin/venues*, public/slots*, identity/route, venue-service*, release* — none reference my files; grep of tsc errors for my files = empty):
- backend-scoped tsconfig (`/tmp/tsconfig.backend.json`, my files only) → rc0, 0 errors (verified fresh after `rm -f tsconfig.tsbuildinfo`).
- my 3 new test files: rating-service.test 11, noshow-service.test 7, payment-noshow.test 4 = **22 PASS**.
- baseline-12 + my-3 combined run: 235/236 (the 1 fail = match-service.test "二重通知" which PASSES alone = pre-existing cross-file global-notifications pollution, NOT mine — match-service is not my file).

## Test-isolation gotcha (cost me 4 initial failures)
`seedDoneEventForTest()` is idempotent on the done-slot existing in `__mappStore`; my tests mutate profiles (incrementNoShow) so without resetting the SHARED store between tests, noShowCount accumulated / seed was skipped. Fix: `beforeEach` must call `__resetMemoryStore()` (from repo/memory) FIRST, then reset `__mappRatingStore` + `__resetPaymentStore()`, THEN `seedDoneEventForTest()` (now re-seeds fresh since slot is gone).
