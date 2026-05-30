---
name: cross-wiring-status
description: Status of the cross-cutting wiring task (rating→profile aggregate→badge, done→attended++) — what was edited and how to re-verify
metadata:
  type: project
---

Cross-cutting wiring (docs/backend/wiring-task.md §1-5) implemented 2026-05-30. Connects what S4/S5/S6 left unwired because each kept the "don't touch shared files" contract.

**Why:** rating-service had a no-op `applyRateeAggregateToProfile`; ProfilesRepo had no write API for ratingAvg/ratingCount/attendedCount; no route set Slot→done. So evaluate→aggregate→badge and done→attended++ never fired in a real flow.

**5 edits (all minimal, additive):**
1. `src/lib/repo/types.ts` — `ProfilesRepo` gained `setRatingSummary(userId,{avg,count})` and `incrementAttended(userId)`, both `Promise<ProfileEntity|null>`.
2. `src/lib/repo/memory.ts` — `MemoryProfilesRepo` both methods, following the `const s = store();` + null-if-missing + `updatedAt` idiom (placed after `setPhotoUrl`).
3. `src/lib/repo/prisma-repo.ts` — `PrismaProfilesRepo` both methods with 実DB未検証 comments; `incrementAttended` uses `{ attendedCount: { increment: 1 } }`.
4. `src/lib/rating-service.ts` — added `import { evaluateAndGrantOnRating } from "@/lib/badge-service";` and, in `submitRating` success path after `recordRating` / before return: `await repo.profiles.setRatingSummary(rateeId,{avg,count})` THEN `await evaluateAndGrantOnRating(rateeId)` (order: aggregate first, badge second).
5. NEW `src/app/api/admin/matches/[id]/complete/route.ts` — POST requireAdmin; 404 if no match; 409 if canceled / not notified / slot already done; then `slots.setStatus(slotId,"done")` + `incrementAttended` for every accepted in `listActiveBySlot`; returns `{ slotStatus:"done", attendedIncremented:<n> }`. Idempotency guard on already-done prevents double-counting.

**How to apply / re-verify:** gates run via `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` and `npm run test`; outputs were written to /tmp/tsc2.txt and /tmp/test_out.txt during the session. If resuming, re-run both (tsc must be rc0 over the whole tree; vitest baseline was **184** (re-counted 2026-05-31; an earlier note said 188 but the actual it-block count is 184) — must stay all-PASS; S8 foundation later raised it to 214). No new tests were added (optional per spec). Dev-shogun should curl-verify: login as a member of a done slot, POST `/api/ratings` enough 5-scores to clear premium threshold → GET `/api/badges/mine` shows premium + Profile ratingAvg/ratingCount updated; and POST `/api/admin/matches/[id]/complete` on a notified match → attendedIncremented==6 and Slot becomes done (then ratings/pending lists it).

Related: [[no-done-route-seed-hack]] (prior S5 done-slot seed hack is now superseded by the real complete route), [[feedback-tsc-cache-and-ownership]].
