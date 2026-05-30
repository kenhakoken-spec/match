---
name: known-scaffold-vulns
description: Findings and verified-good security controls in matching-app S1+S2 as of 2026-05-30
metadata:
  type: project
---

Results of the first S1+S2 security review (2026-05-30). On future diffs touching these areas, re-check whether the good controls persist and whether the open issues were fixed.

**Verified GOOD (do not re-flag without re-reading — these were done right):**
- Session (`src/lib/auth/session.ts`): AES-256-GCM authenticated encryption; GCM authTag = tamper detection (no `!==` compare problem); cookie is httpOnly + secure(prod) + sameSite=lax + 1h TTL; payload has no PII (sub/role/iat/exp only). Key from `AUTH_JWT_SECRET`, throws in non-mock if absent.
- IDOR: every owner-scoped route resolves the owner from `requireUser()` session sub, never from body/URL userId. cancel uses `cancelOwn(appId, sessionUserId)` with an internal owner check. Confirmed across profile/identity/applications/slots routes.
- admin: `requireAdmin()` re-reads the user from repo and checks `role==="admin"` server-side (not from the cookie claim alone). All `/api/admin/*` routes call it.
- PII exit gate: `serializers.ts` `toMeUser`/`toProfileDTO` never emit lineUserId. No `console.*` anywhere in src. notify payload excludes PII.
- Identity image deletion: approve AND reject both set `blobRef=null` + `imageDeletedAt=now` in both memory and prisma repos.
- Apply gate re-validated server-side: route calls `evaluateEligibility` (pure) then `applyAtomic` (atomic re-check of status/dup/capacity). Client canApply is ignored. Prisma path uses `$transaction` + `SELECT ... FOR UPDATE` + UNIQUE(slotId,userId).
- schema.prisma `Application` HAS `@@unique([slotId, userId])` (line ~321) — double-apply IS constrained. (Earlier memory wrongly said it was missing.)
- `.gitignore`: `.env` + `.env.*` (with `!.env.example`) — `git check-ignore` confirms `.env`, `.env.local`, `.env.production` are ALL ignored. No secrets tracked. (Earlier memory wrongly claimed .env.production was committed.)
- next@14.2.5 (NOT 14.1.0) — but still < 14.2.25, so CVE-2025-29927 applies in theory; mitigated because there is no `middleware.ts` (auth is per-route, not middleware-based) and Vercel blocks the header.

**OPEN issues found (priority order):**
- HIGH: `dev-login` route is gated only by `isMockAuth()` = `MOCK_AUTH !== "0"`. Default/unset = mock ON, so if prod forgets to set `MOCK_AUTH=0`, `/api/auth/dev-login` lets anyone mint an admin session via `{role:"admin"}`. Fail-open default. Same fail-open default in env.ts/session.ts/line-mock (mock unless explicitly "0").
- `validation.ts` `sanitizeText` regex: VERIFIED CORRECT via `od -c` on line 13 = `[\0-037177]` = `\x00-\x1f` + `\x7f` (octal 037=31, 177=127). Strips all C0 controls + DEL as intended. (cat -A renders it ambiguously — trust od -c. This is NOT a finding; do not re-flag.) It does not strip `<`/`>`, which is fine: XSS defense is React JSX auto-escaping on render. Only becomes a risk if a value is ever put in dangerouslySetInnerHTML or a non-HTML sink.
- MEDIUM: admin identity queue (`/api/admin/identity?status=approved`) returns `userId` to admin — acceptable for admin, but no PII beyond that; fine. (Noted, not a finding.)
- LOW: error `handle()` returns generic 500 (good); no logging/monitoring at all (OWASP A09) — acceptable for MVP but note for S7.

**Why:** Avoids re-deriving the whole surface each review. The GOOD list prevents false-positive churn; the OPEN list is what to verify got fixed.

**How to apply:** On auth/session/validation/admin/identity diffs, confirm the GOOD controls still hold and check if the OPEN issues are addressed. The `validation.ts` field referenced in earlier tasks ("applySchema with client eligibility") does NOT exist — there is no such schema; apply trusts only server-side evaluateEligibility. See [[scaffold-stage]].
