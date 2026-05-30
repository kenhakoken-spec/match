# 決済設計 — Stripe 従量課金 (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS4。Stripe実キーは不要(テストキーで先行可)。
> 最終更新: 2026-05-30（殿の課金ルール反映）

## 0. 課金ルール（master_plan §2 / 確定事項）

| 対象 | 課金 |
|------|------|
| **女性** | **常に無料**(Payment を作らない) |
| **男性・初回参加** | **無料**(`isFirstFree=true` で記録、実課金なし) |
| **男性・2回目以降** | **¥2,000 / 1回参加**(`Slot.feeMale`、既定2000) |
| **不成立(3対3が揃わない)** | **課金しない**(与信解放 or キャプチャしない) |

- 「初回」= その男性ユーザーに過去 `status=succeeded` の Payment が**無い**こと。
- カード情報は**自前保持しない**(Stripe に委譲。PCI負担を負わない)。
- 通貨は JPY。金額は最小通貨単位(円)。

## 1. 採用フロー：成立トリガー方式（manual capture / 推奨）

「不成立時は課金しない」を確実に満たすため、**応募時に与信(authorize)だけ確保し、成立した瞬間にキャプチャ(capture=確定)** する manual capture 方式を採る。代替として「成立後に PaymentIntent を作って即時課金(事後課金)」も可。MVPは実装の堅牢性で選ぶ(下記 §4 比較)。

### 1.1 manual capture フロー（応募=与信 / 成立=確定）

```
[男性ユーザーが有料枠に応募]
  ① クライアントで応募意思 → POST /api/applications { slotId }
[server]
  ② 応募ゲート判定(本人認証/年齢/バッジ/定員) → OK
  ③ 初回判定: succeeded Payment 無し → 初回無料(Payment: isFirstFree=true, amount=0, succeeded相当で記録) → 応募確定(課金なし)
     有料の場合 ↓
  ④ Stripe PaymentIntent 作成:
       amount=2000, currency=jpy, capture_method='manual',
       customer=stripeCustomerId(あれば), metadata={ userId, slotId, applicationId }
     → Payment(created → requires_capture想定) を作成し stripePaymentIntentId 保持
  ⑤ client_secret をクライアントへ返す
[client]
  ⑥ Stripe Elements/PaymentSheet で与信(confirm)。3DS等は requires_action で処理
[server: Webhook]
  ⑦ payment_intent.amount_capturable_updated / requires_capture → Payment.status=requires_capture
[成立判定(応募TX or 直後)]
  ⑧ 男3女3 充足 → 各男性の PaymentIntent を capture
       → Webhook payment_intent.succeeded → Payment.status=succeeded, paidAt
  ⑨ 不成立のまま枠が canceled / 期限切れ → PaymentIntent を cancel
       → Payment.status=canceled (課金されない)
```

### 1.2 事後課金フロー（成立後に課金 / 代替）

```
成立(filled) → 男性へ payment_request 通知 → 男性が支払い(PaymentIntent 即時 capture) → 全員 succeeded で通知へ
未払いがいる → 通知保留 + リマインド。期限内未払いは運営判断(繰り上げ/中止)。
```
> 事後課金は「成立してから払う」ので納得感が高い反面、未払いによる成立保留の運用が増える。manual capture は応募時点で与信が取れ、成立で自動確定するため運用が軽い。**推奨は manual capture**。S4着手時に Stripe の挙動を確認し最終決定。

## 2. PaymentIntent パラメータ（要点）

```jsonc
// POST /v1/payment_intents (サーバー側・STRIPE_SECRET_KEY)
{
  "amount": 2000,
  "currency": "jpy",
  "capture_method": "manual",        // 成立までキャプチャしない(不成立で課金しない)
  "customer": "cus_...",             // 任意(リピート課金のカード再利用)
  "automatic_payment_methods": { "enabled": true },
  "metadata": {
    "userId": "<app user id>",
    "slotId": "<slot id>",
    "applicationId": "<application id>"
  }
}
```
- `metadata` に内部IDを入れ Webhook で突合(カード/個人情報は metadata に入れない)。
- `customer`(Stripe Customer)を使うと2回目以降のカード再利用がスムーズ。Customer 作成時も氏名/カードは Stripe 側保持(自前DBは `stripeCustomerId` のみ)。

