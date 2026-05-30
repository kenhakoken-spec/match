# 外部セットアップ手順（殿のアクション）＋ 画面操作ガイド

開発将軍はコード・設定・モックを最大限先行させるが、**以下は殿のLINE/各種アカウントでの操作が必須**で、Claudeが代理ログインして作成することはできない。届き次第、実接続に切り替える。それまではモック／テストキーで開発を進める。

> **本書は 2026-05-30 に LINE Developers の最新仕様で更新済み。**最大の変更点 →
> **Messaging APIチャネルは LINE Developers Console から直接作れなくなった（2024年9月〜）。**
> **LINE公式アカウント Manager 側で公式アカウントを作り、そこでMessaging APIを有効化する**フローに変わっている。本書はこれに準拠。
> 実画面のスクリーンショットを `/tmp/line-shots/` に取得済み（後述の対応表参照）。

---

## 0. 全体像 — 作るものは「プロバイダー1 + チャネル2」

```
プロバイダー（= 開発者グループの箱。例: rendez）
├── ① LINE Login チャネル        ← ログイン用（鍵）
│     └── LIFF アプリ              ← LINEの中でうちの画面を開く設定
└── ② Messaging API チャネル     ← 通知用（公式アカウントから push）
      （※公式アカウント Manager 経由で作成 → 同じプロバイダーに紐づく）
```

- 既存「モーニングレポート」とは**別の新規プロバイダー**で作る（混在させない）。
- ①と②は**同じプロバイダー**に置くと管理が楽。

---

## 1. 事前準備（5分）

| 何を | どこで | メモ |
|------|--------|------|
| LINE Developers にログイン | https://developers.line.biz/console/ | ふだんのLINEアカウントでOK。初回は開発者登録（名前・メール）を求められる |
| LINEビジネスID | https://account.line.biz/ | 公式アカウント作成に使用（②で必要）。LINEアカウントでそのまま作れる |

> 実画面: `/tmp/line-shots/01_console_login.png`（コンソールのログイン画面）

---

## 2. ① LINE Login チャネル ＋ LIFF（最重要・S1で必要）

### 2-A. プロバイダーを作る
1. コンソール右上の **「Create」** → **「Create a new provider」**。
2. Provider name: `rendez`（任意）→ **Create**。

### 2-B. LINE Login チャネルを作る
1. 作ったプロバイダーの **Channels** タブ → **「Create a LINE Login channel」**（または Create a new channel → LINE Login）。
2. 入力（最新の必須項目）:
   | 項目 | 入れる値 |
   |------|----------|
   | Region | **Japan** |
   | Channel name | 例 `rendez`（**"LINE" の文字は使用不可**） |
   | Channel description | 例「東京の合コンマッチング」 |
   | App types | **Web app** にチェック |
   | Email address | 連絡先メール |
   | Privacy policy URL / Terms | 任意（後で可） |
3. **LINE Developers Agreement に同意** → **Create**。
4. 作成後、**Basic settings** タブに:
   - **Channel ID**（= `LINE_LOGIN_CHANNEL_ID`）
   - **Channel secret**（= `LINE_LOGIN_CHANNEL_SECRET`）

> 実画面の手順ページ: `/tmp/line-shots/02_login_getstarted.png`

### 2-C. LIFF アプリを追加する
1. その LINE Login チャネルを開く → **「LIFF」** タブ → **「Add」**。
2. 入力:
   | 項目 | 入れる値 |
   |------|----------|
   | LIFF app name | 例 `rendez` |
   | Size | **Full**（全画面。スマホ縦アプリに最適） |
   | Endpoint URL | VercelのURL（未定なら仮 `https://example.vercel.app` を入れ、後で更新） |
   | Scopes | **profile** と **openid** にチェック |
   | Bot link feature | いったん Off でよい（後で公式アカウントと連携可） |
3. **Add** → 一覧に表示される **LIFF ID**（= `NEXT_PUBLIC_LIFF_ID`）と LIFF URL を控える。

> 実画面の手順ページ: `/tmp/line-shots/04_liff_register.png`

---

## 3. ② Messaging API チャネル（通知用・S3で必要）

> **⚠️ ここが旧手順から変わった点。** コンソールの「Create channel」に Messaging API は**もう出ない**。
> **公式アカウントを先に作り**、そこでMessaging APIを有効化する。

