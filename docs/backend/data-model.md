# データモデル設計 — matching-app (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ実体: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。マイグレーション実行・本実装はS1以降。DB: PostgreSQL (Vercel Postgres / Neon) + Prisma。
> 最終更新: 2026-05-30（殿の追加指示反映: 本人認証必須 / Stripe従量課金 / 評価・バッジ・限定イベント）

## 0. 設計原則（セキュリティ最優先 / master_plan §9）

- **PII最小権限・分離**: 識別子(User)・属性(Profile)・本人認証(IdentityVerification)・決済(Payment)を別テーブルに分け、参照範囲を絞る。機微情報(身分証・生年月日・写真)はマッチングに不要な経路から引かない。
- **PII最小保持**: 身分証画像は審査のための**一時保持**。**承認後に実体を削除**し `blobRef=null`/`imageDeletedAt` を記録する。年齢は保存せず `birthdate` から都度算出。連絡先(電話/メール)は**収集しない**(チャット無し・通知はLINE)。
- **暗号化前提**: 転送時=HTTPS必須、保存時=Neon/Blob の at-rest 暗号化。身分証 Blob はアクセス制限。
- **IDOR対策**: 全リソースは「所有者か」を入口で検証(後述 §6)。
- **カード非保持**: 決済は Stripe に委譲。`stripePaymentIntentId` 等の参照のみ保持(PCI負担減)。
- **チャット無し**: メッセージ系テーブルは作らない。
- **会場は運営手動**: 会場DB・予約連携なし。会場情報は `Match` に運営が直接入力。

## 1. モデル一覧（10モデル）

| # | モデル | 役割 | 主キー | 主要リレーション |
|---|--------|------|--------|------------------|
| 1 | `User` | LINEログインで一意化。識別子・権限・状態のみ。 | `id` (cuid) | 1:1 Profile / 1:1 IdentityVerification / 1:N Application / 1:N Payment / 1:N Badge / 1:N Rating(give/receive) / 1:N NotificationLog |
| 2 | `Profile` | マッチング属性 + 評価集計(ratingAvg/Count, attendedCount)。 | `id` | 1:1 User |
| 3 | `IdentityVerification` | 本人認証(身分証→目視審査→承認)。年齢確認兼用。**承認後に画像削除**。 | `id` | 1:1 User |
| 4 | `Slot` | 枠=日時×エリア。定員(既定3)。**参加条件(minAge/maxAge/requiresBadge)**。 | `id` | 1:N Application / 1:1 Match / 1:N Rating |
| 5 | `Application` | 応募。User×Slot。性別スナップショット。**paymentId(男性有料回)**。 | `id` | N:1 Slot / N:1 User / 1:1 Payment |
| 6 | `Match` | 成立。枠に1件。会場情報を運営が後入力。 | `id` | 1:1 Slot |
| 7 | `Payment` | **Stripe決済**。男性有料回のみ。¥2,000・初回無料・女性無料・不成立非課金。 | `id` | N:1 User / 1:1 Application |
| 8 | `Rating` | イベント後の相互評価(slot×rater×ratee)。 | `id` | N:1 Slot / N:1 User(rater) / N:1 User(ratee) |
| 9 | `Badge` | 優良バッジ(premium)。高評価×複数回参加で付与。 | `id` | N:1 User |
| 10 | `NotificationLog` | LINE通知ログ(監査・再送)。 | `id` | N:1 User |

## 2. 各モデルの責務・関連・インデックス

### 2.1 User
- **責務**: `lineUserId`(自然キー)で一意化。`role`(user/admin)、`status`(active/suspended/withdrawn)。
- **PII方針**: 機微属性を持たない。`lineUserId` はAPIレスポンス/JWT/ログに出さない。
- **関連**: Profile / IdentityVerification(各1:1)、Application / Payment / Badge / NotificationLog(1:N)、Rating は give/receive の2方向(named relation `ratingsGiven`/`ratingsReceived`)。退会時 `onDelete: Cascade`。
- **索引**: `@@index([role])`, `@@index([status])`。`lineUserId @unique`。

### 2.2 Profile
- **責務**: マッチング属性(`gender`/`birthdate`/`photoUrl`/`areaPref`/`bio`) + 評価集計(`ratingAvg`/`ratingCount`/`attendedCount`)。
- **設計判断**:
  - **年齢を保存しない**。`birthdate` から都度算出(陳腐化防止 + PII最小化)。18+判定と20代限定判定の双方に使う。
  - 評価集計はキャッシュ(正本は `Rating` 群)。Rating追加時に再計算。バッジ判定の入力になる `attendedCount`(成立・done参加の累計)も保持。
- **関連**: User(1:1)。索引: `@@index([gender])`。

