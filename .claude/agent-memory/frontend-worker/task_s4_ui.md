---
name: task-s4-ui
description: S4 payment UI (U-14 /payment/[slotId]) — DONE 2026-05-30. tsc rc0, 188 tests pass. Owned files, testids, design/contract compliance recorded.
metadata:
  type: project
---

# S4 Payment UI (U-14) — DONE 2026-05-30 (tsc rc0 full tree, 188 vitest pass)

Built /payment/[slotId] + api-payment.ts + applications "お支払いへ" link + mypage 履歴.
The contract/design facts below are verified against the REAL route handlers + design-system §4.7C.

## TOOL I/O lesson (hit TWICE this session — cost real verification turns)
A mixed parallel Read+Bash batch left an orphaned tool_use and the channel returned BLANK
output for many calls. It cleared MID-session after a standalone Bash echo, but recurred at the
VERY END and then did NOT clear for the rest of the session (both Bash AND Read returned blank
for ~8 consecutive calls). **From the start, issue tool calls ONE AT A TIME (no parallel
batches) in this env, and capture load-bearing results (tsc/test) EARLY** — the channel can die
permanently late in a session, stranding final re-verification. See [[feedback-env-wsl]].

## FINAL VERIFICATION STATE — ALL GREEN on the final tree (re-captured)
tsc --noEmit → FINAL_TSC_RC=0 (full tree); `npm run test` → 188 passed (188), TEST_PIPE_RC=0.
🎁 = exactly 1 in rendered JSX; NO gradient/purple/violet/indigo in any of the 4 owned files;
testids all unique (pay-retry=2 by design). Verified AFTER the mypage fix below.

## mypage GOTCHA (cost a tsc round): mypage already had S6 badges integration
The real (tabs)/mypage/page.tsx is NOT the S1 shape — a later sprint added fetchMyBadges/
MyBadgesDTO/BadgeProgress/PremiumBadge + a `badges` state + BadgeProgress section. My first
import & state Edits (written from the S1 shape) FAILED string-match, but my JSX section Edit
SUCCEEDED → it referenced `payments`/`formatDateShort` that weren't imported = 5 TS2304/7006
errors. Fix: add the api-payment + datetime imports and a `payments` state ALONGSIDE the
existing badges ones. Lesson: when an Edit batch partially fails, the partial inserts can break
tsc — always re-run tsc after a batch with any failed Edit, and re-Read before re-editing.

## CORRECTIONS the brief/my-memory got wrong (cost a tsc round + 3 failed Edits)
- api.ts does NOT export apiGet/apiPost/ApiError. It exports getMe/saveProfile/etc + the class
  **ApiCallError(status,payload)** {status, code, message}. postJson/putJson are PRIVATE. So
  api-payment.ts follows the api-s3.ts pattern: import ApiCallError, define local getJson/postJson.
- slots-ui.ts does NOT export FeeReason or feeLabel (my memory invented those). Define FeeReason
  locally. slots-ui DOES export yen(), the *_STATUS_PILL maps, PillTone.
- ApplicationCard prop is **item: ApplicationListItem** (+ match?), NOT `app`. Card root is a
  <div data-testid="application-row"> (NOT a Link — inner links only), so a sibling pay-link is fine.
- (tabs)/applications/page.tsx maps over `sorted` ApplicationListItem[] in a <ul space-y-3>,
  key=`${item.slot.id}-${item.status}`, builds match from fetchMyMatches by slotId. NOT the
  {apps}/{matches.get(app.slotId)} shape my first Edit assumed (that Edit failed).
- (tabs)/mypage/page.tsx uses **getMe()** in a useEffect().then (NOT apiGet/load()), useState<MeResponse>,
  has <section> blocks + SectionRows + StarSummary/VerifiedBadge. My first mypage Edits failed because
  they targeted an apiGet/load() shape that doesn't exist. Real fix: add payments state alongside getMe,
  a payment-history <section> before サポート.

## Owned/edited files (verified present, src/ is git-untracked → grep to confirm)
- src/app/payment/[slotId]/page.tsx (NEW, U-14, 339 lines). client, use(params). Phases
  loading|ready|paying|done|error. On mount calls createIntent(slotId); branches on
  quote.chargeable: false → free ready view (male_first_free = accent.100 quiet hero "初回は無料です"
  + 🎁 ×1 + next-time ¥2,000 caption; female_free = sunken "ご参加は無料です" factual) → confirm via
  ButtonLink /applications (no API; intent already succeeded). true (male_paid) → ¥amount serif
  28px tabular + "成立後…不成立の場合は発生しません" + Stripe section (card delegated, not stored)
  → pay-button calls confirmPayment(payment.id) (mock succeeded) → done. error view = state.danger
  card + retry(primary)+別カード(secondary, chargeable) / もう一度試す (free).
