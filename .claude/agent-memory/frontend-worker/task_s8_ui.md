---
name: task-s8-ui
description: S8 未ログインプレビュー (public explore) — owned files, public DTO contract (real field names), PII rules, testids, reused primitives
metadata:
  type: project
---

S8 = 未ログインプレビューUI (要望1: まず見える→でも制限→登録を促す). Done. tsc rc0, 313 tests pass.

**Owned files (all new, untracked):**
- `src/app/_lib/api-public.ts` — public client, `credentials:"omit"`, `PublicApiError{status}`, `fetchPublicSlots():PublicSlotDTO[]`, `fetchPublicSlotDetail(id):{detail,notFound}`. Has FALLBACK dummy (3 slots: anyone/20代/premium) like api-s2.ts.
- `src/app/_lib/public-ui.ts` — `OCCUPATION_LABELS`/`occupationLabel(Occupation|null)`.
- `src/components/public/{PublicSlotCard,PublicMemberCard,RegisterCta}.tsx`
- `src/app/(public)/explore/page.tsx` (list) and `src/app/(public)/explore/[id]/page.tsx` (detail)

**Public API contract (backend-owned, do NOT change) — REAL shapes:**
- `GET /api/public/slots` → **`{ slots: PublicSlotDTO[] }`** (WRAPPED, not bare). Sorted asc.
- `GET /api/public/slots/[id]` → **`PublicSlotDetailDTO` directly** (NOT wrapped); 404 body `{error:{code:"slot_not_found"}}`.
- Public DTOs live in `src/lib/types.ts` (import via `@/lib/types`). NOT in app/_lib/types.ts.
- `PublicSlotDTO` fields: `id, datetimeStart, area, capacityPerGender, filled:{male,female}, conditions:SlotConditions, feeMale, status`. (NOT startsAt/capacity/reservedCount/feeYen/condition — I guessed those first and ate 17 tsc errors.)
- `PublicMemberDTO`: `ageBand:string, gender, occupation:Occupation|null, ratings:{again,talk,manner,overall,count}, hasPremiumBadge`. NO name/photo/lineId.
- `PublicSlotDetailDTO extends PublicSlotDTO { members: PublicMemberDTO[] }`.

**Reused design primitives (from real files — do not reinvent):**
- `AppHeader{title,backHref,serif}`; `LoadingState/EmptyState/ErrorState` (States.tsx; Empty/Loading take `"data-testid"?`).
- `Button`/`ButtonLink` (Button.tsx) — these DO spread `...rest`, so `data-testid` on `<ButtonLink data-testid=...>` forwards.
- `StatusPill{tone,glyph,children}` + named exports `VerifiedBadge()`, `PremiumBadge()` (NO args) live in `ui/StatusPill.tsx`. `ConditionChip` too.
- `Stars.tsx` exports `StarSummary{avg,count}` and `StarInput{...}` — there is NO `Stars` export. For per-axis stars I inlined a compact ★ row in PublicMemberCard (color + numeric value, §5).
- `FillDots{filled,capacityPerGender,variant}`, `SlotConditionChips{conditions}` (components/slots).
- helpers from `app/_lib/slots-ui` (`areaLabel,yen,remainingText`) + `app/_lib/datetime` (`formatDateShort,formatTime,startMillis`).

**PII rule:** never access/render name/photo/lineId; create no placeholder field for them. Line "お名前と写真は登録後に表示されます。" is allowed (explains hiding, renders no PII).

**Routing:** `register-cta` (RegisterCta) → `/` (U-00 login; exists). `/onboarding` page also exists if ever needed.

**testids:** public-slot-list (ul), public-slot-card (card Link), public-member (member li), register-cta (ButtonLink). Plus loading/empty reuse States testids.

**Tailwind tokens only** — bg.base/surface/sunken, ink.900/700/500/300, line.200/100, accent.500/600, state.muted etc. Do NOT use generic neutral-*/red-*/bg-white (my first draft did — wrong world).

**CORRECTION to my earlier note:** there is NO "pre-broken backend route.ts". Full `tsc --noEmit` is rc0. My earlier rc1 was caused by (a) my own then-broken files and (b) stray `/tmp/be_*.ts` files from another worker getting compiled when I ran tsc against a /tmp tsconfig. Lesson: run `tsc --noEmit` from repo root with the repo's own tsconfig; never write a temp tsconfig in /tmp (extends/baseUrl/lib all break → false errors). See [[feedback-env-wsl]].
