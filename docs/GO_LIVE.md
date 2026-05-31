# 本番稼働状況（2026-06-01）— rendez / match-nomi

## ✅ 本番稼働中（実DB接続・実証済み）: https://match-nomi.vercel.app

| 項目 | 状態 | 実証 |
|------|------|------|
| Vercel プロジェクト | `match-nomi`（link済） | — |
| 実DB（Neon Postgres） | 作成＋接続（殿がA実施） | neondb |
| DBスキーマ | テーブル作成済 | vercel-build の `prisma db push` → "🚀 in sync" |
| 初期データ | 枠5件＋admin1名 | seed→公開API **5件配信（200/200）** |
| 環境変数（本番） | LINE3点＋AUTH＋Neon | NEXT_PUBLIC_LIFF_ID / LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET / AUTH_JWT_SECRET / DATABASE_URL / POSTGRES_URL_NON_POOLING |
| 本番デプロイ | 成功 | `vercel --prod` → Deployment completed |
| 稼働確認 | **全ルート200** | `/`・`/explore`・`/coming-soon`・`/onboarding`・**`/api/public/slots`（実DBから5件）** |

本番モード（`MOCK_*` 無効）で**実DB・実LINEトークン検証**が有効。公開プレビュー `/explore` は未ログインで枠が見える。

### DB初期化の仕組み（Neonのenvが手元に取れない問題への対処）
Neon接続文字列はVercel上で "Sensitive" 扱いで `vercel env pull` から読めず、`DIRECT_URL` も提供されない。そのため:
- `prisma/schema.prisma`: `directUrl = env("POSTGRES_URL_NON_POOLING")`（Neon提供の直結URL）に変更。
- `package.json`: `vercel-build` を追加し、**Vercelのビルド環境（実URLを持つ）上で** `prisma db push`＋`tools/seed-prod-db.mjs` を実行。ローカル `build` は不変。
- → 以後の本番デプロイで自動的にスキーマ同期＆seed（冪等）。

## ⏳ 残り1手だけ：LIFF endpoint URL 更新（殿のブラウザ・約2分）

LINE Login 設定の更新APIは非公開（CLI不可・CDPもWSL↔Win 127.0.0.1限定で接続不能のため私には実行不可）。Console操作が必須。

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

> ※ LIFF未更新でも PCブラウザから https://match-nomi.vercel.app は閲覧可（公開プレビュー）。
> ※ LINEログイン本番動作は上のLIFF URL更新が前提。

## 任意（後日・通知/決済/AIを使うとき）
- **LINE Messaging API**（会場確定通知）: 公式アカウント作成＋`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` 等。
- **Stripe**（男性¥2,000・ドタキャン罰金）: `STRIPE_SECRET_KEY` 等。
- **AI本人認証トリガー**: `AI_TRIGGER_TOKEN`＋`tools/ai-identity-trigger.mjs` の `judge()` に実判定。
- これらが無くても本人認証は**運営手動審査(A-09)**で動く。決済・通知未接続でもアプリは回る。

## 運用メモ
- 集客前に隠す: Vercel env に `RELEASE_MODE=waiting` 追加→`vercel --prod`で `/coming-soon` 表示に。
- DB再seed: 本番デプロイのたびに `vercel-build` が冪等seed（既存枠あればスキップ）。
- env変更後は必ず `vercel --prod`（env はビルド時取込）。