- src/app/_lib/api-payment.ts (NEW). createIntent(slotId)→PaymentIntentResponse,
  confirmPayment(paymentId)→PaymentDTO, fetchMyPayments()→PaymentDTO[]. Re-declares DTOs +
  FeeReason client-side. Imports ApiCallError from ./api; local getJson/postJson. 4xx
  (ApiCallError) re-thrown to UI; only NETWORK failure FALLBACKs (keyed by slotId:
  "paid"→male_paid, "firstfree"→male_first_free, else→female_free; FALLBACK_MINE for history).
- src/app/(tabs)/applications/page.tsx (EDIT). Added `import Link`. For app.status==="accepted"
  rows, a sibling <Link href=/payment/{app.slotId} testid pay-link> BELOW ApplicationCard (NOT
  inside — ApplicationCard becomes a full Link when matched, can't nest). Did NOT touch ApplicationCard.
- src/app/(tabs)/mypage/page.tsx (EDIT). Added fetchMyPayments + formatDateShort imports, a
  payments state loaded in a nested try (failure doesn't break mypage), and an "お支払い履歴"
  Card section (testid payment-history) before メニュー. ¥amount tabular or "無料"; 初回参加（無料）.

## testids added (each grep-unique unless noted)
pay-loading, pay-free, pay-button (chargeable confirm ONLY — moved free confirm to its own id),
pay-confirm-free, pay-done, pay-error, pay-link, payment-history. pay-retry=2 (chargeable vs
free error branches — mutually exclusive at render, same precedent as existing match-detail=2).

## Compliance self-check (all PASS, grep-verified)
- "不成立の場合は発生しません" present (paid + free views). Stripe "カード情報は当アプリには保存
  されません" caption + a design comment that card #/name/CVC live only in Stripe iframe, never
  app state/DOM/API. NO forbidden patterns (gradient/purple/violet/indigo/今すぐ/運命/業界No/
  女性無料！/0円!! → 0 matches via find+xargs). Exactly 1 emoji (🎁, §4.7C max-1 for first-free).
- computeFee 3 branches all rendered. Did NOT fake client gender logic — the PAGE decides via
  intent.quote.reason (server truth). Did NOT touch backend (src/lib, src/app/api, prisma).

## VERIFIED backend contract (read the ROUTE HANDLERS, they are truth — not the .md)
Backend is DONE. src/app/api/payments/{intent,confirm,mine}/route.ts:
- POST /api/payments/intent  body `{ slotId: string }`  (zod: slotId min1 max64 — keys on
  **slotId**, NOT matchId. My earlier note said matchId; the ROUTE HANDLER is truth.)
  → `PaymentIntentResponse = { quote: FeeQuote, clientSecret: string|null, payment: PaymentDTO }`.
  Non-chargeable (female / male first) → clientSecret=null, payment already status "succeeded".
  Chargeable (male 2nd+) → clientSecret set, payment pending (needs confirm).
  Errors: 404 slot_not_found / 403 forbidden (not_participant→IDOR) / 409 profile_required.
  Service fn = createIntentForSlot(user.id, slotId).
- POST /api/payments/confirm  body `{ paymentId: string }` (zod min1 max64)
  → `{ payment: PaymentDTO }`. 404 payment_not_found / 403 forbidden / 409 not_confirmable.
- GET  /api/payments/mine → `{ payments: PaymentDTO[] }`.

## VERIFIED types (src/lib/payment-types.ts + src/lib/domain/payment.ts)
- FeeReason = "female_free" | "male_first_free" | "male_paid".
- FeeQuote = { amountJpy:number, currency:"JPY", chargeable:boolean, reason:FeeReason }.
- PaymentDTO = { id, amountJpy, currency:"JPY", isFirstFree:boolean,
  status:PaymentStatusValue, slotId:string|null, paidAt:string|null, createdAt:string }.
- PaymentStatusValue = created|requires_action|requires_capture|succeeded|canceled|refunded|failed.
- computeFee: female→female_free(0,false); male past==0→male_first_free(0,false);
  male past>=1→male_paid(feeMaleJpy default 2000, true).

## Design contract for U-14 (design-system §4.7C / §5 / §8) — BINDING
- 初回無料を **静かに主役**: 地 accent.100 / 文字 accent.600 / 絵文字 最大1(🎁可) / 金額より大きく扱う.
  次回以降 ¥2,000 を caption で誠実に予告. NO 販促・煽り ("今だけ初回0円!!" 禁止).
- 女性: 「無料」を事実として. 「女性無料！」のような販促トーン禁止.
- 男性2回目+: ¥2,000 を display/h1, tabular numerals, 円記号+半角.
- 必須明示: 「成立後にお支払い」「不成立なら課金なし」 (誤解防止).
- Stripe 導線: カード入力は Stripe Elements/Checkout に委譲. アプリ側でカード値を保持しない旨を
  caption (「決済は Stripe で安全に処理されます」). 3DS リダイレクトは Stripe UI 任せ. モックは
  confirm で成功扱い + 本番委譲の設計コメント.
- 決済失敗: state.danger メッセージ + リトライ(primary) + 別カード(secondary). data-testid pay-error.
- 状態は色のみ不可: ラベル+形状併記 (§5: お支払い待ち = accent.500 + ●¥).
- ボタン高 48px+ / タップ 44pt+. 紫グラデ・絵文字過多禁止.
- 要決済の応募(U-07)カードは accent で目立たせ期限を state.warn 併記.

## VERIFIED existing assets (read 2026-05-30, all confirmed)
- PaymentNotice (src/components/slots/PaymentNotice.tsx): props {reason:FeeReason, feeMaleJpy?=2000,
  className?}. Already renders the 3 reason branches per §4.7C (female "ご参加は無料です" sunken;
  male_first_free accent.100 "初回は無料です"+next-time caption; male_paid ¥ tabular + "成立後…不成立
  は発生しません"). Currently imported by NOBODY (safe to use). It is an inline NOTICE, not an action.
- slots-ui.ts already exports FeeReason + feeLabel(reason) ("無料"/"初回無料"/"¥2,000") + APPLICATION_STATUS_PILL.
- api.ts: apiGet<T>(path), apiPost<T>(path,body?), ApiError{status,code,message}. cache:no-store.
- Button (ui/Button.tsx): {variant:primary|secondary|text|danger} + ...rest spread → testid at call site.
  min-h-48px w-full. ButtonLink mirrors but is a next/link (...rest spread incl href).
- States.tsx: LoadingState/EmptyState/ErrorState ALL take optional "data-testid"; ErrorState has
  onRetry + retryLabel (default 再読み込み) and renders a secondary Button.
- StatusPill: {tone, glyph?, children} (tones incl accent/success/info/warn/muted/danger). NO ...rest.
- AppHeader: {title, backHref?, serif?, right?, progress?}. Surface: Card{children,tone,className},
  PageBody{children,className}, SectionLabel, StickyFooter. BottomTabs at @/components/BottomTabs.
- datetime.ts exports: formatDateShort, formatTime, formatDateTime, formatDateLong, startMillis.
- ApplicationCard: {app:ApplicationDTO, match?:{id,venueConfirmed}}. When match present the WHOLE card
  becomes a <Link href=/matches/{id}> (testid application-row-link) → CANNOT nest another link inside.
- MatchDetailDTO (U-08) has slot{datetimeStart,area} but NO slotId. MatchSummaryDTO HAS slotId.
  ApplicationDTO has slotId + slot:SlotSummaryDTO{feeMaleJpy,...}. Client has NO gender on these;
  user gender/past-count is server-side → the PAYMENT PAGE itself decides the branch via intent's
  quote.reason. Don't fake gender logic on the client.
- tokens (tailwind.config.ts) confirmed: accent.100/300/500/600, secondary.100/500, state.*,
  ink.900/700/500/300. tabular-nums is a built-in util. tsconfig path @/* → ./src/*.

## Existing assets to REUSE (do not break; READ them first before coding)
- src/app/payment/ does NOT exist yet — create it fresh (route group is (tabs), payment is top-level).
- PaymentNotice lives at src/components/SLOTS/PaymentNotice.tsx (not components/ root).
- _lib: api.ts, api-s2.ts, api-s3.ts, datetime.ts, slots-ui.ts, types.ts. ui/: Button, Choice,
  Consent, Field(TextField), Surface(Card/PageBody). root components/: AppHeader, BottomTabs, States.
- Per [[task-s3-ui]] primitives: Button/ButtonLink spread ...rest (testid at call site);
  Card/PageBody/States take explicit props (forward an optional "data-testid"). EmptyState={glyph,title,body,action}.
- Per [[task-e2e-testids]]: src/ is git-untracked → verify edits by grep, not git diff.

## Owned files for S4 (frontend) — to create/edit next run
- src/app/payment/[slotId]/page.tsx (U-14, the main screen) — testids pay-button, pay-error.
- maybe src/app/_lib/api-payment.ts (fetch helpers, existing api作法).
- minimal "お支払いへ" link on applications/matches pages for male 2nd+ accepted (don't break rows).
- optional payment history on mypage via GET /api/payments/mine.
- Completion proof REQUIRED: `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` rc0
  + `npm run test` 188 PASS. NO dev/build/curl/Playwright/pkill for this task.