### 3-A. LINE公式アカウントを作る
1. https://manager.line.biz/ （LINE Official Account Manager）へ。
2. **「アカウントを作成」** → 必要事項（アカウント名 例「rendez」・業種など）を入力して作成。
   > 実画面: `/tmp/line-shots/05_oa_manager_top.png`

### 3-B. Messaging API を有効化
1. 公式アカウント Manager → **設定（Settings）** → **「Messaging API」**。
2. **「Messaging APIを利用する」** を実行。
3. **プロバイダーを選択**（2-Aで作った `rendez` を選ぶ）。
   > 注意: **一度紐づけたプロバイダーは後から変更できない。**必ず①と同じ `rendez` を選ぶ。
4. 開発者情報（初回のみ名前・メール）を登録。

### 3-C. トークンとシークレットを控える
1. https://developers.line.biz/console/ に戻り、同じプロバイダーを開くと **Messaging API チャネル**が増えている。
2. そのチャネル → **「Messaging API」** タブ:
   - **Channel access token（long-lived）** を **Issue（発行）** → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
3. **Basic settings** タブ:
   - **Channel secret** → `LINE_MESSAGING_CHANNEL_SECRET`
4. 公式アカウントの **ベーシックID**（@xxxx）も控える → `LINE_OFFICIAL_ACCOUNT_ID`

> 実画面の手順ページ: `/tmp/line-shots/03_messaging_getstarted.png`

### 3-D. 重要な制約（設計に織り込み済み）
- **push通知は、ユーザーが公式アカウントを「友だち追加」していないと届かない。**
  → 本人認証〜プロフィール登録の導線に「友だち追加」を必須ステップとして入れる。
- 公式アカウントの **「応答モード」を Bot（Webhook）側** に寄せ、自動応答メッセージは最小化（チャット無しサービスのため）。

---

## 4. 控える値（最終的に私へ / .env.local に設定）

```
# ① LINE Login + LIFF
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
NEXT_PUBLIC_LIFF_ID=

# ② Messaging API（通知）
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=
LINE_MESSAGING_CHANNEL_SECRET=
LINE_OFFICIAL_ACCOUNT_ID=
```

> これらが揃うまで、アプリは `MOCK_AUTH=1 / MOCK_NOTIFY=1` でモック動作する。揃ったら env を差し替えるだけで実接続に切り替わる。

---

## 5. Stripe（決済 / S4で必要・それまで不要）

1. https://stripe.com/jp でアカウント作成。
2. **テストモード**のAPIキーを控える:
```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # webhook設定後に発行
```
3. 課金仕様（実装側で固定）: 通貨=JPY、男性 1回参加 **¥2,000**、**初回参加は無料**、女性は常に無料、不成立時は課金しない。

---

## 6. Vercel / Neon（デプロイ＆DB・開発将軍が構成）

- Vercelプロジェクト作成＋Neon(Vercel Postgres)接続は開発将軍側で構成する。
- 殿には、Vercelアカウントへの招待 or デプロイ承認のタイミングで連絡する。
- Vercel Postgres は `POSTGRES_PRISMA_URL` を `DATABASE_URL` に、`POSTGRES_URL_NON_POOLING` を `DIRECT_URL` にマップする。

---

## 7. 進め方（現状）
- **LINE／Stripeのキーが未着でも開発は止めない。** モック認証・スタブ通知・Stripeテストキー前提で S1〜S6 を実装する。
- 実キーが届いた時点で env を差し替え、実機（LINE内）E2Eに切り替える。
- **「実LINEでの通しE2E」だけは、上記①②のチャネルが無いと完了できない**点は最後まで正直に報告する。

---

## 付録: 実画面スクリーンショット対応表（2026-05-30取得）

| ファイル | 内容 |
|----------|------|
| `/tmp/line-shots/01_console_login.png` | LINE Developers コンソールのログイン画面 |
| `/tmp/line-shots/02_login_getstarted.png` | LINE Login チャネル作成の手順ページ |
| `/tmp/line-shots/03_messaging_getstarted.png` | Messaging API 開始手順（OA Manager経由）ページ |
| `/tmp/line-shots/04_liff_register.png` | LIFF アプリ登録の手順ページ |
| `/tmp/line-shots/05_oa_manager_top.png` | LINE公式アカウント Manager トップ |
| `/tmp/line-shots/06_business_signup.png` | LINEビジネスID サインアップ画面 |
