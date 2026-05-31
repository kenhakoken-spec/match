# rendez 本番投入前 TODO（リリースチェックリスト）

最終更新: 2026-05-31 / 作成: 開発将軍（Dev-Shogun）

このドキュメントは **MVP（S0〜S7）＋ S8追加機能** を実装し終えた現在地から、**実サービスへ本番投入する前にやるべき作業**を、実コードの根拠（`file:line`）付きで精緻化したものです。

> **現在の状態**: tsc rc0 / 単体テスト 313 passed / 本番ビルド green / セキュリティ CRITICAL 0・HIGH 0。
> **ただし全外部サービスはモックで動作中**（`MOCK_AUTH` / `MOCK_DB` / `MOCK_NOTIFY` / `MOCK_AI`）。下記は「モックを実物に差し替える」＋「本番でだけ問題になるセキュリティ前提を固める」作業です。**現状はモックのため実害はありません。**

## 設計の安全装置（前提）

すべてのモックは **`NODE_ENV==="production"` で物理的に無効化**されます（`src/lib/env.ts:30` `mockFlag()` フェイルクローズ）。つまり本番では「実装し忘れたまま動いてしまう」ことがなく、**未実装の経路は throw して止まる**設計です（例: LINE実検証未実装 → 503 / Haiku未実装 → 明示エラー）。本TODOはその「throw する穴」を実装で塞ぐ作業に相当します。

---

## フェーズ A：外部サービス接続（モック → 実物）

実クレデンシャルを `.env.local`（本番は Vercel 環境変数）に入れ、各モックを実実装へ差し替える。`.env.example` が必要キーの一覧。

### A-1. データベース（in-memory → Vercel Postgres / Neon） 🔴必須
- **現状**: `MOCK_DB=1` で in-memory リポジトリ（`src/lib/repo/memory.ts`）。本番は `src/lib/repo/prisma-repo.ts` に切替（`src/lib/env.ts:39`）。
- **作業**:
  - [ ] Vercel Postgres(Neon) を作成し `DATABASE_URL` / `DIRECT_URL` を設定（`.env.example:16-17`）。
  - [ ] `./node_modules/.bin/prisma migrate deploy` でスキーマ適用（**実DBに対する migrate は未実施**＝ローカルは `prisma validate`/`generate` のみ確認済）。
  - [ ] seed投入（`prisma/` のseed相当を実DBへ）。
  - [ ] prisma-repo の実DB結線を実データで一通り検証（応募→成立→決済→通知→評価→バッジ）。
- **受入条件**: `MOCK_DB` 未設定で全コアループが実DB上で通る。

### A-2. LINE Login / LIFF（実トークン検証の実装） 🔴必須・SEC-002
- **現状**: `src/lib/auth/line-mock.ts:78` `realVerify` が**未実装で throw**（`LineVerificationUnavailableError` → 503）。本番でなりすましを防ぐためモックへフォールバックしない設計（`src/app/api/auth/line/route.ts:3`）。
- **作業**:
  - [ ] LINE ID トークンの**実検証**を実装：署名検証・`aud`=Channel ID・`iss`=`https://access.line.me`・`exp` 期限の確認（`src/lib/auth/line-mock.ts:63-79` のTODO箇所）。
  - [ ] `NEXT_PUBLIC_LIFF_ID` / `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` を設定（`.env.example:20-22`）。※ secret は `.env.local`/Vercel のみ、コミット厳禁。
- **受入条件**: 実モードで正規トークンは認証成功・改竄/期限切れは 401。`security-fix.test.ts` の SEC-002 系が実検証版でも通る。

### A-3. LINE Messaging API（通知の実送信） 🔴必須
- **現状**: `MOCK_NOTIFY=1` でログのみ（`src/lib/notify-mock.ts`）。本番は実送信（`src/lib/env.ts:41`）。会場確定時に6名へ店名/予約URL/予約名を通知する経路。
- **作業**:
  - [ ] LINE公式アカウント（Messaging API チャネル）を作成（**→ 殿の手動作業。下記「殿の作業」参照**）。
  - [ ] `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` / `LINE_MESSAGING_CHANNEL_SECRET` を設定（`.env.example:25-26`）。
  - [ ] notify 実装を実 push message API へ差し替え。
- **受入条件**: A-05 会場入力＆通知送信 → 実際に6名のLINEへ届く。

### A-4. Vercel Blob（プロフィール写真 / 身分証画像） 🔴必須・SEC-005/006関連
- **現状**: `src/lib/blob-mock.ts`。身分証は承認後に削除する設計（`blob-mock.ts:4`）。
- **作業**:
  - [ ] `BLOB_READ_WRITE_TOKEN` を設定（`.env.example:29`）。アクセス制限付きBlobへ差し替え。
  - [ ] **SEC-005**: アップロードを MIME 申告依存でなく**マジックバイト検証**（空 type 素通り防止）。
  - [ ] **SEC-006**: 身分証 `blobRef` の**所有者バインド**（submit が任意 blobRef を受理しないよう、アップロード者とひも付け）。