### 2.3 IdentityVerification（本人認証 / 必須ゲート）
- **責務**: 公的身分証アップロード→運営目視審査→承認。`docType`、`status`(pending/approved/rejected)、`blobRef`(画像参照・一時)、`dobChecked`(確認補助)、`reviewedBy`/`reviewedAt`/`reviewNote`、`imageDeletedAt`。
- **ゲーティング**: **status=approved 以外は枠応募不可**(アプリ層で強制。詳細 [`matching-logic.md`](./matching-logic.md) §6, [`auth-flow.md`](./auth-flow.md))。
- **PII最小保持の要**:
  - 身分証画像は審査のための一時保持。**approved になったら実体を削除し `blobRef=null`、`imageDeletedAt` を記録**。
  - rejected でも再提出運用に応じて早期削除。番号類(マイナンバー等)は提出時にマスクを要請。
  - DBには「確認した事実」とメタのみ。番号・氏名等の生データは持たない。
- **年齢確認兼用**: 目視で18+を確認。生年月日の正本は Profile.birthdate(20代限定判定にも使用)。
- **関連**: User(1:1)。索引: `@@index([status])`(審査待ち抽出)。

### 2.4 Slot（枠 / 限定イベント対応）
- **責務**: 日時×エリアの開催枠。`datetimeStart`(UTC/JST)、`area`、`capacityPerGender`(既定3)、`status`。
- **参加条件(限定イベント)**: `minAge?`/`maxAge?`(例: 20代限定= minAge20,maxAge29)、`requiresBadge`(true=premium保有者のみ)。`feeMale`(男性参加費・既定2000)。
- **応募時判定**: 年齢が[minAge,maxAge]に入るか、requiresBadge なら premium 保有かを応募時にチェック。
- **関連**: Application(1:N) / Match(1:1) / Rating(1:N)。
- **索引**: `@@index([status, datetimeStart])`(募集中・日時順), `@@index([area, datetimeStart])`。

### 2.5 Application（応募）
- **責務**: User×Slot の参加表明。`gender`(応募時スナップショット)、`status`、`paymentId?`(男性有料回の決済参照)。
- **整合性**:
  - `@@unique([slotId, userId])` — 二重応募禁止。
  - `paymentId @unique` — 1応募:1決済(女性/初回無料は null)。
  - `gender` スナップショットで定員整合を安定化。成立判定はこの値を数える。
- **索引**: `@@index([slotId, gender, status])`(成立判定の主クエリ), `@@index([userId, status])`(マイ応募)。

### 2.6 Match（成立）
- **責務**: 成立枠1件の会場手配〜通知の進行。`status`(pending_venue→venue_set→notified/canceled)、会場情報、`confirmedAt`/`notifiedAt`。Slot:Match=1:1。
- **索引**: `@@index([status])`。

### 2.7 Payment（Stripe決済）
- **責務**: 男性の有料回の決済。`amount`(既定2000)、`currency`(JPY)、`isFirstFree`、`status`(PaymentStatus)、`provider`(stripe)、`stripePaymentIntentId`(pi_...)、`stripeCustomerId`、`paidAt`/`refundedAt`。
- **課金ルール(master_plan §2)**:
  - **女性=常に無料** → Payment を作らない。
  - **男性初回=無料** → `isFirstFree=true` で記録(amount実課金なし)。判定は「その男性に過去 succeeded Payment があるか」。
  - **不成立=課金しない** → 与信のみ確保し不成立で `canceled`、または成立後に課金(方式は [`payment.md`](./payment.md))。
- **非保持**: カード情報は持たない。Stripe の ID/状態のみ。
- **関連**: User(N:1), Application(1:1 逆参照)。索引: `@@index([userId, status])`, `@@index([status])`。`stripePaymentIntentId @unique`。

### 2.8 Rating（相互評価）
- **責務**: done になった Slot 後の相互評価。`slotId`/`raterId`/`rateeId`/`score`(1〜5)/`comment?`。
- **整合性**: `@@unique([slotId, raterId, rateeId])` — 同一イベントの同一相手への二重評価禁止。
- **集計**: Rating追加時に被評価者の Profile.ratingAvg/ratingCount を再計算(トランザクション or バッチ)。
- **関連**: Slot(N:1), User×2(rater/ratee, named relation)。索引: `@@index([rateeId])`, `@@index([slotId])`。

### 2.9 Badge（優良バッジ）
- **責務**: `type=premium`。`grantedAt`/`grantedBy`("system"=自動)/`criteriaSnapshot`(付与根拠JSON)。
- **整合性**: `@@unique([userId, type])` — 同種重複保有禁止。
- **用途**: Slot.requiresBadge の応募可否判定。付与ロジックは [`badge.md`](./badge.md)。
- **関連**: User(N:1)。索引: `@@index([type])`。

