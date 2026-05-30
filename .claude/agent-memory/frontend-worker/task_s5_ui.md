---
name: task-s5-ui
description: S5 相互評価 UI (U-15 list + detail, StarInput) — DONE; contract shapes, owned files, FALLBACK ids, design rules
metadata:
  type: project
---

# S5 相互評価 UI (DONE 2026-05-30)

U-15 相互評価: 評価可能イベント一覧 + 1イベントの同席者を 星(1-5)＋任意コメントで評価。
Built on the same S1-S4 design system. Backend (src/app/api/ratings/**) was ALREADY complete.

## FROZEN S5 contract — verified against src/lib/rating-types.ts + the route handlers
The api-contract-s5.md is a GUIDE; the routes are the TRUTH. Key gotcha: the GET routes
return BARE bodies, NOT enveloped:
- GET /api/ratings/pending → `PendingRatingDTO[]` (bare array; route does jsonOk(pending)).
  PendingRatingDTO = { slotId, datetime(ISO), area, members:[{userId, displayName}] }.
  Only done-Slots I attended where un-rated co-members remain; emptied slots drop off.
- GET /api/ratings/received/summary → `RatingSummary` = { avg, count } (bare).
- POST /api/ratings {slotId, rateeId, score(1-5 int), comment?(≤300)}:
  200 → { rating: RatingDTO, summary: RatingSummary }  (summary = ratee's updated agg).
  400 self_rate / invalid_score / validation_error; 403 forbidden (非参加 OR 非同席, merged);
  409 already_rated (二重). rater is ALWAYS the session sub — never send it in the body.
- RatingDTO = { id, slotId, rateeId, score, comment|null, createdAt(ISO) }.
- members are PII-minimal: userId + displayName ONLY (no gender/age/lineUserId).
- _dev-seed POST /api/ratings/_dev-seed exists (MOCK only, 404 in prod) to seed a done event.

## Files I own (created/edited)
- src/app/_lib/api-rating.ts: fetch helpers + re-declared S5 DTOs + `// FALLBACK` dummies.
  Exports fetchPendingRatings, fetchReceivedSummary, submitRating (returns SubmitRatingOutcome
  with errorCode), ratingErrorMessage(code)→friendly JA. FALLBACK: 2 pending events
  (slot_ebisu_done 5名, slot_ginza_done 4名), summary {0,0}, submit success on network fail only.
- src/app/ratings/page.tsx: U-15 list. GET pending, sort desc by datetime. Cards link to
  /ratings/{slotId}. testid `rating-list` (on the <ul> AND the empty-state <main> — only one
  renders), `rating-item` (each <li>). EmptyState glyph ★. Lead line states 任意/個別開示なし.
- src/app/ratings/[slotId]/page.tsx: U-15 detail. `use(params)`. Finds the slot in pending.
  Per-member StarInput("また会いたい") + optional comment TextArea(max 300, counter) + per-member
  send Button + footer 一括送信(`rating-submit`)/スキップ. Caption FIRST: 任意/個別開示なし/運営のみ確認.
  Overall satisfaction StarInput is LOCAL-only (not in schema, not sent). After send: fetch
  received summary, show StarSummary quietly. 409/400/403 → ratingErrorMessage on the card as a
  WARN block (orange), never danger/red. star-1..star-5 testids on the FIRST member only.
- src/components/ui/Stars.tsx: was StarSummary only (read-only). ADDED `StarInput` (interactive):
  native radiogroup, each star a `<label>` h-11 w-11 (≥44pt), ★/☆ shape + sr-only "N点" label +
  visible 未選択/N点 text (color not the only signal). Added "use client" + useId. testIdPrefix
  prop → `${prefix}-N` on the hidden radio. StarSummary unchanged in behavior.

## Did NOT touch (verified by find -newermt: 0 hits)
src/lib/**, src/app/api/**, prisma/** (backend-owned). Existing pages applications/mypage/
profile/browse/slots/admin/matches — untouched (評価導線の既存ページ追加は将軍が統合時に行う).

## FALLBACK ids for screenshots (api-rating.ts)
/ratings → 2 cards (恵比寿の会 5名, 銀座の会 4名). /ratings/slot_ebisu_done → 5 members
(リク/ユウ/ミナ/リカ/アヤ). /ratings/slot_ginza_done → 4 members. Any other slotId → "all done" card.

## Verification (all PASS)
`rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` rc0 (no output).
`npm run test` → 20 files, 188 tests passed (baseline maintained; rating.test.ts 12 tests was
already there from backend). Did NOT run dev/build/curl/Playwright (env rule — .next contention;
将軍 takes screenshots). See [[feedback-env-wsl]], [[task-e2e-testids]] (testid contract for qa).
