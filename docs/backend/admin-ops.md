# 運営admin 運用フロー設計 (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS1(本人認証審査)〜S3(枠/会場/通知)、S6(バッジ)。
> 最終更新: 2026-05-30（本人認証審査 / 限定イベント条件設定 / バッジ運用を追加）

## 0. 方針

- 運営(admin)はアプリの根幹オペレーター: **本人認証審査・枠作成(条件設定)・成立確認・会場確定・通知・バッジ運用**。
- 全 admin API は `role=admin` 必須(認証+認可の二重チェック。[`auth-flow.md`](./auth-flow.md) §5)。
- admin 昇格はアプリ経由で行わない(DB直/シードで付与)。権限昇格の攻撃面を作らない。

## 1. 運営の主要オペレーション

```
① 本人認証審査(承認/却下)   ← 全ユーザーの利用前提(ゲート)
② 枠作成(条件設定: 20代限定/優良バッジ限定)
③ 成立枠の確認(男3女3が揃った枠)
④ 会場入力 & 確定(店名/URL/予約名/集合)
⑤ 通知送信(6人へLINE push)
⑥ バッジ運用(付与状況確認・例外的手動付与)
```

## 2. 各オペの詳細

### ① 本人認証審査（IdentityVerification / 必須ゲート）
- 一覧: `IdentityVerification where status=pending` を提出順で表示。
- 審査: 身分証画像を**目視**(本人+admin のみ閲覧可)。18歳以上・本人性を確認。
- 承認: `status=approved`, `reviewedBy/reviewedAt`, `dobChecked` → **Blob画像を削除** + `blobRef=null` + `imageDeletedAt` → `identity_approved` 通知。
- 却下: `status=rejected`, `reviewNote`(個人情報を含めない) → `identity_rejected` 通知 → 画像は早期削除。
- API: `GET /api/admin/identities?status=pending` / `PUT /api/admin/identities/:id`(approve/reject)。
- **重要**: 承認後の画像削除を必ず実行(PII最小保持)。削除失敗時はリトライ/アラート。

### ② 枠作成（Slot / 限定イベント対応）
- 入力: `datetimeStart`(JST→UTC), `area`(enum), `capacityPerGender`(既定3), `feeMale`(既定2000), 条件: `minAge?`/`maxAge?`/`requiresBadge`, `note?`。
- 出力: `Slot(open)`。
- API: `POST /api/admin/slots`(admin)。
- バリデーション: 未来日時 / area enum / capacity>=1 / minAge<=maxAge / feeMale>=0。
- 限定例: 20代限定= minAge20,maxAge29 / 優良限定= requiresBadge=true。

### ③ 成立枠の確認（filled の一覧）
- 一覧: `Slot where status=filled`(成立・会場未定)を日時順。各枠の `Match(pending_venue)` と応募者6人。
- トリガー元: 成立時に `match_to_admin` 通知。
- API: `GET /api/admin/slots?status=filled` / `GET /api/admin/matches?status=pending_venue`。
- 個人情報の最小表示: 性別・表示名・年齢・評価サマリ程度。**誕生日/lineUserId/身分証は出さない**。

### ④ 会場入力 & 確定（Match に会場を埋める）
- 入力: `venueName`(必須), `venueUrl?`, `reservationName`(必須推奨), `meetingPlace?`。
- 処理: `Match.status=venue_set`+`confirmedAt`、`Slot.status=confirmed`。
- API: `PUT /api/admin/matches/:id/venue`(admin)。
- バリデーション: venueName 必須。URL形式チェック+サニタイズ。確定前に通知文面プレビュー。

### ⑤ 通知送信（6人へ venue_to_member）
- 前提: `Match.status=venue_set` かつ会場必須が揃う。
- 処理: 6人へ push、`NotificationLog(venue_to_member)`、全員成功で `notified`/`notifiedAt`。詳細 [`notification.md`](./notification.md) §3。
- API: `POST /api/admin/matches/:id/notify`(admin)。
- 冪等: `notifiedAt` 済みは再送スキップ(明示再送のみ)。失敗分は再送可能。

### ⑥ バッジ運用（premium）
- 自動付与が基本([`badge.md`](./badge.md))。運営は付与状況を確認、例外時のみ手動付与。
- API: `GET /api/admin/badges?type=premium` / `PUT /api/admin/badges`(手動付与, `grantedBy=admin.userId`)。

### 補助オペ
- **中止**: `POST /api/admin/slots/:id/cancel` → `Slot/Match canceled` + 男性決済 cancel(未capture)/refund(capture済) + `slot_canceled` 通知。
- **開催完了**: `POST /api/admin/slots/:id/done` or 日時経過バッチ → `Slot.done` + 参加者 `attendedCount++` + `rating_request` 通知。

## 3. admin API 一覧（草案）

| メソッド | パス | 用途 | Sprint |
|----------|------|------|--------|
| GET | `/api/admin/identities?status=pending` | 本人認証 審査待ち | S1 |
| PUT | `/api/admin/identities/:id` | 承認/却下(承認時に画像削除) | S1 |
| POST | `/api/admin/slots` | 枠作成(条件設定) | S2 |
| GET | `/api/admin/slots?status=` | 枠一覧(状態フィルタ) | S2 |
| POST | `/api/admin/slots/:id/cancel` | 中止(決済 cancel/refund) | S3/S4 |
| POST | `/api/admin/slots/:id/done` | 開催完了(評価依頼) | S3/S5 |
| GET | `/api/admin/matches?status=` | 成立一覧 | S3 |
| GET | `/api/admin/matches/:id` | 成立詳細(応募者6人) | S3 |
| PUT | `/api/admin/matches/:id/venue` | 会場入力&確定 | S3 |
| POST | `/api/admin/matches/:id/notify` | 6人へ通知送信 | S3 |
| GET | `/api/admin/badges?type=premium` | バッジ付与状況 | S6 |
| PUT | `/api/admin/badges` | 手動付与 | S6 |

## 4. 運営ダッシュボードの状態ビュー（design-workerと擦り合わせ）

| ビュー | 内容 |
|--------|------|
| 本人認証 審査待ち(pending) | **要対応**。目視審査→承認/却下→画像削除。 |
| 募集中(open) | 各枠の男女応募数(例 男2/3・女3/3) + 条件(20代限定/優良限定)バッジ表示。 |
| 成立・会場未定(filled/pending_venue) | **要対応**。会場手配対象。 |
| 確定済(confirmed/venue_set) | 通知前。文面プレビュー→送信。 |
| 通知済(notified) | 送信完了。当日待ち。 |
| 完了/中止(done/canceled) | アーカイブ。done は評価フェーズ。 |
| バッジ | premium 付与状況。 |

## 5. 権限・セキュリティ（最優先）

- 全 admin API: セッション有効 + `role=admin`(入口で二重チェック)。
- **個人情報の最小表示**: 一覧/詳細で lineUserId・誕生日・身分証を出さない(年齢・表示名・評価は表示可)。身分証画像は審査画面のみ・承認後は削除済み。
- **監査**: 本人認証審査(`reviewedBy`/`reviewedAt`/`imageDeletedAt`)、会場確定(`confirmedAt`)、通知(`NotificationLog`)、バッジ付与(`grantedBy`/`criteriaSnapshot`)、決済(`Payment`)を記録。
- 入力サニタイズ: venueName/URL/note/reviewNote は XSS・インジェクション対策(Zod + エスケープ)。
- 重要操作(承認/確定/通知/中止/手動付与)はログで追跡可能に。総合レビューは S7 security-reviewer。
