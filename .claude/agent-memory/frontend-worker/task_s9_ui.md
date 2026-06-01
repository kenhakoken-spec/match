---
name: task-s9-ui
description: S9 HAKO-NIWA(箱庭) rebrand + LP + onboarding gender-first + fee-by-gender + post-shoot routing (done) — owned files, contract rules, testids
metadata:
  type: project
---

# S9 UI — HAKO-NIWA(箱庭) rebrand + 作り込み (DONE 2026-06-02)

Canonical: docs/02_s9_spec.md (殿) + docs/design/s9-hakoniwa-brand-and-lp.md (design). Both reference the OLD name "rendez" legitimately (they describe the rename) — leave those.

## Brand rename rendez→HAKO-NIWA(主)/箱庭(副), tagline 「みんなが出会える場所」
- layout.tsx metadata was ALREADY done by 将軍 (HAKO-NIWA). I did: LoginScreen, ComingSoon, coming-soon/page.tsx metadata.
- **src/lib/security/origin.test.ts uses "rendez.example" as a CSRF dummy origin — MUST NOT touch** (off-limits, not the brand name).
- "合コン" is NOT banned (spec §1.3: allowed as supplementary in body copy, not main headings). venue-service.test.ts comments use 合コン — fine.

## New shared brand components (src/components/brand/)
- **BrandMotif.tsx** — inline-SVG React component for the 5 箱庭 motifs (mark / garden-plot / lantern / gate / stepping-stones). WHY inline not `<img src>`: currentColor can't be inherited by an external img, and a failed fetch leaves an empty frame (殿's exact complaint). Inline = zero external dep, always renders, color follows text-color + an accent CSS var. Props: `name`, `className`, `accent?` (sets `--brand-accent`, default falls to currentColor — accent max 1 point per SVG), `title?` (only then role=img+aria-label; default aria-hidden). a11y is a typed `SVGProps<SVGSVGElement>` to avoid union-spread TS issues.
- **BrandLockup.tsx** — mark + "HAKO-NIWA"(serif) + "箱庭 ・ 東京 恵比寿/池袋/銀座". Shared by LoginScreen + ComingSoon. Replaces the old ◇ placeholder.
- **LpSections.tsx** — exports `ValueList` (5 値訴求, vertical editorial list w/ line icons; NOT 3-col cards), `FlowList` (5 ご利用の流れ steps), and consts `LP_VALUES`/`LP_STEPS`. Line icons are inline stroke SVGs + BrandMotif gate/lantern. No filled emoji icons.
- **public/brand/*.svg** — 5 standalone SVG files (all <2KB; garden-plot biggest at 1838B) for OGP/future swap/docs. They mirror BrandMotif's shapes but use `var(--brand-accent, currentColor)`. Deliverable required the files; the live UI uses BrandMotif (inline).

## Fee-by-gender出し分け (s9 §5) — THE compliance core: 女性視点で¥2,000を出さない
- **SlotCard.tsx** (browse, authed): added `viewerGender?: Gender|null` prop. female → NO fee row at all. male → "男性 ¥2,000". null/unknown → neutral "男性 ¥2,000 ・ 女性 無料". Wired from browse via `me?.profile?.gender ?? null`.
- **PublicSlotCard.tsx** (explore list, public): can't know gender → neutral "男性 ¥2,000 ・ 女性 無料" (was male-only).
- **explore/[id]** detail: already neutral "男性 ¥2,000（女性は無料です）" — kept.
- **PaymentNotice.tsx** (U-05/06 + ApplyConfirmSheet): already gender-split (female=参加無料, male first-free 🎁, male paid). UNCHANGED.
- **payment/[slotId]** (U-14): already correct via server quote.reason (female_free/male_first_free/male_paid); women never reach the charge branch. UNCHANGED.
- Neutral co-notation is allowed for unknown gender (spec §5.2: 殿 wants to hide ONLY the OPPOSITE sex's price; showing both is fine).

## Onboarding 4-step w/ gender first (s9 §4) — src/app/onboarding/page.tsx
- index 0 = NEW gender step (skip hidden, 2-card radiogroup 女性/男性, ✓+border not color-only, 次へ進む disabled until chosen, 1-line reason). index 1..3 = the 3 existing explanatory slides (each ◇ box → BrandMotif). Dots=4 (TOTAL=SLIDES.length+1).
- Skip on explanatory slides only (index 1,2) → label "あとで" → **/explore** (was スキップ→/identity). Last slide (index 3) = consent + 本人確認へ進む.
- Gender persisted via **src/app/_lib/onboarding-gender.ts** (sessionStorage key `hakoniwa.onboarding.gender`, safe try/catch no-op). ProfileForm (create mode only) seeds gender from it in a mount useEffect (avoids SSR hydration mismatch), only if `initial?.gender` absent. Profile.gender stays authoritative.

## Post-shoot routing (s9 §6) — vocab is 応募 (予約=venue only)
- **identity/status** pending: note now 2 lines ("審査中は会への応募はできません" + "審査中でも、開催予定の会はご覧いただけます"); LINE notice → "結果は LINE とこの画面でお知らせします"; footer now Primary "会を見てみる"→/explore + Secondary "ホームへ"→/browse. StateBlock `note` prop widened string→ReactNode.
- **BrowseStatusBanner.tsx** (NEW, src/components/slots/): stage-based banner replacing the old static one in browse. Stages by `me.identity?.status` + `me.profile`: 未提出(null)→本人確認へ進む/identity, pending→状況を見る/identity/status, rejected→再提出する/identity, approved+no-profile→プロフィール登録へ/profile/new, approved+profile→no banner BUT once-only "準備ができました。ホームの会から応募できます。" (localStorage `hakoniwa.browse.readySeen`, dismissible). All neutral bg-sunken, NOT red, shape+label.
- RegisterCta default label "登録して参加"→"登録して参加する"; explore list/detail dropped explicit label override; explore list note 予約→応募.

## Legal links
- /legal/terms /privacy /tokushoho ALL already created by 将軍 (LegalLayout.tsx + 3 pages). Added 特定商取引法 link to LoginScreen footer.

## testids added/preserved
- LoginScreen: `login-button` (kept), `explore-cta` (new, secondary CTA → /explore).
- onboarding: `consent` (kept), `onboarding-next` (kept, now label 本人確認へ進む), NEW: `onboarding-gender` (radiogroup), `gender-female`, `gender-male`, `onboarding-gender-next`.
- browse: `browse-status-banner` (new, on the stage banner; absent when approved+profile).
- coming-soon: `coming-soon` (kept).
- SlotCard/PublicSlotCard testids unchanged (`slot-card`/`slot-card-link`/`public-slot-card`).

## Env lessons (reconfirmed)
- tsc is BRUTALLY slow under this run's CPU load — a 540s `timeout` run hit rc124 ("Terminated") with 0 error lines but INCONCLUSIVE (killed mid-load). Run tsc in BACKGROUND to a file (`> /tmp/x.txt 2>&1; echo TSC_RC=$?`) and poll, rather than a foreground timeout that can die before reaching your files. Judge by `error TS` line count. See [[feedback-env-wsl]].
- src/ is git-untracked (only scaffold commit) → verify edits by grep, not git diff. See [[task-e2e-testids]].