- **受入条件**: 不正ファイル拒否・他人の blobRef 流用不可・承認後に画像実削除。

### A-5. Stripe（決済 / ドタキャン罰金の実課金） 🔴必須
- **現状**: モック確定（`src/app/payment/[slotId]/page.tsx:73`）。Webhook 署名検証は枠だけ（`src/app/api/webhooks/stripe/route.ts:3` の TODO）。
- **作業**:
  - [ ] `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` を設定（`.env.example:32-34`）。
  - [ ] フロントを **Stripe Elements/Checkout（PaymentElement + 3DS）** に差し替え（`payment/[slotId]/page.tsx:260` のプレースホルダ箇所）。
  - [ ] Webhook の署名検証を `constructEvent` ベースへ（`webhooks/stripe/route.ts:10`）。
  - [ ] **ドタキャン罰金 ¥5,000 の実カード課金**を本番接続（現状は確定ロジックのみ・実課金はモック）。登録カードへのオフセッション課金。
- **受入条件**: 男性¥2,000（初回無料）課金成功・3DS通過・Webhookで成立確定。罰金が登録カードへ実課金される。**SEC-011（下記）を先に入れること。**

### A-6. Haiku AI 本人認証（一次判定の実接続） 🟡推奨（運用で代替可）
- **現状**: `src/lib/haiku-verify.ts:129` `realVerify` が**未実装で throw**。`MOCK_AI` で決定的モック判定（本番では無効化されるため、実装するまでは AI 自動承認は動かず**運営の手動承認にフォールバックできる**）。
- **作業**（`haiku-verify.ts:118` のTODO）:
  - [ ] Anthropic API(Haiku) 接続。**APIキーは env 経由**（`process.env.ANTHROPIC_API_KEY`、コード固定禁止）。
  - [ ] 身分証画像から ①18歳以上か ②顔写真の有無 ③記載読取 を判定し OK/要確認/NG を返す。
  - [ ] **`reason` に PII・秘密値を入れない**。判定不能時は安全側の `review`（要確認）に倒す。
  - [ ] **18歳未満の安全弁は維持**（`identity/route.ts:54` の `ai.verdict==="ok" && isAdult(...)` 両立。AIがokでも18未満は却下）。
- **受入条件**: 明白OKは自動承認・グレーは運営確認・18未満は必ず却下。`identity-ai.test.ts` の安全弁テストが実判定版でも通る。
- **備考**: 未実装でも**運営の手動審査（A-09）で代替可能**なので 🟡。ただし規制上の年齢確認責任は重いので早期推奨。

> **✅実装済み（2026-05-31・殿の方針反映）**: Haiku は **Anthropic API を同期で叩かず「トリガー駆動」**で実装した（モーニングレポート方式）。`POST /api/identity` は提出のみ（pending）、トリガージョブ `tools/ai-identity-trigger.mjs` が `GET /api/admin/identity/ai-queue`（Bearer）で判定待ちを取得→判定→`POST /api/admin/identity/[id]/ai-verdict`（Bearer）で書き戻し、サーバ側 `applyAiVerdict` が監査記録＋**ok かつ 18歳以上のみ自動承認**。E2E実証済（提出=pending→トリガー→approved）。残るは **`judge()` を実トリガーAI判定に差し替える**ことと **`AI_TRIGGER_TOKEN` 設定＋トリガー起動の登録（cron 等）** のみ。設計の正典: [AI_IDENTITY_TRIGGER.md](AI_IDENTITY_TRIGGER.md)。

---

## フェーズ B：セキュリティ必須対応（本番前）

`docs/backend/security-open-issues.md` の OPEN 項目。現状モックで実害は無いが、実サービス公開前に必須。

### B-1. SEC-011（新規・LOW）Payment 複合一意制約 ⚠️PARTIAL
- **問題**: `prisma/schema.prisma` の Payment に `@@unique([slotId, userId, type])` が**無い**。罰金の冪等は現状 in-memory の逐次チェック（`findBySlotUserAndType`）依存。実DBで2人目の no-show 報告が**レースすると二重 Payment 行**の可能性。
- **作業**:
  - [x] `Payment` に `@@unique([slotId, userId, type])` を追加（**2026-05-31 完了**・`prisma validate` 🚀 / `generate` rc0）。
  - [ ] `create` で P2002（一意制約違反）を**冪等スキップ**に変換（`rating-repo` の P2002→DuplicateRatingError と同方針）。← 実DB(Prisma)接続時に実施。
- **受入条件**: 同一 (slot×ratee×no_show_penalty) が並行報告でも1行のみ。**A-5 の罰金実課金より前に P2002 ハンドリングを入れる。**

