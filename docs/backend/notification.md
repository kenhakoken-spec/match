# 通知設計 — LINE Messaging API (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS3(会場通知)以降。LINE実トークンは不要(プレースホルダ+モックで先行)。
> アプリ内チャットは無し → 連絡は全て LINE push。
> 最終更新: 2026-05-30（本人認証/決済/評価/バッジ通知を追加）

## 0. 方針

- 連絡は **LINE Messaging API の push(公式アカ→ユーザートーク)** に一本化(master_plan)。宛先は `User.lineUserId`。
- 全送信を `NotificationLog` に記録(監査・再送)。**payload に過剰なPIIを入れない**(運用情報に限定)。
- 送信は外部I/O。**トランザクション外**で実行し、失敗は `status=failed` で残し再送可能にする。

## 1. 通知の種類（NotificationType）

| type | いつ | 宛先 | 目的 |
|------|------|------|------|
| `identity_approved` | 本人認証 承認時 | 本人 | 「承認されました。プロフィール登録へ」 |
| `identity_rejected` | 本人認証 却下時 | 本人 | 再提出の依頼(理由はPIIを含めない) |
| `match_to_admin` | 3対3 成立検知時 | 運営(admin) | 「成立。会場手配を」 |
| `payment_request` | (事後課金方式の)成立後 | 男性メンバー | ¥2,000 のお支払い案内(初回・女性は対象外) |
| `venue_to_member` | 運営が会場確定し送信 | 6人 | **本命**: 日時/エリア/店名/URL/予約名/集合 |
| `slot_canceled` | 中止時 | 該当応募者 | 中止のお知らせ |
| `rating_request` | done(開催完了)時 | 6人 | 相互評価のお願い |
| `badge_granted` | premium 付与時 | 本人 | 優良バッジ付与のお知らせ |
| `reminder`(将来) | 開催前 | 6人 | リマインド(MVP対象外) |

## 2. ペイロード設計

### 2.1 venue_to_member（成立→6人への会場通知 / 本命）

master_plan §3 step7「日時・エリア・店名・URL・予約名・集合場所」を網羅。

**メッセージ例(テキスト + ボタン)**:
```
🎉 合コンが成立しました！

📅 日時: 2026年6月14日(土) 19:00
📍 エリア: 恵比寿
🍽 お店: 〇〇ビストロ
🔖 ご予約名: 「マッチングアプリ・タナカ」
🧭 集合: 店前 18:50

当日はお気をつけてお越しください。
※キャンセルが必要な場合は運営までご連絡ください。
```

**LINE Messaging API リクエスト形(イメージ)**:
```json
{
  "to": "<lineUserId>",
  "messages": [
    { "type": "text", "text": "🎉 合コンが成立しました！\n\n📅 日時: 2026年6月14日(土) 19:00\n📍 エリア: 恵比寿\n🍽 お店: 〇〇ビストロ\n🔖 ご予約名: 「マッチングアプリ・タナカ」\n🧭 集合: 店前 18:50" },
    { "type": "template", "altText": "お店の詳細を見る",
      "template": { "type": "buttons", "text": "お店の詳細",
        "actions": [ { "type": "uri", "label": "予約ページ/地図", "uri": "<venueUrl>" } ] } }
  ]
}
```
> `venueUrl` 無しならボタン省略。Flex Message で見栄え向上可(S3でデザインと擦り合わせ)。

**NotificationLog.payload(内部・PII最小)**:
```json
{
  "kind": "venue_to_member",
  "datetimeStart": "2026-06-14T10:00:00.000Z",
  "area": "ebisu",
  "venueName": "〇〇ビストロ",
  "venueUrl": "https://...",
  "reservationName": "マッチングアプリ・タナカ",
  "meetingPlace": "店前 18:50"
}
```
> 宛先は `NotificationLog.userId` で表現。lineUserId・個人名は payload に残さない(店の予約名は運用情報として可)。

