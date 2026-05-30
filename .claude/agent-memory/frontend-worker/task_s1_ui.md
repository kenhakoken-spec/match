---
name: task-s1-ui
description: S1 UI implementation task for matching-app — scope, screens, completion criteria, FAIL conditions
metadata:
  type: project
---

# S1 UI Implementation Task (in progress)

Stack: Next.js 14 App Router + TS + Tailwind. Scaffold done. Design tokens in tailwind.config.ts. Lv1 (syntax) already PASS — must not break.

**Why:** Frontend-worker owns S1 screens; backend may be incomplete so fetch must fall back to dummy data shaped per API contract.
**How to apply:** Implement only frontend-owned files (NOT src/lib, src/app/api, prisma — those are backend-owned per contract §5). Mobile portrait, inside app-shell.

## MUST-READ docs before coding
- /mnt/c/tools/matching-app/docs/design/wireframes.md (layouts)
- /mnt/c/tools/matching-app/docs/design/screen-flow.md (transitions)
- /mnt/c/tools/matching-app/docs/design/design-system.md (tokens/rules §0/§4/§4.7/§8 — warm editorial, NO AI-feel, mobile portrait)
- /mnt/c/tools/matching-app/docs/backend/api-contract-s1.md (§2 endpoints, types; §5 file ownership)
- /mnt/c/tools/matching-app/tailwind.config.ts (colors/font/radius tokens — USE THESE)

## Screens to build (mobile portrait, inside app-shell)
- U-00 Login (mock: "LINEではじめる" → POST /api/auth/dev-login)
- U-01 Onboarding + terms consent (consent checkbox REQUIRED to enable next)
- U-12 Identity doc upload (docType select + file + PII text "確認後に削除します/公開されません" REQUIRED) → upload → identity submit
- U-13 Identity status pending/approved/rejected (rejected: show reason + resubmit; NOT red error, use state/warn)
- U-02 Profile register (photo/displayName/gender/birthdate/areas(multi)/bio). UNDER-18 blocked client-side + server 400 display.
- U-02b Photo guide (optional)
- U-03 Profile edit
- U-10 MyPage (profile summary + identity verify badge, S1 scope)
- Bottom tab x3 framework (枠をさがす/応募状況/マイページ; content S2+ but nav present)
- Loading/error/empty states (U-E)

## Design rules (STRICT — design-system.md §0/§4/§4.7/§8)
- State NOT by color alone — label + shape together.
- Tap target 44pt+, button height 48px+.
- NO promo tone, NO emoji overload, NO purple gradient.
- Identity verify = quiet; rejection = not blaming.

## Completion criteria (run & paste real output in report)
1. `cd /mnt/c/tools/matching-app && npm run build` → exit0. `./node_modules/.bin/tsc --noEmit` → rc0.
2. Screenshots via Playwright: `npm run dev`, viewport 375x812 (mobile portrait), capture U-00/U-01/U-12/U-13/U-02/U-10, save files, list absolute paths in report. Not blank (real forms/text visible).
3. fetch failure → fallback to dummy data shaped per contract (comment it). DOM/text/design must be production-intended.

## FAIL conditions
design-system violation (mass-SaaS/AI-feel/emoji overload/purple gradient) / state by color only / no 18+ control / no PII text / blank SS / build or tsc fail / breaking existing Lv1 / unauthorized edit of backend-owned files (§5: src/lib, src/app/api, prisma).

## Browser cleanup (BROWSER-CLEANUP-001)
browser.close() in try/finally; `pkill -f "chrome.*headless"`; `pkill -f "next dev"`; report "browser processes: 0 remaining".

## Report format
implemented screen count / component count, build+tsc real output, screenshot absolute paths, viewports checked, design-compliance self-check.

## Verified scaffold facts (read 2026-05-30)
- Next.js 14.2.5 App Router. tsconfig alias `@/*` -> ./src/*. strict TS.
- globals.css: Google fonts (Noto Sans JP / Shippori Mincho) loaded via @import; `.app-shell` max-width 480px centered; bg.base + ink.700 defaults.
- layout.tsx wraps children in `<div class="app-shell">`. Service name = "rendez". Do NOT need to edit layout.
- src/app/page.tsx is frontend-owned (replaceable) — currently a placeholder landing linking to /onboarding. I will make it the U-00 login.
- Playwright NOT installed. Deps: next, react, zod, @line/liff, @prisma/client. Must `npm i -D @playwright/test` (or playwright) + `npx playwright install chromium` for screenshots.
- .gitignore already ignores playwright-report/, test-results/, .next/, *.log.
- tailwind tokens confirmed in tailwind.config.ts: bg/ink/line/accent/secondary/state/trust/verified, font sans+serif, radius sm6/md10/lg14, shadow sm/md, maxWidth.app=480.
- next.config images remotePatterns: vercel blob + line-scdn. (dev uses data: URLs per contract — fine.)

## Architecture decision
- src/lib is BACKEND-OWNED. So put frontend types + api client + dummy data under src/components/ or a frontend-only dir. DECISION: use `src/app/_lib/` (route-group private folder, underscore = not a route, clearly frontend) for types.ts + api.ts + mock fallback. Components in src/components/.
- Route group `(app)` for authenticated app screens with bottom tabs. U-00 login = src/app/page.tsx (root, no tabs).

## STATUS / next step after compaction
Docs all read. Scaffold inspected. NEXT: write src/app/_lib/{types,api}.ts, src/components/* (Button, Field, Chip, StatusBadge, BottomTabs, AppHeader, states), then screens. Then install playwright, build, tsc, screenshot.