### B-2. SEC-003（MED）CSRF（Origin/Referer 検証） ✅FIXED（2026-05-31）
- **問題**: 状態変更 POST が `sameSite=lax` のみ。S8で `/api/ratings`（罰金確定の起点）・admin会場操作 POST が増え CSRF 面が拡大。
- **完了**: `src/middleware.ts` + `src/lib/security/origin.ts`。状態変更メソッドのみ Origin/Referer 検証、許可=同一オリジン+`ALLOWED_ORIGINS`、Bearer/webhook 除外、本番は Origin 欠如を 403。+23テスト。
- **本番前**: `.env.example` の `ALLOWED_ORIGINS` に LIFF/本番ドメインを設定する。

### B-3. SEC-004（MED）レート制限 ✅FIXED（2026-05-31）
- **問題**: レート制限なし。総当たり/アップロード濫用/応募連打。S8で `/api/identity`・`/api/admin/venues/suggest` が追加。
- **完了**: `src/lib/security/rate-limit.ts` 固定窓(60s) IP×カテゴリ（auth20/identity10/venues-suggest10/apply30/他120、429+`Retry-After`、Bearer/webhook 除外）。+23テスト。
- **本番前**: 多インスタンス本番では in-memory を Redis 等へ差し替え（コメント明記済）。

### B-4. SEC-009（LOW→本番では重要）監査ログ 🟡
- **問題**: 監査ログなし（OWASP A09）。特に **AI自動承認** と **罰金課金** は規制・金銭イベント。
- **作業**: [ ] AI自動承認・本人認証承認/却下・罰金課金・admin操作 の監査ログを記録。
- **受入条件**: 誰が・いつ・何を の追跡が可能。

### B-5. SEC-007 / SEC-008（LOW）
- [ ] **SEC-007**: セッション鍵導出を単純ハッシュから KDF へ・秘密長の検証（`src/lib/auth/session.ts`）。
- [~] **SEC-008**: Next.js 14.2.5（CVE-2025-29927）。S8で middleware を追加したため、`src/middleware.ts` で受信 `x-middleware-subrequest` ヘッダを除去して**暫定緩和済**。恒久対応は Next 14.2.25+ への更新（要実施）。

> **対応不要**: SEC-001/SEC-002（✅FIXED）、SEC-010（cuid返却＝妥当）。

---

## フェーズ C：データ / ドキュメント仕上げ

### C-1. seed と限定枠
- [ ] 本番seed: 水・金・土 19:30 集合の枠（恵比寿/池袋/銀座）。当初は「誰でもOK」中心＋20代限定1・優良バッジ限定1。
- [ ] リリース運用: 集客前は `RELEASE_MODE=waiting` で `/coming-soon` 表示 → 集まったら `open`。

### C-2. 3軸評価詳細(U-15′)の実スクショ
- **現状**: seed に**開催完了(done)済みイベントが無い**ため pending 評価が生成されず、`/ratings/[slotId]` の3軸評価詳細を自動撮影できていない（UI・単体テストは確認済）。
- [ ] 6名分の応募→成立→確定→開催完了 を作るseed/スクリプトを用意し、3軸評価画面（また会いたい/会話/マナー＋「来なかった」報告）を撮影 → `docs/screenflow.md` §3.5 に追加。
- **代替**: 現状はコードと `docs/SPEC_S8.md`・単体テストで仕様確認可能。

---

## 殿の作業（手動・運営）

- [ ] **LINE公式アカウント（Messaging API チャネル）の作成** — ブラウザ自動化が本環境で不安定なため、殿の手動でお願いします（`docs/setup/external-setup.md` 参照）。作成後トークンを `.env.local`/Vercel に投入 → A-3 が完了。
- [ ] 各種実クレデンシャルの取得・投入（DB / LINE / Blob / Stripe / Anthropic）。**secret は絶対にコミットしない**（`.env.local` か Vercel 環境変数）。
- [ ] 飲食店の実予約（会場候補レコメンドで店を選び、店名/予約URL/予約名を A-05 で入力 → 6名へ通知）。

---

## 優先度まとめ（最短で公開に必要な順）

| 優先 | 項目 | 区分 |
|------|------|------|
| 🔴1 | A-1 実DB接続 + migrate/seed | 接続 |
| 🔴2 | A-2 LINE実トークン検証（SEC-002 実装） | 接続/認証 |
| 🔴3 | B-1 SEC-011 Payment複合unique | DB保険 |
| 🔴4 | A-5 Stripe実課金（参加費＋罰金） | 決済 |
| 🔴5 | A-3 LINE通知実送信（要：殿の公式アカウント作成） | 通知 |
| 🔴6 | A-4 Blob実接続＋SEC-005/006 | 画像/本人確認 |
| 🔴7 | B-2 CSRF / B-3 レート制限 | セキュリティ |
| 🟡8 | A-6 Haiku実接続（運営手動で代替可） | AI認証 |
| 🟡9 | B-4 監査ログ / B-5 鍵・Next更新 | セキュリティ |
| ⚪10 | C-1 seed / C-2 3軸SS / RELEASE_MODE運用 | 仕上げ |

> 🔴=公開ブロッカー / 🟡=公開後早期 / ⚪=仕上げ。
> 全項目「現状モックのため実害なし・本番接続時に対応」。フェイルクローズ設計により、未実装のまま本番が誤動作することはありません。
