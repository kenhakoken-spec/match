# 決済 拡張ポイント設計 (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ コア決済設計: [`payment.md`](./payment.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 最終更新: 2026-05-30
>
> **重要な変更**: 当初「決済はMVP外・後付け」だったが、殿の追加指示で **決済はMVPコア(S4)** に格上げされた。
> 従量課金(男¥2,000・初回無料・女無料・不成立非課金, Stripe)の本体設計は **[`payment.md`](./payment.md)** にある。
> 本書は「コア決済の**先**にある将来拡張(サブスク等)を、どこに差すか」を扱う。

## 0. 現状（MVPコアで実装するもの = payment.md）

- `Payment` モデルは `schema.prisma` に**正式採用済み**(コメントアウトではなく実モデル)。
- Stripe PaymentIntent / Webhook / manual capture / 初回無料判定 は [`payment.md`](./payment.md) で設計。
- 課金単位は **応募(Application)= 1イベント参加**。`Application.paymentId` で1:1紐付け。

## 1. 将来拡張の差し込みポイント

### (A) サブスク / 回数券（従量からの発展）
- 現状は「参加ごと従量」。リピーター向けに「月額で参加し放題/N回券」を後付けする余地。
- 差し込み: `Payment` に `kind`(one_time/subscription/ticket)列を追加 or 新 `Subscription` モデルを足し、応募ゲートの「決済要否」判定([`matching-logic.md`](./matching-logic.md) §4)で「有効なサブスク/残券があれば従量課金をスキップ」とする。
- Stripe 側は Subscription / Customer Balance を利用。自前DBは参照(ID/状態)のみ。

### (B) 女性・初回無料以外の割引（クーポン/プロモ）
- 差し込み: `Payment` に `discountCode`/`discountAmount` を足す、または `Coupon` モデル。
- 応募時に適用判定(初回無料と同様のゲート拡張)。Stripe Coupons/Promotion Codes に委譲も可。

### (C) 決済単位の変更（応募→成立 等）
- 現状の manual capture は「応募で与信→成立で確定→不成立で解放」。
- もし「成立してから課金(事後課金)」へ寄せる場合も、状態は `Payment.status`(requires_capture/succeeded/canceled)で吸収でき、Slot/Match の状態語彙は不変。切替は service 層の方式選択のみ。

### (D) 返金ポリシーの精緻化
- ドタキャン手数料/部分返金など。`Payment.status=refunded` + 金額差を `note`/追加列で表現。Stripe Refund API。

## 2. 設計上の不変条件（拡張しても守る）

- **カード情報を自前保持しない**(Stripe 委譲・PCI回避)。
- **不成立は課金しない**(どの方式でも維持)。
- **女性無料・男性初回無料**(基本ルール。割引はこの上に重ねる)。
- Webhook は署名検証 + 冪等。
- `Payment` への IDOR 禁止(本人のみ参照)。

## 3. 非対象（当面作らない）

- 自前のカード保持/決済処理(PCI DSS を負わない)。
- 会場側への支払い連携(会場は運営手動のまま)。
- 複雑な階層課金/ダイナミックプライシング。

## 4. 拡張時チェックリスト

- [ ] 新課金形態に応じた `Payment`/`Subscription`/`Coupon` の追加 + マイグレーション。
- [ ] 応募ゲートの「決済要否」判定に新ルールを反映。
- [ ] Stripe 側オブジェクト(Subscription/Coupon)の設定 + Webhook イベント追加。
- [ ] 返金/解約導線。
- [ ] security-reviewer による決済レビュー(署名/冪等/PII/IDOR)。
