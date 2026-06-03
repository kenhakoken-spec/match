---
name: task-s11-visual
description: S11 visual upgrade (done) — PC responsive (app-shell 480 撤廃) + HeroScene 強化 — owned files, mobile-unchanged technique, token/breakpoint rules
metadata:
  type: project
---

# S11 視覚強化 — PC最適化 + Hero映え (DONE 2026-06-03)

Canonical: docs/04_s11_polish.md (#8/#9) + docs/design/s11-visual-upgrade.md (design 実装仕様 §9 チェックリストA〜G + 付録差分表). This task = PC responsive widen + HeroScene rebuild. Distinct from [[task-s11-ui]] (which did date-主役/calendar/HeroScene v1).

## Constraints that held (reconfirm before touching these areas)
- Only `./node_modules/.bin/tsc --noEmit` (timeout 540, rc124-with-0-errors = OK) and `npx vitest run` are runnable. **next dev/build/start/curl FORBIDDEN**, pkill/fuser FORBIDDEN. See [[feedback-env-wsl]].
- **HARD RULE from Shogun: モバイル(〜767px) は 1px も変えない.** Every widen is `md:`/`lg:`-prefixed; base classes byte-identical. This OVERRODE the design spec where it specified base-level widths (e.g. spec §5.1 said calendar `max-w-[420px]` from base — I made it `md:max-w-[520px]` md-only so mobile is untouched; spec §7.2/§7.4 EmptyState-motif & body-atmosphere SKIPPED entirely because they'd alter mobile).
- **Tokens**: only those in tailwind.config.ts (ink900/700/500/300, line200/100, accent600/500/300/100, secondary500/100, state{info,success,warn,muted,danger}, trust600/300/100, verified500, bg{base,surface,sunken}) + tailwind built-in white + arbitrary values. HeroScene uses raw hex ONLY from this palette (NO #F0D9C4, NO trust-600 lantern — spec's recommended new-token-free path). breakpoints = default md=768/lg=1024. max-w-3xl/5xl are built-in (config only EXTENDS maxWidth with `app`).
- Result: tsc 0 errors / vitest 27 files 389 passed (baseline maintained; no test touches UI).

## The app-shell 480 撤廃 — the load-bearing change (affects ALL screens)
- `globals.css .app-shell`: removed `max-width:480px`, now `width:100%` + margin-inline auto + min-h. Added `.shell-narrow` (480 center) util. `shell-wide` NOT made a util — used inline `md:max-w-3xl lg:max-w-5xl` per spec's recommended approach.
- **Why no page leaked to full-width**: app-shell wrapped EVERY page (layout.tsx `<div class="app-shell">`). After removal each page must carry its own base max-w. Technique used: base mobile already rendered at 480 via app-shell, so adding `max-w-[480px] mx-auto w-full` to the same content element = byte-identical base.
- **Where the 480 was re-applied** (so future edits don't re-leak):
  - SHARED wrappers (one edit covers many): `ui/Surface.tsx` PageBody (`mx-auto w-full max-w-[480px]`) + StickyFooter (band full-width, inner `max-w-[480px] px-5 py-3`); LegalLayout main; ComingSoon main.
  - OUTER-div pages (`replace_all` on `className="flex min-h-[100dvh] flex-col">` → prepend `mx-auto ... max-w-[480px]`): identity, identity/status, slots/[id], explore/[id], matches/[id], ratings, ratings/[slotId], profile/edit, profile/photo-guide. (Constrains header+all branch mains uniformly; header border is 480-centered on PC = acceptable per spec §7.5.)
  - FRAGMENT pages (no outer div → constrain content main directly): applications (3 mains), mypage (1 main).
  - onboarding & LoginScreen & ComingSoon: own top `<main>` constrained.
  - INTENTIONALLY full-width outer divs (NOT leaks): explore/page:47, (tabs)/layout.tsx:13 — widen pages whose inner mains carry widen and whose footer/tab BANDS are full-width by design. ProfileForm:161 & LegalLayout:16 outer divs full-width but inner content (PageBody/main) is constrained.
  - catalog (max-w-md=448, dev), line-debug (inline maxWidth, dev), admin (out of scope) — left as-is.

## Widen pages (the 3 that get wider on PC)
- LP (LoginScreen): main `max-w-[480px] md:max-w-3xl md:px-8 lg:max-w-5xl`. Hero md+ 2-col grid `md:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] md:items-center md:gap-8`; **DOM kept Hero→copy**, md+ `order` swap (Hero md:order-2, copy md:order-1) → base 1px-unchanged. h1 `md:text-[40px] lg:text-[44px]`. desc card `md:max-w-none`. CTA grp `md:max-w-[20rem]`. end-CTA `md:mx-auto md:max-w-[520px]`. Hero frame got relative + overlay vignette `shadow-[inset_0_0_40px_rgba(43,38,34,0.06)]`.
- LpSections: ValueList ul `md:grid md:grid-cols-2` (2×2). FlowList+ConcreteBlock wrapped in LoginScreen `md:grid md:grid-cols-2 md:items-start md:gap-8`.
- explore + browse: list ul `grid grid-cols-1 gap-3 md:auto-rows-fr md:grid-cols-2 lg:grid-cols-3` (grid-cols-1+gap-3 ≡ space-y-3 at base). li `md:h-full`. explore footer band full-width + inner widen. BottomTabs: band full-width, inner `<div class="mx-auto grid w-full max-w-[480px] grid-cols-3">`.
- Card height-match (SlotCard + PublicSlotCard): root `+md:flex md:h-full md:flex-col`, bottom fee row `+md:mt-auto` (sinks fee to bottom on PC). **Fee-split S9 logic & date-block S11 untouched.** base = pure `block`.
- SlotCalendar: month-grid portion wrapped `md:mx-auto md:max-w-[520px]` (md-only!), cells `md:h-12 md:w-12`, selected-day events ul `md:grid md:grid-cols-2` (events follow main width, month-grid centered).

## new testids: NONE added. Existing preserved (slot-list, public-slot-list, slot-calendar, login-button etc.). Tell qa: PC layout is the only change; mobile DOM/testids identical.
