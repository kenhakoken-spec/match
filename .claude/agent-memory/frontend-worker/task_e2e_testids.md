---
name: task-e2e-testids
description: E2E data-testid map for S1/S2 UI — which value sits on which real element, and the no-spread-prop forwarding pattern
metadata:
  type: project
---

# E2E data-testid integration (DONE 2026-05-30)

qa's Playwright E2E timed out on /browse waiting for `slot-card` (SlotCard had no testid). Added 16 testids across S1/S2 UI — attribute-only, zero visual/text/DOM-structure change.

**Why:** Stable E2E selectors. The values are a contract qa references — do NOT rename without telling qa.
**How to apply:** Preserve these. New interactive elements E2E will drive get a testid via the pattern below.

## Pattern: most shared primitives do NOT spread props (verify before editing!)
`Button`/`ButtonLink` (ui/Button.tsx) DO `...rest`-spread → pass `data-testid` directly at the call site. But `CheckboxRow`(ui/Consent.tsx), `LoadingState`/`EmptyState`(components/States.tsx), `SegmentedChoice`/`ChoiceChip`(ui/Choice.tsx), `Card`/`PageBody`(ui/Surface.tsx) take EXPLICIT named props and do NOT spread — to add a testid you must add an optional `"data-testid"?: string` param and forward it to the root node. I did this for CheckboxRow, LoadingState, EmptyState only. For containers with no dedicated component (identity docType radiogroup div, browse `<ul>`, mypage `<main>`, SlotCard inner content div, ApplicationCard root div) I put the testid on the existing element directly — no new wrapper, no DOM change.

## testid map (value → real location)
- SlotCard.tsx: `slot-card-link` on root `<Link>`; `slot-card` on the inner content `<div>` (SlotCard root IS a Link; there is no Card wrapper here).
- browse/page.tsx: `loading` (top-level LoadingState), `empty` (EmptyState), `slot-list` (the `<ul>`).
- slots/[id]/page.tsx: `apply-button` (active footer Button), `apply-blocked` (disabled footer Button). `apply-confirm` is in ApplyConfirmSheet (confirm Button).
- ApplicationCard.tsx: `application-row` on root `<div>` (card root is a div, not a Link). Rendered by applications/page.tsx. S3: when `matchHref` is passed (item.status==="accepted"), the root becomes a `<Link>` wrapping the Card and the testid moves onto the Link — selector still resolves.

## S3 testids (matches / venue / notify) — added 2026-05-30
- matches/[id]/page.tsx (U-08): `match-detail` on the `<main>` (present in loaded AND error views; loading early-return has none — wait for content). `venue-info` on the venue Card — rendered ONLY when match.status==="notified".
- admin/matches/page.tsx (A-04): no dedicated testid; rows are bordered `<li>` with a `ButtonLink` "詳細を見る / 会場入力・通知" to /admin/matches/{id}.
- admin/matches/[id]/page.tsx (A-05): `venue-form` on the form `<div>`; `venue-save` on the save Button (disabled until 店名+予約名 filled); `notify-send` on the notify Button (disabled until venue saved = status venue_set/notified); `mark-complete` on the 開催完了 Button (secondary, disabled until status notified). Inputs use ids #venueName #venueUrl #reservationName #meetingPlace (TextField derives id from htmlFor/name).
- page.tsx U-00 login Button: `login-button`. onboarding: `consent` (CheckboxRow), `onboarding-next` (last-slide Button, label 本人確認へ). identity U-12: `doc-type` (the `role=radiogroup` div of ChoiceChips, NOT a SegmentedChoice), `identity-submit` (Button). ProfileForm (new+edit): `profile-submit`. mypage: `mypage` on the loaded-view `<main>` (the loading-view early return does NOT have it — E2E should wait for content, not just route).

## Verification (all PASS)
Per-value grep counts: each of the 16 values appears exactly once. tsc --noEmit rc0 (no output). npm run build EXIT=0, "✓ Compiled successfully", .next/BUILD_ID present. Build-only — Playwright run is qa's job; 0 headless chrome left.

## Process notes (cost MANY wasted turns — do not repeat)
1. This repo's `src/` is UNTRACKED in git (only an infra scaffold commit exists) → `git diff`/`git status --porcelain` show only `??` lines, never my edits. Verify edits with grep/per-value counts, not diff.
2. I fired speculative Edits from GUESSED file contents before Reading → ~all failed. ALWAYS Read the real file first; the actual code differed a lot from the task brief (SlotCard root is Link not Card; identity uses ChoiceChip not SegmentedChoice; CheckboxRow takes children not a `label` prop).
3. NEVER batch a `pkill`/`kill`/`rm`-with-`||` together with other tool calls: pkill exits 144 here and a nonzero LEAD call CANCELS every sibling in that assistant turn. Also a stray bg `until`/`sleep` loop I'd launched flooded the shell with blank/garbled output for many turns. Fix: run pkill STANDALONE (only tool call that turn), `{ …; } >/dev/null 2>&1; true`, dangerouslyDisableSandbox; confirm with a SEPARATE `ps|grep|wc -l`. grep stdout also garbles under load → write to a `$RANDOM` temp file and Read it. See [[feedback-env-wsl]]. Related: [[task-s2-ui]], [[task-s1-ui]].
