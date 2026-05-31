# rendez — 合コン型グループマッチング（matching-app）

**rendez** は、男女3人ずつ・計6人で会う新しい合コンアプリ。東京・恵比寿 / 池袋 / 銀座で、**LINE（LIFF）上**で動く（ホスティングは Vercel）。アプリ内チャットは無く、**会場は運営が手配して6人へLINEで通知**する設計。

> このリポジトリは**レビュー / FB 用**です。まず **[docs/screenflow.md](docs/screenflow.md)（画面遷移ボード＝Figma代替）** をご覧ください。

## レビューはここから（ドキュメント索引）

| ドキュメント | 内容 |
|------|------|
| 📊 [docs/screenflow.md](docs/screenflow.md) | **画面遷移ボード**（遷移図＋制限ゲート＋実画面ギャラリー）。最初に見る |
| 📝 [docs/SPEC.md](docs/SPEC.md) | 画面ごとの仕様・FB欄（U-00〜A-10） |
| 🆕 [docs/SPEC_S8.md](docs/SPEC_S8.md) | **S8追加画面**の仕様・FB欄（プレビュー / AI認証 / 多軸評価 / ドタキャン罰金 / 会場候補） |
| 🗺️ [docs/00_master_plan.md](docs/00_master_plan.md) | 開発計画（スプリント S0〜S7） |
| 🔧 [docs/01_s8_spec.md](docs/01_s8_spec.md) | S8追加要望の正典（殿の5要望） |
| 🎨 [docs/design/design-system.md](docs/design/design-system.md) ／ [docs/design/wireframes.md](docs/design/wireframes.md) | デザイン原則・ワイヤーフレーム |

## 主要な仕様

| 項目 | 内容 |
|------|------|
| マッチング単位 | 男女3名ずつ・計6名のグループ（運営が日時×エリアの枠を用意し、ユーザーは応募） |
| エリア | 恵比寿 / 池袋 / 銀座 |
| プレビュー | **未登録でも枠一覧・枠詳細を閲覧可**（参加者は職種・年代・評価の匿名サマリで表示。氏名・写真は非表示）。応募は登録後 |
| 参加条件 | 本人認証必須（18歳以上）＋ 枠ごとの条件（誰でもOK／20代限定／優良バッジ限定） |
| 本人認証 | 身分証を提出 → AI一次判定（OK/要確認/NG）→ 明白OKは自動承認・グレーのみ運営確認。**18歳未満は安全弁で必ず却下**。AI判定は Anthropic API を同期で叩かず**トリガー駆動**（[docs/AI_IDENTITY_TRIGGER.md](docs/AI_IDENTITY_TRIGGER.md)） |
| 料金 | 男性 ¥2,000/回（初回無料）／女性 無料／不成立は非課金（Stripe従量） |
| 評価 | 参加後の相互評価を**3軸**（また会いたい／会話／マナー 各★1〜5）。総合平均が一定以上で優良バッジ |
| ドタキャン防止 | 無断欠席は罰金 ¥5,000。同席者2名以上が「来なかった」と報告で確定→自動課金 |
| 会場 | 運営が手配し6名へLINE通知（店名・予約URL・予約名）。成立枠には**会場候補をレコメンド**（食べログ／Google点・合コン向き度でソート） |
| チャット | 無し（オフラインで会う設計） |
| リリース制御 | `RELEASE_MODE=waiting` で「リリースをお待ちください」画面に全体切替可能 |

## 開発状況

S0〜S7（MVP）に加え、**S8 追加機能**（殿の5要望）を実装済み。

| スプリント | 内容 | 主な画面 |
|------|------|------|
| S0〜S7 | MVP（ログイン／本人認証／プロフィール／枠応募／成立／決済／会場通知／相互評価／優良バッジ） | U-00〜U-15・A-02〜A-10 |
| S8-1 | マーケ強化：未登録プレビュー（見せて登録を促す） | `/explore`・`/explore/[id]` |
| S8-2 | 本人認証のAI一次判定（**トリガー駆動**・API不使用）／会場候補レコメンド | `/admin/venues` |
| S8-3 | 枠ごとの限定（誰でも／20代／優良バッジ）／リリース待ち画面 | `/coming-soon` |
| S8-4 | 多軸評価（また会いたい／会話／マナー） | `/ratings/[slotId]` |
| S8-5 | ドタキャン罰金 ¥5,000（2名以上の報告で自動課金） | 評価画面に内包 |

検証: **tsc rc0 / 単体テスト 313 passed（21 files）/ 本番ビルド green**（開発将軍が単独で再検証）。

## 技術スタック

Next.js (App Router) + TypeScript + Tailwind CSS ／ LIFF（@line/liff）+ LINE Login + LINE Messaging API ／ 決済 Stripe ／ DB Vercel Postgres(Neon) + Prisma ／ 画像 Vercel Blob ／ テスト Vitest + Playwright。デプロイ先 Vercel。

セッションは AES-256-GCM 暗号化 Cookie（httpOnly / secure / sameSite=lax）。個人情報の出口は `src/lib/serializers.ts` の関門で除去。本番では `MOCK_*` を無効化する fail-closed 設計（`src/lib/env.ts`）。

---

## 開発体制（参考）

専任の **開発将軍（Dev-Shogun）** が、Agent Teams 体制で専門Workerに並列委任しながら開発を指揮する。

```
殿 → 開発将軍（Dev-Shogun）→ Workers（Agent Teams）
                              ├── frontend-worker    (UI実装)
                              ├── backend-worker     (API/DB/認証/マッチングロジック)
                              ├── design-worker      (UI/UX設計)
                              ├── qa-worker          (テスト作成・実行)
                              ├── qa-tester          (ランダムQA)
                              └── security-reviewer  (セキュリティ・個人情報保護)
```

- 開発将軍の指示書: `instructions/dev_shogun.md`
- Worker 定義: `.claude/agents/*.md`
- ブート設定: `CLAUDE.md`（自己同定 → 指示書読込 → 殿への要件ヒアリング）

これは親プロジェクト（multi-agent-shogun）とは**別の git リポジトリ**である。開発将軍・Worker は親プロジェクトのファイルに一切触れない。
