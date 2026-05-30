---
name: task-s3-ui
description: S3 UI (成立詳細 U-08 / admin 成立確認+会場入力+通知 A-04/A-05 / my-applications 成立 link) — DONE; contract, owned files, reused primitives
metadata:
  type: project
---

# S3 UI Implementation (DONE 2026-05-30)

成立(Match)以降: U-08 成立詳細(当日の案内所) / A-04 成立一覧 / A-05 会場入力&通知 /
U-07 マイ応募に成立リンク。Built on the same S1/S2 design system.

## DANGER MISTAKE I repeated (third time — STOP doing this)
I again wrote the whole client layer + pages from the TASK BRIEF's claimed component
list before reading real files. The brief said components were flat in src/components/
(Button/Field/Surface/StatusPill) and that types/datetime had MatchStatus/formatDateLongJa
— ALL WRONG. Cost a full rewrite. **ALWAYS read the real component + lib files first.**
The brief's component names are aspirational, not accurate.

## Real facts (verified)
- Primitives live in src/components/ui/ : Button/ButtonLink(variant, NO className, spreads ...rest),
  StatusPill(tone, glyph, children — glyph is the shape cue, never color-only),
  Card(tone "surface"|"sunken"|"accent", className — NO ...rest, NO data-testid → put testid
  on an inner element or wrap in a Link), TextField(label, required, hint, error; derives id
  from htmlFor/name; renders <input> 48px), ConditionChip. At src/components/ root:
  AppHeader(title, backHref, serif, right, progress), States(LoadingState/EmptyState/ErrorState),
  BottomTabs. EmptyState takes {glyph,title,body,action} NOT {message}.
- Helpers: src/app/_lib/datetime.ts → formatDateShort / formatTime / formatDateTime / startMillis
  (NO formatDateLongJa). slots-ui.ts → areaLabel, APPLICATION_STATUS_PILL, etc.
- Tokens (tailwind.config.ts): bg.base/surface/sunken, ink.900/700/500/300, accent.600/500/300/100,
  secondary.500/100, state.{info,success,warn,muted,danger}, trust, verified. NO custom CSS classes.

## FROZEN S3 contract — VERIFY against src/lib/{types,serializers}.ts + routes, NOT the .md
The api-contract-s3.md .md is a GUIDE and DIVERGES from the real backend. The .md (and a
prior FE pass that trusted it) invented `memberCount`, member `age`, `notifiedAt`, and a
`{results:NotifyResult[]}` notify shape — NONE exist. The 2026-05-30 re-impl reconciled
api-s3.ts + admin pages to the REAL shapes below (tsc rc0, 188 tests pass). ALWAYS read
src/lib/types.ts §S3 + src/lib/serializers.ts + the route handlers; they are the truth.
- MatchStatus = "pending_venue" | "venue_set" | "notified".
- members EVERYWHERE = { displayName, gender } ONLY (toMatchMemberDTO) — admin too, NO age.
- MatchDetailDTO (user, U-08): { id, slot:{datetimeStart,area}, status, venue|null, members[] }.
  serializer gates ONLY venue (notified-only); members ARE returned pre-notified. (Brief still
  asked to HIDE members until notified in U-08 UI — that's fine, stricter than API.)
- MatchSummaryDTO (/api/matches/mine): { id, slotId, slot, status, venueConfirmed }.
- AdminMatchSummaryDTO: { id, slotId, slot, status, matchedAt, filled:{male,female}, venue }.
  (NO memberCount — derive count = filled.male+filled.female.)
- AdminMatchDetailDTO: { id, slotId, slot:{...,capacityPerGender}, status, matchedAt,
  filled, venue, members:{displayName,gender}[] }. (NO notifiedAt.)
- Venue: { venueName, venueUrl:string|null, reservationName, meetingPlace:string|null }.
- Envelopes: GET /api/matches/mine→{items}; GET /api/matches/[id]→{match};
  GET /api/admin/matches→{ITEMS} (key is `items`, not `matches`); GET /api/admin/matches/[id]→{match};
  POST .../venue {venueName,venueUrl?,reservationName,meetingPlace?}→{match};
  POST .../notify→{match, notified:number} (NO per-member array — A-05 renders the 6 "送信済"
  rows from match.members + the notified count); POST .../complete→{slotStatus, attendedIncremented}
  (notified-only, 409 not_notified/already_done). venue POST 409s if notified/canceled; notify 409
  venue_not_set if pending_venue.
- Day-of 6 elements (design-system §4.5): 日時 / エリア / 店名 / 予約URL(link, target=_blank
  rel=noopener) / 予約名 / 集合. 絵文字最大1・販促トーン禁止.

## Files I own (created/edited) — current as of 2026-05-30 re-impl
- src/app/_lib/api-s3.ts: fetch helpers + re-declared S3 DTOs (reconciled to real backend, see
  above) + `// FALLBACK` dummies. Exports fetchMatch, fetchMyMatches, fetchAdminMatches,
  fetchAdminMatch, saveVenue, sendNotify, completeMatch + Outcome types.
- src/app/matches/[id]/page.tsx: U-08. client, `use(params)`. venue+members gated to notified.
- src/app/admin/matches/page.tsx: A-04 list. member count = filled.male+filled.female.
- src/app/admin/matches/[id]/page.tsx: A-05 roster (displayName/gender, NO age) + venue form +
  送信プレビュー + notify + 6 "送信済" rows (from members+notified count) + 開催完了(complete).
- src/components/slots/ApplicationCard.tsx: takes optional `match={id,venueConfirmed}` (NOT
  matchHref — the real prop is `match`). When accepted+match, root is a div with a "成立の詳細を
  見る →" Link to /matches/{match.id} + 会場決定/会場手配中 pill. Existing rows unchanged.
- src/app/(tabs)/applications/page.tsx: fetches /api/applications AND /api/matches/mine, builds a
  slotId→MatchSummaryDTO map, passes match={id,venueConfirmed} for accepted rows (falls back to
  slot.status==="confirmed" approximation if mine is empty).
- src/app/admin/layout.tsx: nav 成立確認 / 会場入力 → /admin/matches (枠管理 link intact).
- Did NOT edit src/app/_lib/types.ts or api-s2.ts (pristine).

## FALLBACK ids for screenshots (api-s3.ts)
- /matches/pending_venue|venue_set → that pre-notified state; any other id → notified (venue+6).
- /admin/matches → 3 rows (m_pending, m_venue_set, m_notified).
- /admin/matches/{id} → roster always; venue only if that id is notified/venue_set.

## Verification (all PASS)
tsc --noEmit: my files 0 errors (the only error is pre-existing qa-owned
e2e/lv4-core-loop.spec.ts:447 'slotCardCount', present at baseline before my work — confirmed by
stashing my files). next build EXIT=0, BUILD_ID present, all 3 new routes compiled
(/matches/[id], /admin/matches, /admin/matches/[id]). 6 mobile 375x812 SS in /tmp/s3-shots/,
all non-empty (24–96KB), incl. admin save+notify result flow. browser processes: 0 remaining.

## Screenshot harness that worked (see [[feedback-env-wsl]])
scripts/s3-capture.sh: PORT guard (abort if busy → avoids screenshotting a stale server, which
bit me once: leftover next dev on the port served old routes → /admin/matches 500), start next dev,
poll root, warmup all routes with curl, run scripts/s3-shots.cjs (CommonJS so `require("playwright")`
resolves), trap cleanup EXIT with `kill || true`. Launch via run_in_background + poll a verdict file
for DONE_MARKER. @playwright/test NOT installed but `playwright` + chromium browsers ARE.
