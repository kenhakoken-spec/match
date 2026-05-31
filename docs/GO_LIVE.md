# 本番稼働状況（2026-06-01）— rendez / match-nomi

殿の指示「完成できるところまで全部やり遂げて」を受けた到達点。

## ✅ 本番稼働中：https://match-nomi.vercel.app

| 項目 | 状態 | 実証 |
|------|------|------|
| Vercel プロジェクト | `match-nomi`（link済） | — |
| 実DB（Neon Postgres） | 作成＋接続済（殿がA実施） | `vercel env` に DATABASE_URL 等 |
| DBスキーマ | テーブル作成済 | `prisma db push` → "in sync" |
| 初期データ | 枠5件＋admin1名 | 公開APIで **5件配信** |
| 環境変数（本番） | 必須6点投入 | DATABASE_URL / DIRECT_URL / NEXT_PUBLIC_LIFF_ID / LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET / AUTH_JWT_SECRET |
| 本番デプロイ | 成功 | `vercel --prod` → Production URL |
| 稼働確認 | 全ルート200 | `/`・`/explore`・`/coming-soon`・`/onboarding`・**`/api/public/slots`（実DBから5件・200/200）** |

本番モード（`MOCK_*` 無効）で**実DB・実LINEトークン検証**が有効。公開プレビュー `/explore` は未ログインで枠が見える。

## ⏳ 残り1手だけ：LIFF endpoint URL 更新（殿のブラウザ・約2分）

LINE Login 設定の更新APIは非公開（CLI不可・CDPもWSL↔Win 127.0.0.1限定で接続不能）。Console操作が必須。

1. https://developers.line.biz/console/channel/2010236765/liff
2. 既存LIFF（ID `2010236765-saeVnKMD`）を Edit
3. **Endpoint URL** を次に更新して保存:
   ```
   https://match-nomi.vercel.app
   ```
4. Scopes に `profile` / `openid` があるか確認

### 完了後の動作確認
スマホのLINEで **`https://liff.line.me/2010236765-saeVnKMD`** を開く
→「LINEではじめる」→ ログイン → 本人としてアプリ起動（＝LINEで操作できる状態）。

> ※ LIFF未更新でも、PCブラウザから https://match-nomi.vercel.app は閲覧可（公開プレビュー）。
> ※ LINEログイン本番動作は、上のLIFF URL更新が前提。

## 任意（後日・通知/決済/AIを使うとき）
- **LINE Messaging API**（会場確定通知）: 公式アカウント作成＋`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` 等。
- **Stripe**（男性¥2,000・ドタキャン罰金）: `STRIPE_SECRET_KEY` 等。
- **AI本人認証トリガー**: `AI_TRIGGER_TOKEN`＋`tools/ai-identity-trigger.mjs` の `judge()` に実判定。
- これらが無くても本人認証は**運営手動審査(A-09)**で動く。決済・通知は未接続でもアプリ自体は回る。

## 運用メモ
- 集客前に隠す: Vercel env に `RELEASE_MODE=waiting` 追加→`vercel --prod`で `/coming-soon` 表示に。
- seed再投入: `DATABASE_URL=<非pooled> DIRECT_URL=<同> node tools/seed-prod-db.mjs`（冪等・既存枠あればスキップ）。
- env変更後は必ず `vercel --prod` で再デプロイ（env はビルド時取込）。
