---
name: s8-review
description: 2026-05-31 S8 security review (Haiku auth, no-show penalty, public preview PII, admin venue authz, restricted slots) — CRIT0/HIGH0; all 5 focus areas verified-good
metadata:
  type: project
---

S8 review of rendez (合コン型グループマッチング). Canonical spec: docs/01_s8_spec.md. Tracker: docs/backend/security-open-issues.md.

**Result: CRITICAL 0 / HIGH 0 / MED 2 / LOW 1 (recurring S1-S6 items, no NEW code-specific high+).** Verdict: S8 backend is safe to proceed; the 5 focus areas are all correctly implemented.

**Why this review mattered:** S8 added Haiku AI age-verification, ¥5000 no-show penalty, unauthenticated public preview, admin venue workflow, restricted slots — all money/PII/regulatory-sensitive. All five came out clean on close reading.

**CORRECTION — discard my earlier draft (2026-05-30) of this memory.** It listed a CRITICAL "raw Prisma PII leak on public/slots/[id]" and a HIGH "no-show double-charge / no idempotencyKey". BOTH WERE WRONG — written before I read ground truth, then refuted:
- public/slots/[id]/route.ts returns `PublicSlotDetailDTO` built from `toPublicSlotDTO` + `toPublicMemberDTO` ONLY (route lines 36-48). There is NO `json(slot)` raw return. grep across src/app for raw NextResponse.json(obj) returns ONLY dev-login + apply (both intentional, no PII). The "CRITICAL leak" did not exist.
- Payment model HAS `@@unique([slotId, userId, type])` (schema.prisma:147) — penalty dedup IS enforced. No idempotencyKey field exists or is needed; (slot,user,type) is the idempotency key. submitRating calls evaluateNoShowForRatee ONCE (rating-service.ts:90); it does NOT write a separate Payment row. The "double-charge HIGH" did not exist.
Lesson for next time: do NOT draft findings before reading the actual files; sandboxed Read returns empty in this WSL env so use `nl -ba` via Bash dangerouslyDisableSandbox. See [[env-bash-sandbox]].

**Verified-GOOD controls (file:line — do not re-flag without NEW evidence):**
1. Haiku AI auth safety valve (the core regulatory control):
   - Auto-approve gate: identity-service.ts:70-74 — approves ONLY if `verdict==="ok" && adult`, where `adult = isAdult(input.birthdate, now)` recomputed SERVER-SIDE. AI=ok but <18 → falls through to line 77-88 explicit reject. AI can never bypass the age gate.
   - Manual approve gate: approveIdentity (identity-service.ts:107-124) re-checks `iv.birthdate` with isAdult; <18 → reject regardless of admin action / AI. Admin route (admin/identity/[id]/approve/route.ts:20) calls approveIdentity (the wrapper), NOT raw repo.approve.
   - Audit: setAiVerdict(userId, verdict, reason) persisted (identity-service.ts:66) BEFORE any approval branch; schema has aiVerdict/aiReason/aiCheckedAt (schema.prisma:70-72).
   - Client cannot forge approval: POST /api/identity (identity/route.ts:18) resolves userId from session (requireUser), birthdate from validated body is ALSO re-checked server-side. haiku-verify.ts fails closed (realVerify throws HaikuVerificationUnavailableError in prod; submitIdentity catch→verdict="review", never auto-approves on AI failure).
2. No-show ¥5000 penalty:
   - ≥2 distinct accusers, server-side: domain/noshow.isNoShowConfirmed (>=2); noshow-service.countParticipantNoShowReports counts raterIds from ratingRepo.noShowReporterIds, filters to current accepted-participant set AND excludes self (noshow-service.ts:72-76).
   - No IDOR: accuser = session sub (ratings/route.ts:20,27 — body rater ignored); ratee must be accepted participant (rating-service.ts:64-68). countParticipant... resolves the charged party from the server-side accepted set, never from request body.
   - Idempotency: chargeNoShowPenalty (payment-service.ts:269) checks findBySlotUserAndType(slot,ratee,"no_show_penalty") first; DB @@unique([slotId,userId,type]) is the backstop (PrismaPaymentRepo.create catches P2002→returns existing, payment-repo.ts:148-153). noShowCount++ only when penalty.charged (noshow-service.ts:113-116).
3. Public preview PII: serializers.toPublicMemberDTO emits ONLY ageBand/gender/occupation/ratings/hasPremiumBadge — never name/displayName/photoUrl/lineUserId/exact dob (serializers.ts:312-324). toAgeBand returns band string only. Both public routes go through these serializers; no raw Profile/User path.
4. Admin authz: ALL admin venue routes call requireAdmin() at top (admin/venues/route.ts:17, [id]/choose:21, [id]/reject:19, suggest:20). requireAdmin re-reads role from DB (guard.ts:28-34), not cookie claim. Note: venue routes are [id] (candidateId), NOT [slotId].
5. Restricted slots: apply route (slots/[id]/apply/route.ts:37) applicant = session sub (me.id); body never read for identity (grep body.user_id = ZERO repo-wide). buildSlotContext (slot-service.ts:32,38,42) feeds REAL hasPremium(userId)+profile.birthdate into evaluateEligibility which re-checks age range + requiresBadge (eligibility.ts:49-62). Rating scores zod int 1..5 (rating-validation.ts:10-14).

**MED/LOW carried from prior reviews (recurring, not S8-specific):**
- MED SEC-003: state-changing POSTs only sameSite=lax, no Origin/Referer check (includes new admin venue + ratings POSTs). MED SEC-004: no rate limiting (now also on /api/ratings, /api/identity AI calls, admin venue suggest). Both pre-existing, tracked. LOW: still no audit log table (SEC-009).
- Minor non-security note: public DTO returns exact `datetimeStart` ISO timestamp (spec wanted day/night band) — over-disclosure but NOT prohibited PII; product/design call, not a security finding.

tsc -p tsconfig.json: EXIT 0 (clean). Did NOT run dev/build/curl (forbidden — shared .next). Allowed tools used: tsc, grep/nl via Bash, Read.