### 2.10 NotificationLog（通知ログ）
- **責務**: LINE送信の監査・再送。`type`(identity_approved/rejected, match_to_admin, payment_request, venue_to_member, slot_canceled, rating_request, badge_granted, reminder)、`status`、`payload`(JSON・PII最小)、`providerMessageId`、`error`。
- **緩い参照**: `slotId`/`matchId` は FK無しの文字列参照(ログ独立性)。
- **索引**: `@@index([userId, type])`, `@@index([type, status])`(failed再送抽出)。

## 3. 列挙値（enum）一覧

| enum | 値 |
|------|----|
| `Role` | user, admin |
| `UserStatus` | active, suspended, withdrawn |
| `Gender` | male, female |
| `Area` | ebisu, ikebukuro, ginza |
| `IdentityStatus` | pending, approved, rejected |
| `IdDocType` | drivers_license, passport, my_number_card, health_insurance, residence_card |
| `SlotStatus` | open, filled, confirmed, done, canceled |
| `ApplicationStatus` | applied, accepted, canceled |
| `MatchStatus` | pending_venue, venue_set, notified, canceled |
| `PaymentStatus` | created, requires_action, requires_capture, succeeded, canceled, refunded, failed |
| `NotificationType` | identity_approved, identity_rejected, match_to_admin, payment_request, venue_to_member, slot_canceled, rating_request, badge_granted, reminder |
| `NotificationStatus` | pending, sent, failed |
| `BadgeType` | premium |

## 4. 主要クエリと索引の対応（規模〜1千人）

| ユースケース | クエリの形 | 効く索引 |
|------------------|------------|----------|
| 枠一覧(募集中・日時順) | `Slot where status=open order by datetimeStart` | `Slot(status, datetimeStart)` |
| エリア絞り込み | `Slot where area=? order by datetimeStart` | `Slot(area, datetimeStart)` |
| 成立判定(性別ごと応募数) | `count(Application) where slotId=? group by gender` | `Application(slotId, gender, status)` |
| 二重応募防止 | unique insert | `Application(slotId, userId)` unique |
| マイ応募状況 | `Application where userId=?` | `Application(userId, status)` |
| 本人認証 審査待ち | `IdentityVerification where status=pending` | `IdentityVerification(status)` |
| 会場未定一覧(運営) | `Match where status=pending_venue` | `Match(status)` |
| 男性の課金履歴(初回判定) | `Payment where userId=? and status=succeeded` | `Payment(userId, status)` |
| 被評価者の集計再計算 | `Rating where rateeId=?` | `Rating(rateeId)` |
| バッジ保有チェック | `Badge where userId=? and type=premium` | `Badge(userId,type)` unique |
| 通知再送対象 | `NotificationLog where status=failed` | `NotificationLog(type, status)` |

## 5. 整合性・トランザクション境界（S1以降の実装指針）

- **応募**: `(slotId,userId)` unique + 「枠open」「定員未充足」「本人認証approved」「参加条件(年齢/バッジ)充足」「(男性)決済要否」をトランザクション内で確認。詳細 [`matching-logic.md`](./matching-logic.md)。
- **成立判定**: 応募確定の同一トランザクションで性別ごと applied 件数を数え、男女とも定員到達で `Slot.filled` + `Match` 作成。
- **決済**: 不成立時に課金しない方式(与信→成立でcapture、または成立後に課金)。[`payment.md`](./payment.md)。
- **評価集計**: Rating 追加時に Profile.ratingAvg/Count を再計算。`attendedCount` は done 確定時に加算。
- **バッジ付与**: 評価/参加の閾値到達で premium 付与(`@@unique` で冪等)。[`badge.md`](./badge.md)。
- **退会**: User削除で従属(Profile/Identity/Application/Payment/Badge/Rating)を Cascade。NotificationLog は監査要件次第で残す/匿名化(S7セキュリティレビュー)。

## 6. IDOR・アクセス制御（セキュリティ / 詳細は auth-flow.md §5）

- 全リソース取得/更新は「リクエスト者がそのリソースの所有者か」を入口で検証する。
  - Profile編集 / Application取消 / Payment参照 / Rating投稿: `resource.userId == session.userId`(または rater)。
  - Match(成立詳細)の会場情報: その Slot に accepted で参加している本人 or admin のみ。
  - IdentityVerification の画像(blobRef): 本人 + 審査中の admin のみ。承認後は削除済み。
- admin専用(枠作成/審査/会場確定/通知/バッジ付与)は `role=admin` を二重チェック。
- 連番IDを使わず cuid を採用(列挙攻撃の難化)。ただし cuid に頼らず必ず所有者検証する。
