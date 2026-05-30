---
name: task-s8-venue-admin
description: S8 admin 会場候補 UI (要望2) + 職種/多軸 (要望1) display reality — DONE; contracts, owned files, testids, key scope call
metadata:
  type: project
---

# S8 admin 会場候補 + 職種/多軸 表示 (DONE 2026-05-31)

Final S8 frontend task. tsc rc0, 313 tests pass (21 files — unchanged baseline, incl. backend `venues-route.test.ts`).

## NO scaffold existed — I created everything fresh
At task start my FIRST batch wrongly assumed `VenueCandidateCard.tsx`/`.test.tsx`/`api-venue.ts`/`admin/venues/page.tsx` were pre-stubbed. They did NOT exist. (A stray `find ... ( ... )` with unbalanced parens exited 2 and cascade-cancelled ~25 sibling tool calls — same poisoning failure mode as pkill-144; see [[feedback-env-wsl]]. Keep risky/odd-syntax calls OUT of big batches.) Lesson: ls/grep the owned paths and TRUST the result; don't pre-write from an assumption.

## FROZEN venue API contract — verified against the REAL route handlers (the .md is a guide)
- GET `/api/admin/venues?slotId=` → `{ items: VenueCandidateDTO[] }` (fitScore desc; 400 if no slotId; 404 no slot). requireAdmin server-side.
- POST `/api/admin/venues/suggest` body `{ slotId }` → `{ items, created, notified }` (404 no slot/candidates). Idempotent: re-suggest returns created=0.
- POST `/api/admin/venues/[id]/choose` body `{ reservationName(req), venueName?, venueUrl?, meetingPlace? }` → `{ candidate, match: AdminMatchDetailDTO }`. 400 validation / 404 not_found|match_not_found / 409 candidate_not_suggestable|match_not_settable. venueUrl must be http(s).
- POST `/api/admin/venues/[id]/reject` NO body → `{ candidate }`. 404 / 409 candidate_not_suggestable.
- `VenueCandidateDTO` = {id,slotId,name,url|null,tabelogScore|null,googleScore|null,fitScore|null,area,status} (src/lib/types.ts). status = suggested|chosen|rejected.

## KEY SCOPE CALL — 職種/多軸 (要望1) was ALREADY fully done; admin roster has NO such data
- `toMatchMemberDTO` (serializers.ts) returns ONLY `{displayName, gender}` — admin match members carry NO occupation/ratings. Inventing them on the admin roster would need a backend DTO change (forbidden). So I did NOT touch the admin roster member rows.
- The occupation + 3軸★ display ALREADY EXISTS where the data lives: `PublicMemberCard.tsx` (explore, another worker) renders occupation + また会いたい/会話/マナー/総合 from `PublicMemberDTO`. `occupationLabel` is in `public-ui.ts`. `MultiAxisSummary` is exported from `components/ui/Stars.tsx`.
- `ProfileDTO` (returned by /api/me → used by mypage) has ONLY `ratingAvg`/`ratingCount` (NO 3-axis, NO occupation). mypage already shows overall via `StarSummary`. Can't add 3-axis there without backend change.
- I briefly created `MemberHighlights.tsx` + `app/_lib/occupation.ts` then DELETED them — they duplicated existing `public-ui`/`PublicMemberCard` and had no data source in admin scope = dead code. Keep changes surgical; don't add unused components to "satisfy" a requirement already met elsewhere.

## Files I created / edited (all that changed)
- NEW `src/app/_lib/api-venue.ts`: listVenues/suggestVenues/chooseVenue/rejectVenue. Mirrors api-s3 (`getJson`/`postJson`, reuse `ApiCallError` from `./api`). API errors → {ok:false,errorCode/message}; NETWORK errors → contract-shaped FALLBACK candidates (mock 食べログ/Google/fitScore desc) so UI renders offline.
- NEW `src/components/VenueCandidateCard.tsx`: 店名(link, rel=noopener) / 食べログ / Google / 合コン向き度(fitScore, accent-100 chip, NOT neon) + 予約名 TextField + この店にする(primary, guarded: only fires onChoose when input non-empty) / 却下(secondary). Props {candidate,onChoose(name),onReject,busy?}.
- NEW `src/app/admin/venues/page.tsx`: standalone — left slot picker (fetchAdminSlots from api-s2) + right candidate list/suggest/choose/reject. Uses SLOT_STATUS_PILL/areaLabel/remainingText/datetime helpers.
- EDIT `src/app/admin/matches/[id]/page.tsx`: ADDED 会場候補 section ABOVE the existing manual venue form (relabeled existing heading → "会場を入力（手動）"). Imports api-venue + VenueCandidateCard. Added `useCallback`. `slotId = match?.slotId`; load candidates when slotId known; on choose → `await load()` to refresh venue fields/status then reload list. Existing flow UNTOUCHED: testids venue-form/venue-save/notify-send/mark-complete all still 1×; existing #venueName/#venueUrl/#reservationName/#meetingPlace inputs intact.
- EDIT `src/app/admin/layout.tsx`: added one NAV entry `{href:"/admin/venues", label:"会場候補"}`.

## testids (qa contract)
NEW: `venue-candidate-list`, `venue-suggest` (both appear in BOTH venues/page AND matches/[id] → count 2 each), `venue-slot-option` (venues/page only). Card: `venue-candidate`, `venue-reservation-input`, `venue-choose`, `venue-reject`. `venue-action-msg` (venues/page success banner).

## Primitives reality (verified — see [[task-s3-ui]] / [[task-s8-rating]])
- `Button` (ui/Button) spreads `...rest` → data-testid直書きOK; variant primary/secondary. `TextField` (ui/Field) takes `id`+spreads rest → data-testid OK; derives id from id/name.
- `StatusPill` (ui/StatusPill) takes ONLY {tone,glyph,children} — NO className/spread. `MultiAxisSummary` exported from ui/Stars {again,talk,manner,overall,count}.
- Admin clients live in `api-s3.ts` (fetchAdminMatch etc.) + `api-s2.ts` (fetchAdminSlots). There is NO `api-admin.ts`. `ApiCallError` is in `api.ts`.
- vitest include = `src/**/*.test.ts` ONLY (NOT .tsx) → component test files would NOT run; I added none (not required, would be dead).

## Verify (all PASS, self-run)
`rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` → TSC_RC=0 (no output).
`npm run test` → Test Files 21 passed (21), Tests 313 passed (313). Did NOT run dev/build/curl/Playwright (env rule). git: my 3 new files are untracked `??` (src/ is git-untracked here — verify by grep, see [[task-e2e-testids]]).