## 3. Webhook 設計（POST /api/payments/webhook）

- **署名検証必須**: `Stripe-Signature` を `STRIPE_WEBHOOK_SECRET` で検証してから処理。
- **冪等**: 同一イベント重複受信に耐える(処理済みイベントIDの記録 or status 遷移の単調性で吸収)。
- 主なイベント → Payment.status 反映:

| Stripe event | Payment.status |
|--------------|----------------|
| `payment_intent.created` | created |
| `payment_intent.requires_action` | requires_action |
| `payment_intent.amount_capturable_updated` | requires_capture |
| `payment_intent.succeeded` | succeeded (+ paidAt) |
| `payment_intent.canceled` | canceled |
| `payment_intent.payment_failed` | failed |
| `charge.refunded` | refunded (+ refundedAt) |

## 4. 初回無料の判定（厳密化）

- 定義: 男性ユーザーに過去 `Payment.status == succeeded` が無ければ初回。
- 競合対策: 同時に2枠へ応募して両方無料になる事故を防ぐため、初回判定は**応募トランザクション内**で `SELECT ... FOR UPDATE` 相当(ユーザー行 or 専用ロック)で直列化する。あるいは「初回無料は1回だけ」を Payment 側の制約/集計で担保。
- 記録: 初回無料も `Payment(isFirstFree=true, amount=0)` を残すと「初回を消費した」事実が追え、判定が安定する(Payment を作らない設計だと判定が応募履歴依存になる)。**MVPは isFirstFree レコードを残す方式を推奨**。

## 5. 返金・中止

- **中止(成立後)**: 既に capture 済みなら `charge.refunded`→ `refunded`。未capture(与信のみ)なら cancel→課金されない。
- **応募取消(open中)**: 与信を cancel(課金されない)。
- 返金理由は `Payment.note`(個人情報/カード情報を含めない要約)。

## 6. セキュリティ / PII

- **カード情報を自前で受け取らない**: Stripe Elements / PaymentSheet / Checkout 経由。サーバーは PaymentIntent と client_secret のみ扱う。
- Webhook は署名検証必須・冪等。
- `metadata`/`note`/ログにカード番号・氏名・個人情報を入れない(内部ID/金額/状態のみ)。
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` は `.env`(git管理外)。`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` のみクライアント。
- 決済まわりは S4 完了後に **security-reviewer 必須**(署名/冪等/PII/IDOR=他人の Payment 参照禁止)。

## 7. 環境変数（.env / git管理外。テストキーで先行）

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 8. API 一覧（草案 / S4実装）

| メソッド | パス | 用途 |
|----------|------|------|
| POST | `/api/applications` | 応募(内部で男性有料回の PaymentIntent 作成→client_secret返却) |
| POST | `/api/payments/webhook` | Stripe Webhook(署名検証→Payment.status更新) |
| GET | `/api/payments/me` | 自分の決済履歴(IDOR: 本人のみ) |
| POST | `/api/admin/slots/:id/cancel` | 中止(未capture cancel / capture済 refund) |

## 9. テスト観点（S4 Vitest + Stripe test）

- 女性応募 → Payment 作成されない。
- 男性初回 → isFirstFree レコード(amount=0)で応募成立、課金なし。
- 男性2回目 → PaymentIntent(2000, manual)作成、与信。
- 成立 → capture → succeeded。
- 不成立/中止 → cancel(未課金) / refund(課金済)。
- Webhook 署名不正 → 拒否。重複イベント → 冪等(二重課金/二重反映なし)。
