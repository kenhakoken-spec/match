---
name: s8-foundation
description: S8 shared foundation (schema/types/domain/repo/serializers) for the 5 spec asks — what was added and the wiring hooks for the next parallel workers
metadata:
  type: project
---

S8 foundation implemented 2026-05-31 (backend-worker, single owner of schema/types/repo-core/domain). Frozen contract: `docs/backend/api-contract-s8-foundation.md`;正典 `docs/01_s8_spec.md` (5 asks: preview-marketing / Haiku AI identity + venue recs / per-event limits / multi-axis rating / no-show ¥5000 penalty).

**Why:** the 5 S8 features all depend on shared schema+types+domain. One worker builds the base so the rest (preview API / 3-axis rating API / no-show billing / venue candidates / Haiku auth / release-mode / frontend) can go parallel without colliding on shared files.

**What was added (all additive / backward-compatible):**
- schema (`prisma/schema.prisma`): enums `Occupation`, `PaymentKind{participation|no_show_penalty}`, `VenueCandidateStatus{suggested|chosen|rejected}`, `IdentityAiVerdict{ok|review|ng}`. Profile += occupation, scoreAgainAvg/scoreTalkAvg/scoreMannerAvg, noShowCount (ratingAvg now = multi-axis overall). Rating += scoreAgain/scoreTalk/scoreManner + noShowReport; **kept `score Int @default(0)` for backward compat** (rating-repo/rating-service still read/write single `score`; 3-axis API should put overall into `score`). Payment += `type PaymentKind @default(participation)`. IdentityVerification += aiVerdict/aiReason/aiCheckedAt. NEW model `VenueCandidate` (slotId/name/url/tabelogScore/googleScore/fitScore/area/status/suggestedBy). Limited events (ask 3) need NO schema change (existing Slot.minAge/maxAge/requiresBadge).
- domain (pure, tested): `aggregateMultiAxis` in `domain/rating.ts` (again/talk/manner/overall/count; overall = mean of ALL axis scores over count*3, rounded from raw to avoid compounding); `domain/noshow.ts` `isNoShowConfirmed(reportCount, threshold=2)` (boundary 1=false/2=true, defensive non-int/neg/NaN→false); `penaltyAmountJpy()`=5000 + `NO_SHOW_PENALTY_JPY` in `domain/payment.ts`; `qualifiesForPremiumByOverall(overall,count,attended)` thin wrapper in `domain/badge.ts`. All re-exported from `domain/index.ts`. Existing `aggregateRatings` (single) untouched.
- types (`src/lib/types.ts`): `Occupation`, `PaymentKind`, `IdentityAiVerdict`, `VenueCandidateStatus`, `MultiAxisRatings`, `VenueCandidateDTO`, and PII-stripped preview DTOs `PublicSlotDTO` / `PublicMemberDTO` / `PublicSlotDetailDTO` + readonly enum tuples.
- serializers (`src/lib/serializers.ts`): `toAgeBand(birthdate)`→"20代後半" etc (no exact dob/age), `toPublicSlotDTO`, `toPublicMemberDTO` (the PII gate — refuses name/displayName/photoUrl/lineUserId/exact dob), `toMultiAxisRatings`, `toVenueCandidateDTO`.
- repo: ProfilesRepo += `setMultiAxisSummary` / `incrementNoShow`; IdentitiesRepo += `setAiVerdict` (records verdict only, does NOT change status — verdict and approve are separated); NEW `VenueCandidatesRepo` (listBySlot sorted fitScore desc nulls-last then createdAt asc / findById / create / setStatus). Implemented in BOTH memory.ts and prisma-repo.ts (Prisma marked 実DB未検証). memory.ts seed extended: 水/金/土 19:30 slots in ebisu/ikebukuro/ginza (誰でもOK中心 +20代限定1 +バッジ限定1), occupations on seed profiles, 3 VenueCandidate rows on seed-slot-matched.

**Wiring hooks for next workers:**
- Preview API (ask 1): build GET endpoints that return `toPublicSlotDTO`/`toPublicMemberDTO`. Members come from `applications.listActiveBySlot(slotId)` → `profiles.findByUserId` → `getBadgeRepo().hasPremium(userId)`. NEVER serialize raw Profile/User to unauth.
- 3-axis rating API (ask 4): write scoreAgain/Talk/Manner + set `score`=round(overall); aggregate via `aggregateMultiAxis(receivedMultiAxisScores)` then `profiles.setMultiAxisSummary(...)` then badge `evaluateAndGrantOnRating` (badge judges on ratingAvg=overall, already correct). rating-repo currently stores single `score` only — extend its RatingEntity + receivedScores to carry the 3 axes.
- No-show billing (ask 5): count Rating.noShowReport per ratee in a slot → `isNoShowConfirmed(count)` → on true: `profiles.incrementNoShow` + create Payment(type=no_show_penalty, amount=penaltyAmountJpy()) + Stripe. Hook into the same post-event/rating flow.
- Venue recs (ask 2): `venueCandidates.create(...)` (suggestedBy="system" for AI), notify admin; admin picks → `setStatus(id,"chosen")` → copy into Match.venue via existing setVenue.
- Haiku auth (ask 2): on identity submit, run Haiku (mock when unconnected) → `identities.setAiVerdict(id, verdict, reason)`; if verdict==="ok" auto-call existing `approve`, else leave pending for admin. Audit reason is mandatory (age-verification liability).
- Release-mode (ask 3): `RELEASE_MODE=waiting|open` — NOW implemented (`releaseMode()` in env.ts + `isWaiting()`/`isOpen()` in release.ts). Preview API (ask 1) also implemented. See [[s8-public-preview]]. Waiting-screen UI still frontend's.

**Gates (re-verify fresh):** prisma validate in /tmp ([[schema-validation]]) → valid; `rm -f tsconfig.tsbuildinfo && tsc --noEmit` → rc0; `npm run test` → 214 PASS (was 184 baseline +30 S8: multi-axis 5, no-show 11, penalty 3, byOverall 6, others). FAIL conditions include touching src/app pages — S8 base touched ZERO frontend files. Related: [[cross-wiring-status]], [[tsc-cache-and-ownership]].
