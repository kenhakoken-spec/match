# matching-app マスタープラン（開発将軍）

> 合コン型グループマッチング on LINE — 東京・3対3・チャットなし・運営会場手配型・本人認証必須

本書は本プロジェクトの**唯一の正典（source of truth）**である。各Workerは着手前に必ず本書を読むこと。
**最終更新: 2026-05-30（殿の追加指示を反映: 本人認証必須 / Stripe従量課金 / 評価・バッジ・限定イベント）**

---

## 1. コンセプト

東京の主要エリアで、**男女3人ずつ計6人**がリアルに集まる「合コン型」グループマッチング。
**LINE上で動くアプリ（LIFF）**。アプリ内チャットは持たない。運営が会場を手配し、6人へ通知して当日集合する。

- **ターゲット**: 20代後半〜30代後半。スマホ前提。
- **イメージ**: 最近の DINE（新）系の体験感。
- **思想**: 簡易・軽量。ただし**本人認証とセキュリティは妥協しない**。

## 2. 確定事項（殿ヒアリング結果 / 2026-05-30）

| 項目 | 決定 |
|------|------|
| ジャンル | 合コン型グループマッチング（3対3＝6人） |
| エリア | 東京主要エリア（恵比寿・池袋・銀座 など）※初期は限定 |
| プラットフォーム | **LINE（LIFF）** / ホスティング **Vercel** |
| マッチング方式 | **運営が枠＝「日時×エリア」を用意**。ユーザーは応募のみ |
| チャット | **なし**（一切作らない） |
| 会場 | **運営が手動で決定**。成立後に「店名・予約URL・予約名」を6人へLINE通知。会場DB・予約連携なし |
| **本人認証** | **必須**。公的身分証アップロード→運営目視確認→承認。**年齢確認(18+)を兼ねる**。未認証は応募不可 |
| **決済** | **Stripe**・従量課金。**男性=1回参加ごと¥2,000、ただし初回参加は無料**。**女性は常に無料** |
| **評価** | イベント後に参加者同士で相互評価。高評価が複数回蓄積した人へ**優良バッジ**を付与 |
| **限定イベント** | 枠に参加条件を設定可能（例: **20代限定**、**優良バッジ限定**） |
| **セキュリティ** | **最優先**。security-reviewer必須、PII最小権限・暗号化・最小保持 |
| 規模 | 小規模（〜1千人） |
| デザイン | "AIっぽさ"を排した、温かく編集的な世界観 |
| 優先度 | コア体験をしっかり、ただし簡易に |

## 3. コアループ

```
0. LINEログイン → 本人認証（身分証アップロード）＋年齢確認 ※必須・初回のみ
1. プロフィール登録（性別・生年月日・写真・希望エリア）
2. 枠一覧を見る（運営が用意した 日時×エリア。条件付き枠あり: 20代限定 / 優良バッジ限定）
3. 応募（条件を満たす場合のみ。男3/女3の枠に入る）
4. 3対3が揃う＝成立
5. 男性は ¥2,000 決済（初回は無料）/ 女性は無料
6. 運営が会場を決定（店名・予約URL・予約名 を入力）
7. 6人へLINE通知（日時・エリア・店名・URL・予約名・集合場所）
8. 当日集合（チャットなし）
9. イベント後、参加者を相互評価 → バッジ判定
```

## 4. スコープ

- **MVPコア（S1〜S4）**: LINE認証 / 本人認証・年齢確認 / プロフィール / 枠閲覧・応募（20代限定対応）/ 成立判定（3対3）/ 運営admin / LINE通知 / 決済（男¥2,000・初回無料・女無料, Stripe）
- **拡張（S5〜S6）**: 評価システム / 優良バッジ / 優良バッジ限定イベント
- **OUT（作らない）**: 自前チャット / 店予約連携 / レコメンド / 複雑検索

## 5. 技術スタック

| 層 | 採用 | 理由 |
|----|------|------|
| アプリ本体 | Next.js (App Router) + TypeScript + Tailwind | Vercel最速・スマホ最適 |
| LINE連携 | LIFF (@line/liff) | LINE内で動くWebアプリの標準 |
| 認証 | LINEログイン | パスワード管理が消える＝PIIリスク激減 |
| 本人認証 | 身分証アップロード→運営目視確認（MVP） | 小規模＆運営手動運用に最適。将来eKYC（TRUSTDOCK等）へ差し替え可 |
| 通知 | LINE Messaging API（公式アカ push） | 成立・会場案内をLINEトークへ直送 |
| 決済 | **Stripe**（PaymentIntent） | 従量課金。カード情報を自前保持しない（PCI負担減） |
| サーバー | Next.js Route Handlers / Server Actions（Vercel） | 別サーバー不要 |
| DB | Vercel Postgres（Neon）+ Prisma | Vercel完結・Docker不要・小規模に十分 |
| 画像/身分証 | Vercel Blob（アクセス制限） | プロフィール写真。身分証は承認後削除 |
| テスト/デプロイ | Vitest + Playwright / Vercel | レビュー4レベル準拠 |

## 6. データモデル（草案 / backend-workerが確定）

