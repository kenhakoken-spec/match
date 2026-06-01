---
name: task-s10-ui
description: S10 full LP/onboarding/ComingSoon redesign — garden-plot removal, leaf motif, hero-atmosphere CSS, fixed-footer→flow CTA, login UX (in progress)
metadata:
  type: project
---

# S10 UI — 全面リデザイン (in progress 2026-06-02)

Canonical: docs/03_s10_redesign.md (殿+将軍実機棚卸し) + docs/design/s10-redesign.md (design, CSS具体値・ワイヤー・付録差分表). Built on top of S9 ([[task-s9-ui]]). design-system.md still governs.

## Scope (8 tasks)
1. Remove garden-plot: delete public/brand/garden-plot.svg, remove from BrandMotif union/VIEWBOX/SHAPES, remove all refs (LP/ComingSoon/onboarding).
2. Add leaf motif: public/brand/leaf.svg + BrandMotif `leaf` (line, accent 1pt, aria-hidden). Replaces garden-plot where used.
3. hero-atmosphere CSS in globals.css: terracotta+deep-green 2-layer radial-gradient, blur 8-10px, ≤0.20 opacity, NO blue/purple, fades to bg.base. No new color tokens (existing RGB).
4. LP (LoginScreen) rebuild: KILL fixed footer (`fixed inset-x-0 bottom-0`), CTA into page flow (hero + tail repeat). Remove pb-44. Structure: hero(tagline+serif h1+sub-headline+atmosphere+dual CTA) → 4 value cards → flow → concrete block(恵比寿池袋銀座・水金土19:30・男女3人ずつ) → tail CTA. Error above main CTA. **runLogin/handleLogin/auto-resume useEffect/lineLogin behavior UNCHANGED**.
5. Login UX: errorMessage per-cause + 「スマホのLINEで開いてください」常設.
6. ComingSoon: atmosphere hero, garden-plot removed, presentational kept.
7. onboarding: S9 logic (gender-first 4 steps, no skip, sessionStorage) KEPT, visual only (garden-plot→leaf, aspect-[4/3] big box → 48-64px small motif).
8. explore/browse: world-view micro-adjust only (fee-by-gender S9 KEEP).

## Env facts (verified this task)
- `npm run test` = `vitest run`. ALL vitest tests are lib/domain/api (backend) — NONE test LP copy/components. Safe from copy changes.
- e2e/lv4-core-loop.spec.ts (Playwright, NOT in npm run test) depends on testids: `login-button`, `consent`, `onboarding-next`. MUST preserve these. Does NOT depend on explore-cta/copy/garden-plot.
- garden-plot refs: exactly 4 files (LoginScreen, onboarding ×2 lines, ComingSoon, BrandMotif) + the svg.
- ComingSoon is a Server Component (presentational, no hooks) reused by /coming-soon page AND ReleaseGate — keep hooks-free.

## testids (S10)
- LoginScreen: `login-button` (keep), `explore-cta` (keep, now appears 2× — hero + tail). data-testid on a component must be UNIQUE-ish for getByTestId().first() — Playwright uses .first() for login-button so dup is OK but prefer hero gets the canonical one.
- onboarding: all S9 testids kept (consent, onboarding-next, onboarding-gender, gender-female, gender-male, onboarding-gender-next).
- coming-soon: `coming-soon` (keep).
