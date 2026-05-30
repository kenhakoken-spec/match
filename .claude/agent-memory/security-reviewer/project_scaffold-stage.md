---
name: scaffold-stage
description: matching-app architecture and security-relevant layout as of 2026-05-30 (S1+S2 implemented)
metadata:
  type: project
---

As of 2026-05-30, matching-app has S1 (auth/identity/profile) and S2 (slots/applications) implemented. Stack: Next.js 14.2.5 (App Router) + TypeScript + Prisma (Postgres/Neon) + zod + LIFF. Domain:合コン型 3対3 group matching on LINE/LIFF. Flow: LINE login -> identity verification (admin manual review) -> profile -> apply to Slots (capacity 3/gender) -> match. No chat. Stripe payments are S4 (not built yet).

**Security-relevant architecture (verify before relying on):**
- Session: `src/lib/auth/session.ts` (JWT-like signed cookie, payload = {sub=userId, role, iat, exp}, no PII). Set via `src/lib/auth/guard.ts`.
- Auth guard: `src/lib/auth/guard.ts` — owner resolution from session, admin re-check.
- PII exit gate: `src/lib/serializers.ts` — claims to be the single place that strips `lineUserId` from DTOs.
- Repo layer: `src/lib/repo/{types,memory,prisma-repo}.ts` (memory repo for tests/dev, prisma for prod). `src/lib/slot-service.ts` = apply/cancel/capacity logic.
- Domain: `src/lib/domain/{age,eligibility}.ts` — server-side eligibility gates.
- API routes: `src/app/api/**` (auth/{line,dev-login,logout}, identity, profile, me, slots, applications, admin/{identity,slots}).
- Env files present on disk: `.env`, `.env.local`, `.env.example`, plus `.env.production` is git-tracked-eligible (NOT ignored — see [[known-scaffold-vulns]]).

**Why:** First S1+S2 security review. Knowing the layer boundaries (where owner-resolution and the PII gate live) lets future reviews jump straight to the right file.

**How to apply:** When a task cites a file/route, verify it exists first. The PII gate and owner-resolution are the two highest-value invariants to re-check on every auth/profile/identity diff. See [[known-scaffold-vulns]].
