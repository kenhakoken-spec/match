# 本番稼働まで — 残り「殿の手動2ステップ」（2026-06-01）

殿の指示「完成できるところまで全部やり遂げて」を受け、私（開発将軍）がやれる範囲は完了。
**残り2つだけ**、技術的にブラウザ手動が必須で、私には実行できないことが確定した。正直に記す。

## なぜ私にできないか（誤魔化さず）

- **Neon DB作成**: Vercel CLI で `integration add neon` まで進めたが `Terms have not been accepted`（Neon利用規約の初回同意）で停止。規約同意ボタンはブラウザでしか押せない。
- **LIFF endpoint URL更新**: LINE Login チャネル設定の更新APIは非公開。CLIも無く、LINE Console（Web）のみ。
- **CDP代行も不可**: WSL の私から Windows Chrome に繋ごうとしたが、Chrome のデバッグポートは `127.0.0.1` 限定バインド（`--remote-debugging-address=0.0.0.0` は最近のChromeで無視される）。WSL↔Windows は別ネットワークで 127.0.0.1 に到達できず、接続不能。

→ この2つは殿のブラウザで実施が必要。各2〜3分で終わる。

---

## ステップ A：Neon（無料Postgres）を作成して接続（約3分）

1. ブラウザで開く: https://vercel.com/kenhakoken-specs-projects/match-nomi/stores
2. **Create Database** → **Neon (Serverless Postgres)** を選択
3. 初回は **Neonの利用規約に同意**（チェック）→ プラン **Free** → Region は **Washington D.C. (iad1)** など既定でOK → Create
4. 「**Connect to Project**」で `match-nomi` を選び、**Production**（＋Preview/Development任意）にチェックして接続
   - これで `DATABASE_URL` / `POSTGRES_*` 等が**自動で本番envに入る**。

> 完了したら、私に「**Neon繋いだ**」と一言ください。以降は私がCLIで:
> `DIRECT_URL` のマップ → `prisma db push`（テーブル作成）→ seed（初期枠投入）→ `vercel --prod` 再デプロイ、を全部やります。

---

## ステップ B：環境変数（LINE鍵＋セッション鍵）を本番に入れる

DBはAで自動で入るが、**LINEログインに要る鍵は手動 or 私が投入**。値は `.env.local`（私の手元）にあるので、**私がCLIで入れられます**。Aの後にまとめてやるのが楽。

私が入れる予定（`vercel env add … production`・値は画面に出さない）:
- `NEXT_PUBLIC_LIFF_ID`（`2010236765-saeVnKMD`）
- `LINE_LOGIN_CHANNEL_ID`（`2010236765`）
- `LINE_LOGIN_CHANNEL_SECRET`（手元の値）
- `AUTH_JWT_SECRET`（生成済み・手元）

---

## ステップ C：LIFF endpoint URL を本番URLに更新（約2分・殿のみ）

1. ブラウザで開く: https://developers.line.biz/console/channel/2010236765/liff
2. 既存LIFF（ID `2010236765-saeVnKMD`）の **⋯ / Edit**
3. **Endpoint URL** を次に更新して保存:
   ```
   https://match-nomi.vercel.app
   ```
4. Scopes に `profile` / `openid` が入っているか確認

---

## 完了後、LINEで動作確認

スマホのLINEで **`https://liff.line.me/2010236765-saeVnKMD`** を開く
→「LINEではじめる」→ ログイン → 本人としてアプリ起動（＝LINEで操作できる状態）。

---

## いま私が完了済みの範囲（実証あり）

- コード: LIFFログイン結線・LINE実トークン検証(SEC-002)・トリガー駆動AI認証・CSRF/レート制限・SEC-011 ほか実装＆push（`89fffc5`）。
- 検証: tsc rc0 / vitest 380 passed / 本番ビルド green。
- 本番: `match-nomi.vercel.app` に **STEP1デプロイ済**。`/`・`/explore`・`/coming-soon`・`/onboarding` は **200で表示**（DB依存の `/api/public/slots` のみ 500＝DB未接続のため。ステップAで解消）。
- Vercel CLI: ログイン済・`match-nomi` に link 済（`vercel env add` / `--prod` を私が即実行できる状態）。

## 私の担当（殿がA/Cを終えたら即やる）
- `prisma db push` → seed（水/金/土19:30の枠＋20代/優良バッジ限定）→ env投入 → `vercel --prod` → 全ルート200と公開API実データ配信を確認して報告。