### 2.2 identity_approved / identity_rejected
```json
{ "kind": "identity_approved", "message": "本人確認が完了しました。プロフィールを登録して枠に応募できます。" }
{ "kind": "identity_rejected", "message": "本人確認ができませんでした。お手数ですが再度ご提出ください。" }
```
> 却下理由の詳細(書類の不備内容)は PII になり得るため push 本文には載せず、必要なら画面内で一般的な案内に留める。

### 2.3 payment_request（事後課金方式の場合のみ・男性メンバー）
```json
{ "kind": "payment_request", "slotId": "<id>", "amount": 2000, "currency": "JPY",
  "message": "成立おめでとうございます。参加費 ¥2,000 のお支払いをお願いします。" }
```
> manual capture 方式([`payment.md`](./payment.md) §1.1)を採る場合、応募時に与信済みのため本通知は不要(自動 capture)。事後課金方式の補助。

### 2.4 match_to_admin（成立→運営）
```json
{ "kind": "match_to_admin", "slotId": "<id>", "matchId": "<id>",
  "datetimeStart": "2026-06-14T10:00:00.000Z", "area": "ebisu",
  "message": "枠が成立しました。会場を手配してください。" }
```

### 2.5 slot_canceled（中止）
```json
{ "kind": "slot_canceled", "slotId": "<id>", "datetimeStart": "...", "area": "ebisu",
  "reason": "定員が揃わなかったため" }
```

### 2.6 rating_request（開催後 → 6人）
```json
{ "kind": "rating_request", "slotId": "<id>",
  "message": "先日はお疲れさまでした。同席した方への評価をお願いします。" }
```

### 2.7 badge_granted（premium 付与）
```json
{ "kind": "badge_granted", "badgeType": "premium",
  "message": "優良バッジが付与されました。特別な限定イベントに参加できます。" }
```

## 3. 送信フロー（venue_to_member 代表例）

```
[admin]「通知送信」→ POST /api/admin/matches/:id/notify (admin認証)
[server]
  1. Match を取得し status=venue_set / 会場必須(venueName)を検証
  2. 対象6人の Application(accepted) → User.lineUserId 取得
  3. 各 user:
       NotificationLog(venue_to_member, pending) 作成
       LINE push 送信
       成功: status=sent, providerMessageId, sentAt
       失敗: status=failed, error要約(本人情報を入れない)
  4. 全員 sent → Match.status=notified, notifiedAt=now
     一部失敗 → notified にせず失敗分を再送可能に残す
```

- **冪等性**: `Match.notifiedAt` 済みは再送スキップ(明示再送のみ)。`NotificationLog` で送信済み確認。
- **再送**: `status=failed` を対象に再送(管理画面ボタン/バッチ)。

## 4. 信頼性・運用

| 観点 | 方針 |
|------|------|
| 失敗時 | `NotificationLog(failed)`+error要約。応募/成立/決済はロールバックしない。 |
| 再送 | failed を抽出して再送(規模小のため手動再送で可)。 |
| レート/上限 | 〜1千人・1枠6通。LINEの月内無料数/上限は運用監視。 |
| 友だち未追加 | push は友だち追加前提。未追加だと送れない→オンボーディングで追加を促す。失敗(403)は failed 記録。 |
| Webhook | 受信(発話)は基本不要(チャット無し)。友だち追加イベント等は将来の余地。 |

## 5. PII・セキュリティ方針

- `payload` に **lineUserId / 誕生日 / 連絡先 / 本人確認情報 / カード情報を入れない**。運用情報(店名/日時/エリア/予約名/集合/金額)に限定。
- 宛先は `NotificationLog.userId`(アプリ内ID)で表現。lineUserId はログに残さない。
- 却下理由など PII になり得る詳細は push 本文に載せない。
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` は `.env`(git管理外)。ハードコード禁止。
- エラー文に外部APIの生レスポンス(個人情報を含みうる)をそのまま貼らない(要約のみ)。

## 6. 環境変数
```
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=
LINE_OFFICIAL_ACCOUNT_BASIC_ID=   # (任意) 表示/導線用
```
> 実値は殿が用意(master_plan §10。LINEは新規専用チャネル)。揃うまでは送信をモック(ログ出力)で先行。
