---
name: task-s12-ui
description: S12 プロフィール刷新(写真→アイコン/職業フリー/性別重複排除/成立詳細でage・職業・bio開示)+定員柔軟化(2:4許容) UI (done) — owned files, contract shapes, helpers, integration-seam lesson
metadata:
  type: project
---

# S12 UI — プロフィール刷新 + 定員柔軟化 (DONE 2026-06-04)

Canonical: docs/05_s12_feedback.md (#1/#6/#7/#8/#10/#14) + docs/06_s12_strategy.md §4.
backend基盤(domain/repo/serializers/schema)は backend-worker が先行完成。This task = the UI + the API/zod integration seam.

## Result: tsc 0 errors / vitest 30 files 443 passed (baseline exactly maintained). No forbidden tokens.

## The integration-seam gap I had to bridge (IMPORTANT)
backend wired ProfileDTO.iconKey/occupationText, MatchMemberDTO {age,occupation,bio}, SlotDTO.capacityTotal/min/maxPerGender, UpsertProfileInput.iconKey?/occupationText?, domain sanitizeOccupationText/resolveOccupationDisplay, repo upsert (memory+prisma) — ALL ready. BUT the seam `PUT /api/profile` route + `profileSchema` (zod) did NOT pass iconKey/occupationText through. I added them: validation.ts profileSchema (iconKey refine isValidIconKey, occupationText max len) + route.ts upsert call (occupationText via sanitizeOccupationText, iconKey passthrough). Lesson: "backend基盤完成" can mean domain/repo done but the route/zod glue still open — grep the actual route handler + schema, don't trust the DTO type alone.

## Owned/created files
- NEW **src/components/profile/ProfileIcon.tsx** — 10 line-icon SVGs (fox/cat/bear/rabbit/panda/penguin/leaf/flower/star/moon = icons.ts ICON_IDS), all stroke/currentColor/viewBox 0 0 48 48 sw1.6 (design-system §4.6, BrandMotif-style, NO emoji). Exports: `ProfileIcon`, `ProfileIconAvatar`, `ProfileIconPicker` (radiogroup, testid `icon-picker` + `icon-option-{id}`, selected via border+ring+✓ not color-only), `normalizeIconKey`.
- **ProfileForm.tsx** (rewrite): #8 PhotoPicker→ProfileIconPicker (top, required, iconOk gate). #6 職業 free-text TextField (occupationText, max 40, optional). #1 性別 SegmentedChoice ONLY in `mode==="edit"`; create-mode gender comes from onboarding sessionStorage (getOnboardingGender) via mount useEffect; added `genderResolved` state → if create+gender-null after resolve, show always-visible warn block + link to /onboarding (button is disabled when un-filled, so can't rely on showErrors). saveProfile now sends iconKey/occupationText. **Outer div MUST stay `flex min-h-[100dvh] flex-col` (full-width)** — PageBody+StickyFooter each carry their own max-w-[480px]; adding max-w to outer shrinks the StickyFooter band (breaks S11 PC). See [[task-s11-visual]].
- **mypage**: avatar fallback photoUrl → iconKey (ProfileIcon) → ◯; added occupationText quiet line.
- **matches/[id]** + **admin/matches/[id]**: member rows now show age/occupation/bio (user) / age/occupation (admin) per #7/#14. User page adds "成立した方にのみ表示" note. bio/occupation null-safe.

## Frozen contract shapes I synced (frontend mirrors of backend src/lib/types.ts)
- `src/app/_lib/types.ts` ProfileDTO += iconKey:string|null, occupationText:string|null.
- `src/app/_lib/api.ts` ProfileInput += iconKey?/occupationText?; FALLBACK_PROFILE += iconKey:"flower"/occupationText.
- `src/app/_lib/api-s3.ts` MatchMemberDTO += age:number|null, occupation:string|null, bio:string|null; FB_MEMBERS rebuilt with those (2 of 6 have bio:null to test null layout).
- `src/app/_lib/api-s2.ts` SlotDTO += capacityTotal/minPerGender/maxPerGender; ALL 7 fbSlots/fbApplications literals + admin/slots fallback got `capacityTotal:6,minPerGender:2,maxPerGender:4`. (api-public.ts PublicSlotDTO ALREADY had them — backend did it, don't re-add.)

## #10 定員柔軟化 (2:4 許容) — display helpers in slots-ui.ts
Added `totalRemaining(slot)` (capacityTotal - filled.male-filled.female, ≥0), `capacityText(slot)` ("男女あわせて6名（各2〜4名）"; min===max → 各N名), `fillProgressText(slot)` ("あと○名で成立" / "満席です"). Switched SlotCard/PublicSlotCard/ApplicationCard remain-text and slots[id]/explore[id] 募集状況 + ApplyConfirmSheet from per-gender `remainingText` to total `fillProgressText`+`capacityText`. Per-gender **FillDots ●○ kept** (still meaningful). Replaced "3 対 3（男女各3名）" / "男女各3名・X名で成立" / admin "定員: 男女各3名(固定)" / explore+browse empty-state "男女3対3の枠". `remainingText` still used by admin/venues — kept exported.
- **NOT touched (scope-discipline, belongs to #9 LP-concept P3)**: LP/HeroScene/ComingSoon/LpSections "3対3" brand taglines, legal/terms "男女各3名・計6名" (legal text). Only softened onboarding gender-rationale line (tied to my #1 work).

## new testids: `icon-picker`, `icon-option-{fox..moon}` (10). Existing preserved (profile-submit, match-detail, mypage, slot-card, public-slot-card, application-row, etc.).

## Env (reconfirmed): only tsc(noEmit) + vitest runnable; next dev/build/curl FORBIDDEN. src IS git-tracked now (git status shows M, not untracked — older [[task-e2e-testids]] note was stale). Backend-worker's S12 changes also show in git status (schema/repo/serializers/match) — don't claim those as mine.
