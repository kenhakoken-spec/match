---
name: task-s6-ui
description: S6 優良バッジ UI (mypage badge+progress / admin A-10 grant+revoke) — DONE; owned files, contract shapes, reused primitives
metadata:
  type: project
---

# S6 優良バッジ UI (DONE 2026-05-30)

優良バッジ(premium): mypage に取得済バッジ + 未取得時の事実進捗 / admin A-10 付与状況
一覧 + 手動 grant/revoke。S1〜S5 の design system 上に構築。

## Reused primitives (already existed — DON'T recreate)
- `PremiumBadge` ALREADY EXISTS in src/components/ui/StatusPill.tsx =
  `<StatusPill tone="trust" glyph="◆">優良</StatusPill>` — exactly design-system §4.7E
  (trust 系 pill + ◆, no gold/gradient). Just import + render it. Same file has
  `VerifiedBadge` (verified ✓ 本人確認済) and `ConditionChip`.
- StatusPill takes {tone, glyph, children} — tone "trust" maps to trust.100 bg /
  trust.300 border / trust.600 text. glyph is the shape cue (color-only is banned §1.6).
- ApiCallError is in src/app/_lib/api.ts (exports `.code`, `.status`). api-s3.ts is the
  reference pattern for client fetch helpers (getJson/postJson + `// FALLBACK` dummies).

## FROZEN S6 contract — verified against src/lib/badge-types.ts + real routes (NOT the .md alone)
The api-contract-s6.md .md is a guide; backend was already implemented & MATCHED the .md
this time (unlike S3). Real shapes (src/lib/badge-types.ts + src/app/api/badges/**):
- GET /api/badges/mine → `{ badges: BadgeDTO[], progress: BadgeProgressDTO }` (NOT wrapped
  in {items}; the body IS the object). BadgeDTO={type:"premium", grantedAt:ISO}.
  BadgeProgressDTO={hasPremium, ratingAvg, ratingCount, attendedCount,
  remaining:{ratingAvg,ratingCount,attendedCount}}. remaining = max(0, criteria-current).
- GET /api/admin/badges → `{ items: AdminBadgeRowDTO[] }` (grantedAt desc).
  AdminBadgeRowDTO={userId(cuid), displayName|null, type, grantedAt, grantedBy} where
  grantedBy="system"(自動) | admin userId(手動). NO lineUserId (PII-minimal).
- POST /api/admin/badges/grant {userId} → BadgeMutationResultDTO{userId,type,outcome,badge}.
  outcome ∈ granted|already|revoked|absent. grant 404s `user_not_found` if user missing;
  非admin → 403; 既保有 → outcome=already (idempotent, still 200).
- POST /api/admin/badges/revoke {userId} → same DTO; 元々未保有 → outcome=absent.
- premium criteria (§0): ratingAvg≥4.0 AND ratingCount≥5 AND attendedCount≥2.

## Files I own (created/edited)
- src/app/_lib/api-badge.ts (NEW): fetch helpers + re-declared S6 DTOs (byte-identical to
  badge-types.ts) + PREMIUM_CRITERIA const + `// FALLBACK` dummies. Exports fetchMyBadges,
  fetchAdminBadges, grantBadge, revokeBadge + BadgeMutationOutcome. FALLBACK fetchMyBadges =
  NOT-yet-premium w/ partial progress (renders the more interesting 進捗 path for review).
- src/components/badges/BadgeProgress.tsx (NEW): 未取得進捗カード. DotMeter (●達成/○残り,
  trust.600/line.200), rows = 高評価での参加(attended/2) / 受け取った評価(count/5) /
  平均評価(avg, no dots — continuous). 事実のみ・FOMO無し (§4.7E/§8). Takes optional
  `"data-testid"` forwarded to root (the component doesn't ...spread — explicit prop).
- src/app/(tabs)/mypage/page.tsx (EDIT, S6-only owns this file): added a 2nd state `badges`
  fetched separately from getMe so it NEVER blocks the existing page (load fail → just omit).
  PremiumBadge next to VerifiedBadge by the name (testid badge-premium on a wrapping span,
  since PremiumBadge takes no props). BadgeProgress section rendered ONLY when
  `badges && !hasPremium`. Existing S1 mypage untouched otherwise.
- src/app/admin/badges/page.tsx (NEW, A-10): grant form (#grant-user-id input + badge-grant
  button, disabled until non-empty), notice banner (ok=secondary green / warn — NEVER red-
  blame per §4.7), list (admin-badge-list on both empty-state div AND populated <ul> — only
  one renders), each row has badge-revoke button + GrantSource (◇自動/✎手動). Uses raw
  Tailwind tokens (admin is PC, design-system §7) not the mobile Button (full-width).
- src/app/admin/layout.tsx (EDIT): replaced dead "評価 / バッジ"→/admin/slots nav entry with
  "バッジ付与状況"→/admin/badges. Other nav entries intact.

## testids (5, all verified present exactly: grep count)
badge-premium(1), badge-progress(1), admin-badge-list(2 = empty+populated, 1 at runtime),
badge-grant(1), badge-revoke(1).

## Verification (all PASS)
`rm -f tsconfig.tsbuildinfo && tsc --noEmit` → TSC_FULL_EXIT=0 (whole project clean; my S6
files had 0 errors via targeted grep). `npm run test` → 188 passed / 11 files (count
maintained; badge-route.test.ts is backend-owned, 15 tests green). Ran tsc+test+grep as ONE
backgrounded script writing a verdict file — see [[feedback-env-wsl]] (channel stalled hard
mid-task; blind re-runs are useless when results don't render). NO dev/build/curl/Playwright
(forbidden this task — .next conflict). NO screenshots.

## Gotcha: cross-frontend tsc is a MOVING TARGET
First tsc run showed 5 errors in S4 files I don't own (api-payment.ts / payment/[slotId] —
missing apiGet/apiPost/ApiError/FeeReason exports). A later run was TSC_FULL_EXIT=0 — another
worker fixed them between my runs. Lesson: when tsc shows errors, grep for YOUR files before
worrying; transient errors from other in-flight frontends resolve on their own.
