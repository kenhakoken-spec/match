---
name: task-s2-ui
description: S2 UI (slots browse/detail/apply, my applications, admin slot create) — DONE; contract shapes, file ownership, reused primitives
metadata:
  type: project
---

# S2 UI Implementation (DONE 2026-05-30)

Slots core experience: 枠一覧(U-04) / 枠詳細+応募(U-05/U-06) / マイ応募状況(U-07) / admin枠作成(A-02), built on the S1 design system (Next.js 14 App Router + Tailwind, tokens in tailwind.config.ts).

**Why:** S2 is the core "見て応募する" loop. Backend (src/lib, src/app/api) was ALREADY complete when I started — I consume it, not build it.
**How to apply:** When extending slots UI, reuse the S2 lib + components below; do NOT touch backend-owned files (api-contract-s2.md §5: src/app/api/slots|applications|admin/slots, src/lib/**, prisma).

## DANGER MISTAKE I made (don't repeat)
My first attempt wrote the client layer against an *assumed* contract (filled as a per-gender capacity object, app statuses "matched"/"confirmed", priceMale/priceFemale, reasons not_verified/slot_full). ALL WRONG — deleted every file and rewrote. **The .md contract is the spec, but src/lib/types.ts + src/lib/serializers.ts + the route handlers are the TRUTH. Read them before writing any client layer.**

## FROZEN contract shapes (src/lib/types.ts §S2 — mirror exactly)
- `SlotDTO`: id, datetimeStart(ISO), area("ebisu"|"ikebukuro"|"ginza"), capacityPerGender(number=3), filled{male,female}, conditions{minAge,maxAge,requiresBadge:"premium"|null}, status("open"|"filled"|"confirmed"|"done"|"canceled"), feeMale(2000).
- `SlotDetailDTO` = SlotDTO + myApplication{status}|null + eligibility{canApply, reasons[]}.
- ApplicationStatus: "applied"|"accepted"|"canceled". reasons: identity_required|profile_required|age_out_of_range|badge_required|gender_full|already_applied|slot_closed.
- Envelopes: GET /api/slots→{slots}(open only, no eligibility); GET /api/slots/[id]→{slot}; POST apply→200{application:{status},matched} / 409{error:{code:"not_eligible",message,reasons}}; GET /api/applications→{items:[{slot,status}]}; admin POST /api/admin/slots→{slot}; admin GET→{slots}(all statuses).
- admin createSlotSchema: {datetimeStart(ISO), area, minAge?(18-120 int|null), maxAge?(int|null), requiresBadge?(bool)}, refine minAge<=maxAge.

## Files I own (created)
- Lib (frontend-only, src/app/_lib/): api-s2.ts (fetch + re-declared DTOs + `// FALLBACK` dummy data; `applyToSlot` reads raw 409 body so `reasons` survives — S1 ApiCallError drops reasons), slots-ui.ts (status pills/reason wording/condition chips/fill dots/listHint — color never the only signal, 条件不足 never danger), datetime.ts (ISO→JST formatting; separate from S1 date.ts which is birthdate-only).
- Components (src/components/slots/): SlotCard, ApplicationCard, ApplyConfirmSheet (role=dialog aria-modal + focus trap), PaymentNotice, FillDots, SlotConditionChips.
- Pages: src/app/(tabs)/browse/page.tsx, src/app/slots/[id]/page.tsx, src/app/(tabs)/applications/page.tsx, src/app/admin/slots/page.tsx, src/app/admin/{layout,page}.tsx (admin dir did NOT exist before — I created it; PC 2-pane shell, full-width not 480px-capped; page.tsx redirects to /admin/slots).

## Reused S1 primitives (NOTE: src/components/ui/ subdir!)
Button/ButtonLink(variant prop, NO className), StatusPill(tone, glyph, children), ConditionChip(children, withBadgeIcon), Card(tone), PageBody, StickyFooter, CheckboxRow, ChoiceChip/SegmentedChoice, TextField/TextArea, FieldLabel/FieldError. At src/components/ root: AppHeader(title, backHref, progress, right), BottomTabs, States(EmptyState/LoadingState/ErrorState). S1 api client src/app/_lib/api.ts exports ApiCallError, getMe, getIdentity (postJson/putJson private). globals.css has NO custom classes — all Tailwind utilities.

## Design rules applied (design-system §4.7/§5/§8)
- 充足ドット ●確定/○空き + aria-label; condition chips on neutral pills (color never signals urgency).
- Ineligible slots/reasons = warn(橙)/muted(淡色), NEVER danger(赤). List ineligible cards: dashed + dimmed + muted factual reason.
- Payment: 初回無料 is the hero (accent.100, single 🎁 = the one allowed emoji); "不成立の場合、お支払いは発生しません" MANDATORY on every payment surface; women=参加無料.
- All status by label+glyph not color alone. Tap 44pt+, buttons 48px+.

## Verification (all PASS)
tsc --noEmit rc0; npm run build exit0 (.next/BUILD_ID present); 6 screenshots 375x812 in screenshots/s2/ (u04-browse, u05-detail-eligible, u05-detail-ineligible, u06-apply-confirm, u07-applications, a02-admin-slots), all visually confirmed non-empty.

Environment quirks that cost many turns are in [[feedback-env-wsl]].
