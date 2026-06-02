---
name: task-s11-ui
description: S11 polish (done) — #2 date-主役 cards, #3 calendar toggle, #8 HeroScene SVG — owned files, token rules, design constraints
metadata:
  type: project
---

# S11 UI — 日付主役 / カレンダー / HeroScene (DONE 2026-06-03)

Canonical: docs/04_s11_polish.md (殿 全FB) + docs/design/s11-polish-design.md (design 実装仕様・ワイヤー・SVG構図). This task = only #2/#3/#8 (フェーズ3). #1/#4-#7/#9 are other phases/workers.

## Constraints that held (reconfirm before touching these areas)
- Only `./node_modules/.bin/tsc --noEmit` (timeout 540, rc124-with-0-errors = OK) and `npm run test` (vitest) are runnable. **next dev/build/start/curl FORBIDDEN** (shared .next breaks). pkill/fuser FORBIDDEN. See [[feedback-env-wsl]].
- **Use ONLY tokens in tailwind.config.ts**: bg.base/surface/sunken, ink.900/700/500/300, line.200/100, accent.600/500/300/100, secondary.500/100, state.{info,success,warn,muted,danger}, trust.600/300/100, verified.500, + tailwind built-in `white`. design spec said no new tokens needed — held. 曜日色 = existing (state-info=土, accent-600=日, ink-700=平日).
- Result: tsc rc0 / 0 errors. vitest 27 files / 389 passed (baseline maintained, all tests are domain/service in src/lib + src/app/_lib + src/app/api — none touch my UI).

## #2 日付主役カード — owned/edited files
- **NEW src/components/slots/SlotDateBlock.tsx** — exports `SlotDateBlock({iso, muted?})` (left: 月 serif14 ink-500 + 日 serif28 tabular ink-900[muted→ink-700] + 曜日 colored + 時刻 "19:30〜" stacked) and `AreaChip({label})` (rounded-sm sunken/line-200 pill). Both card types share these → identical visual language. `muted` for ineligible (never red).
- **SlotCard.tsx / PublicSlotCard.tsx**: top row inverted to `flex items-start justify-between gap-3` with `<SlotDateBlock>` + `<AreaChip>`. Middle FillDots + bottom 条件/料金 UNCHANGED. **Gender fee split preserved (s9): female=no fee row, male="男性 ¥2,000", null=neutral 併記.** testids (`slot-card-link`/`slot-card`/`public-slot-card`), Link, aria-label UNCHANGED. Both still import formatDateShort/formatTime — used in aria-label, do NOT remove.
- **slots/[id] & explore/[id] headers**: dropped h1「{エリア}エリア」. New: `<h1 serif28>{月}月{日}日<span weekdayColor>（{曜}）</span></h1>` + 時刻 sans17 + AreaChip + 人数 caption in one row. Used an IIFE `{(() => { const p = jstDateParts(...); return (...); })()}` inline. All sections below header UNCHANGED. Swapped import formatDateShort/formatTime → jstDateParts/weekdayColorClass.

## #3 カレンダー — owned/edited files
- **NEW src/components/slots/SlotCalendar.tsx** — GENERIC `<SlotCalendar<T> slots isoOf keyOf renderCard emptyMonthBody>`. Internal: byDay Map<ymdKey,T[]>, initial select = nearest-future event day (fallback newest), month nav `goMonth` ALSO re-selects earliest event day of target month (prevents selected-day/visible-month mismatch — important edge I had to fix). `selectedInView` guards the day-card section to only show when selectedKey is in the visible month. monthHasAny → EmptyState for 会ゼロ月. Cells: h-11 w-11 rounded-full buttons, disabled when no event, accent-500 dot (white dot when selected), today=ring-1 ring-line-200 (only if not selected), selected=bg-accent-500 text-white. Weekday calc per cell: `(firstWeekdayOf(y,m) + day-1) % 7`. `firstWeekdayOf` uses `Date.UTC(y, m-1, 1, 12)` noon to be TZ-safe.
- **NEW src/components/slots/ViewToggle.tsx** — `<ViewToggle value onChange>` segment (list/calendar). `role=tablist`, each `role=tab`+aria-selected. Track bg-sunken, selected tab bg-surface+shadow-sm+font-semibold+ink-900, unselected ink-500. Distinct from bottom accent tabs (no accent). Default = list.
- **browse/page.tsx & explore/page.tsx**: added `view` useState (default "list"). Toggle shown only when slots>0 (取得ゼロ keeps existing EmptyState, no toggle). browse has a `renderCard` closure passing hint+viewerGender; explore passes `(slot)=><PublicSlotCard slot={slot}/>`. Wrapper div testid `slot-calendar`.

## #8 HeroScene — owned/edited files
- **NEW src/components/brand/HeroScene.tsx** — `<HeroScene className>`. viewBox 360×280, preserveAspectRatio slice. 4 layers: (1) sky linearGradient #F6E7DC→#FBF7F0 (both tokens; removed an intermediate stop so ALL hex are exact §7 tokens), (2) light radialGradient accent-300 fading to transparent + core ellipses accent-300/accent-500, (3) garden hills uneven bezier secondary-100 + secondary-500 low-opacity gradient + line lantern (trust-600 #8A6D3B) with accent-500 light point + lantern-glow radialGradient, (4) 6 silhouettes ink-700 #4A433C 62-82% opacity, 3-left-facing-right + 3-right-facing-left, head circle + shoulder bezier, NO faces. Has role=img + aria-label (it's the main hero — NOT aria-hidden; BrandMotif default IS aria-hidden but this is the meaningful main illustration). No animation. **All hex verified ⊂ palette.**
- **LoginScreen.tsx**: inserted HeroScene between BrandLockup-area and tagline, inside the hero `<div className="relative">`, wrapper `mb-8 overflow-hidden rounded-lg` (no border/shadow). hero-atmosphere kept. garden-plot NOT revived.

## datetime.ts additions (foundation for #2/#3)
- `jstDateParts(iso)` → {year,month,day,weekday,weekdayIndex,time,ymdKey}. Reuses existing `jstParts` → SSR/CSR consistent (verified: UTC 2026-06-12T15:00Z → JST ymdKey 2026-06-13).
- `weekdayColorClass(i)` → 0→text-accent-600, 6→text-state-info, else text-ink-700.
- `ymdKeyOf(y,m,d)` → "YYYY-MM-DD". Existing formatDateShort/formatTime/formatDateTime/startMillis UNCHANGED.

## new testids (tell qa)
- `view-toggle`, `view-toggle-list`, `view-toggle-calendar` (ViewToggle).
- `slot-calendar` (wrapper div in browse + explore when calendar view active).
- Calendar day cells have no testid (use aria-label "{月}月{日}日（{曜}） 会{n}件").
