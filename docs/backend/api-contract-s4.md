# S4 API契約（凍結） — 決済（Stripe・男¥2000・初回無料・女無料・不成立非課金）

正典: [`../00_master_plan.md`](../00_master_plan.md)。schema の `Payment` を使用（migration不要）。Stripeは**テストキー/モック先行**。
**並行実装の鉄則**: 共有 `src/lib/types.ts` / `repo/memory.ts` / `repo/index.ts` / `domain/index.ts` は**触らない**。専用ファイルで完結し、既存エンティティ更新が要る配線は開発将軍が統合時に行う。

## 0. ビジネスルール（厳守）
- 女性: **常に無料**（Payment作らない or amount=0 で非課金記録）。
- 男性: **初回参加は無料**、2回目以降 **¥2,000/回**。
- 「初回」= そのユーザーの過去の **accepted/done 成立参加が0回**。
- **不成立時は課金しない**（PaymentIntentを capture しない/cancel）。成立確定後にのみ確定課金。

## 1. 純関数（`src/lib/domain/payment.ts` + `payment.test.ts`・vitest必須）
```ts
type FeeInput = { gender: "male"|"female"; pastAcceptedCount: number; feeMaleJpy: number };
computeFee(input: FeeInput): { amountJpy: number; chargeable: boolean; reason: "female_free"|"male_first_free"|"male_paid" };
// female → {0,false,female_free} / male & past==0 → {0,false,male_first_free} / male & past>=1 → {feeMaleJpy,true,male_paid}
```
境界テスト: female(past0/past3), male past0(初回無料), male past1(課金), feeMale既定2000。

## 2. Stripeモック（`src/lib/stripe-mock.ts`）
- `MOCK_PAYMENT`（既定: STRIPE_SECRET_KEY未設定 or 非production で true）時は PaymentIntent をローカルで擬似発行（id `pi_mock_xxx`, client_secret, status遷移）。実Stripeは後で差し替え（TODOコメント）。カード値は保持しない。

## 3. エンドポイント（`src/app/api/payments/**`, `src/app/api/webhooks/stripe/**`）
| Method | Path | 説明 |
|---|---|---|
| POST | `/api/payments/intent` | 自分の成立(Match)に対し決済intent作成。computeFeeで非課金なら即「確定」、課金対象のみPaymentIntent発行 |
| POST | `/api/payments/confirm` | （モック）支払い成功化→Payment=succeeded→参加確定 |
| GET | `/api/payments/mine` | 自分の支払い履歴 |
| POST | `/api/webhooks/stripe` | （モック）webhook受け口。署名検証の枠だけ用意（実検証はTODO）。succeededでPayment更新 |
- 認可: 自分のMatch/Paymentのみ（IDOR防止・セッションsubで解決）。他人のPayment操作不可。
- 課金は男性・非初回・成立確定済のみ。女性/初回intentは「課金不要・確定」レスポンス。

## 4. 専用型（`src/lib/payment-types.ts`）
`PaymentDTO`（id, amountJpy, currency, isFirstFree, status, slotId）, `FeeQuote`（amountJpy, chargeable, reason）。**types.ts には追記しない**。

## 5. ファイル所有（S4 backend）
- 所有: `src/lib/domain/payment.ts`(+test), `src/lib/stripe-mock.ts`, `src/lib/payment-types.ts`, `src/lib/repo/payment-repo.ts`(Payment用 in-memory Map をこのファイル内に持つ＋prisma実装は実DB未検証コメント), `src/app/api/payments/**`, `src/app/api/webhooks/stripe/**`。
- **読み取りのみ可**: 既存 Match/Application/Profile（getRepo経由で参照）。
- **触らない**: types.ts / repo/memory.ts / repo/index.ts / domain/index.ts / 他スプリントのファイル / frontend(src/app配下のページ, _lib, components)。
- repo/index.ts への payment-repo 配線は**開発将軍が統合時に**行う（あなたは payment-repo.ts を export するだけ）。

## 6. 完了条件（実証）
- `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` で **自分の所有ファイルにエラー0**（他所有の既存エラーは切り分け報告）。
- `npm run test` で payment 純関数テスト全PASS（実数）。既存テストを壊さない。
- curl（1スクリプト内に起動→実行→停止||true、PORT=3404）: 男性2回目で intent→課金¥2000→confirm→succeeded / 男性初回 intent→非課金確定 / 女性 intent→非課金確定 / 他人のPayment操作→403。各 status+JSON。
- **kill系は必ず1スクリプト内で `|| true`。pkill/fuserを単独ツールや他コマンドと混ぜない（この環境はexit144で巻き添えキャンセル）**。