- **User**（id, lineUserId, role: `user`|`admin`, status, createdAt）
- **Profile**（userId, gender, birthdate, photoUrl, areaPref[], bio, ratingAvg, ratingCount）
- **IdentityVerification**（id, userId, docType, status: `pending`|`approved`|`rejected`, reviewedBy, reviewedAt, blobRef ※承認後に画像削除＝PII最小化）
- **Slot（枠）**（id, datetimeStart, area, capacityPerGender=3, minAge?, maxAge?, requiresBadge?, status: `open`|`filled`|`confirmed`|`done`|`canceled`）
- **Application（応募）**（id, slotId, userId, gender, status: `applied`|`accepted`|`canceled`, paymentId?）
- **Match（成立）**（id, slotId, confirmedAt, venueName, venueUrl, reservationName, status）
- **Payment**（id, userId, applicationId/slotId, amount=2000, currency=`JPY`, isFirstFree, stripePaymentIntentId, status）※女性・初回は課金なし。不成立時は課金しない
- **Rating**（id, slotId(event), raterId, rateeId, score, comment?, createdAt）→ Profile.ratingAvg/Count に集計
- **Badge**（id, userId, type: `premium`(優良), grantedAt, criteriaSnapshot）
- **NotificationLog**（id, userId, type, payload, sentAt）

## 7. 画面（草案 / design-workerが確定）

- **ユーザー**: ログイン/オンボーディング → **本人認証（身分証アップロード／審査中／承認・却下）** → プロフィール登録・編集 → 枠一覧（条件バッジ表示）→ 枠詳細・応募（条件不足時は応募不可UI）→ **決済（男性のみ・初回無料明示／女性は無料表示）** → マイ応募状況 → 成立詳細（会場情報）→ **イベント後評価** → マイページ（評価サマリ・**優良バッジ**表示）
- **運営admin**: **本人認証審査（承認/却下）** → 枠管理（作成・**条件設定: 20代限定/優良バッジ限定**）→ 成立枠の会場入力・確定・通知送信 → バッジ付与状況

## 8. 法令・本人確認（最優先）

- 「インターネット異性紹介事業（出会い系規制法）」に該当する可能性が高い。届出・年齢確認が必要になり得る。
- **本人認証＝必須**: 公的身分証アップロード→運営目視確認→承認。これで**年齢確認(18+)も兼ねる**。生年月日は20代限定イベント判定にも使用。
- 身分証画像は**アクセス制限付きストレージに保管し、承認後は削除**（PII最小化）。
- **未認証ユーザーは枠応募不可**（ゲーティング）。

## 9. セキュリティ方針（最優先）

- 認証・プロフィール・決済・通知の各変更後に **security-reviewer 必須**。
- PII（身分証・生年月日・写真・連絡先）は最小権限・暗号化・最小保持。
- 決済は Stripe にカード情報を委譲（自前で保持しない）。サーバー側で PaymentIntent を管理。
- IDOR・権限昇格・他人プロフィール/他人の成立情報への不正アクセスを重点チェック。
- 認証情報・APIキーは `.env`（git管理外）。ハードコード禁止。

## 10. 外部依存（殿が用意 / 開発将軍が手順提供）

- **LINE Developers**: 既存「モーニングレポート」とは**別の新規専用チャネル**。LINEログイン＋公式アカウント＋LIFF ID（Channel ID / Channel Secret）。→ 殿のLINEアカウントでの作成が必要。**作成までは env プレースホルダ＋モックで先行実装**。
- **Stripe**: アカウント＋APIキー（S4で必要）。テストキーで先行可。
- **Vercel / Neon**: デプロイ＆DB（開発将軍が構成）。

## 11. スプリント

| Sprint | 内容 | 主担当 | 完了の実証 |
|--------|------|--------|-----------|
| **S0 設計** | 画面・デザイン / スキーマ・認証・通知・決済・評価・バッジ・運営フロー | design + backend | 設計docs＋prisma validate PASS |
| **S0' レビュー** | 開発将軍が全件レビュー＋殿の設計承認 | 開発将軍 | レビュー記録＋承認 |
| **S1 認証+本人認証+プロフィール** | LINEログイン、本人認証/年齢確認、プロフィールCRUD、写真アップ | backend + frontend | curl/test＋SS＋security |
| **S2 枠** | 枠一覧・応募（20代限定対応） | backend + frontend | API実出力＋SS |
| **S3 成立+運営admin+通知** | 3対3成立、運営の会場確定、LINE push | backend + frontend | 成立testパス＋実push |
| **S4 決済** | Stripe（男¥2,000・初回無料・女無料） | backend + frontend | テスト決済成功ログ＋security |
| **S5 評価** | イベント後の相互評価・集計 | backend + frontend | 評価test＋集計確認 |
| **S6 バッジ+限定** | 優良バッジ付与＋優良バッジ限定イベント | backend + frontend | バッジ付与test＋条件枠動作 |
| **S7 QA+セキュリティ** | E2E通し＋総合セキュリティレビュー | qa + security | Playwright通過＋Critical脆弱性0 |

## 12. レビュー方針

- 実装者とレビュアーを分離する。
- docs-only 以外は qa（qa-worker / qa-tester）で**4レベル**（構文/実動作/デプロイ/E2E）検証する。
- 認証・プロフィール・決済・通知の変更後は **security-reviewer 必須**。
- 偽の成功報告は最重大違反。完了報告には実証（コマンド出力・SS・実数）を添える。
