# 本人認証 AI 一次判定 — トリガー駆動（実装済み）

最終更新: 2026-05-31 / ステータス: **実装済み（tsc rc0 / vitest green / E2E実証済）**

殿の方針（2026-05-31）:
> Haiku は Anthropic API では動かさない。モーニングレポートと同じく**トリガーで動く**ようにする。

この方針どおり、本人認証の AI 一次判定を **API 同期呼び出しではなくトリガー駆動**で実装した。
アプリは「判定待ちキューの提供」と「判定結果の適用＋安全弁」だけを担い、判定の頭脳（Haiku）は
**外部トリガーで起動するジョブ**側に置く。アプリは Anthropic API キーを持たず、外部を叩かない。

---

## 1. 全体像（API 同期との違い）

- **API 同期案（不採用）**: `POST /api/identity` の処理中に Anthropic API を呼ぶ。→ 殿の方針で不可。
- **トリガー駆動案（採用・実装済み）**: モーニングレポートと同じく、外部トリガーで起動したジョブが
  ① 判定待ちキューを取得 → ② 自分のコンテキストで判定 → ③ 結果をアプリへ書き戻す。
  アプリは ④ 受け取った判定をサーバ側で適用（18歳安全弁付き自動承認）。

```
[ユーザー]            [rendez アプリ]                         [トリガージョブ（別プロセス）]
  身分証提出 ──POST /api/identity──▶ status=pending / aiVerdict=null
                                          │
                                          │   ① 判定待ちキュー取得（Bearer）
                                          ◀──GET /api/admin/identity/ai-queue─── (定期トリガー)
                                          │   items:[{id,docType,blobRef,birthdate}]
                                          │
                                          │                       ② judge() で判定（18+/顔/読取）
                                          │                          → {verdict, reason}
                                          │   ③ 判定を書き戻し（Bearer）
                                          ◀──POST .../[id]/ai-verdict───────────
                                          │
                                          ▼ ④ サーバ側で適用（applyAiVerdict）
                                   setAiVerdict(監査記録)
                                   ok かつ 18歳以上 → 自動承認(approve, reviewedBy="ai")＋通知
                                   review/ng・18未満・profile無 → pending据置(運営A-09で確認)
```

---

## 2. 実装ファイル（実在・レビュー用）

| 役割 | ファイル |
|------|----------|
| 提出（AIは同期で呼ばない・pendingで受ける） | `src/app/api/identity/route.ts` |
| 判定待ちキュー（GET・Bearer・最小データ） | `src/app/api/admin/identity/ai-queue/route.ts` |
| 判定の書き戻し（POST・Bearer・zod） | `src/app/api/admin/identity/[id]/ai-verdict/route.ts` |
| 判定の適用＋18歳安全弁＋冪等 | `src/lib/identity-ai.ts`（`applyAiVerdict`） |
| トリガートークン認証（本番フェイルクローズ・定数時間比較） | `src/lib/auth/trigger-auth.ts` |
| トークン読み出し（env集約） | `src/lib/env.ts`（`aiTriggerToken()`） |
| エラー→HTTP変換 | `src/lib/http.ts`（`TriggerAuthError`分岐） |
| **トリガージョブ本体** | `tools/ai-identity-trigger.mjs` |
| ローカル実証ランナー | `tools/ai-identity-trigger-run.sh` |
| テスト | `src/lib/identity-ai.test.ts` / `src/lib/auth/trigger-auth.test.ts` |
| 受け皿（判定の記録先） | schema `IdentityVerification.aiVerdict/aiReason/aiCheckedAt`・`repo.identities.setAiVerdict()` |

---

## 3. エンドポイント契約

認証は**トリガートークン**（共有 Bearer）。ユーザー/管理者セッションは使わない。

### 3.1 `GET /api/admin/identity/ai-queue` — 判定待ちキュー
- 認証: `Authorization: Bearer <AI_TRIGGER_TOKEN>`。
- 対象: `status=pending` のうち「未判定 or 再提出（`aiCheckedAt < submittedAt`）」かつ `Profile` あり。
- 返す: 判定に必要な**最小データのみ**。氏名・lineUserId 等の PII は返さない（年齢判定に `birthdate` は必要なので含める。`blobRef` は画像参照キー）。
  ```json
  { "items": [
    { "id": "iv_123", "docType": "drivers_license",
      "blobRef": "blob://...", "birthdate": "1994-04-01T00:00:00.000Z" }
  ] }
  ```

### 3.2 `POST /api/admin/identity/[id]/ai-verdict` — 判定の書き戻し
- 認証: 同上 Bearer。ボディ: `{ "verdict": "ok"|"review"|"ng", "reason": "<=480字" }`（zod）。
- サーバ処理（`applyAiVerdict`）:
  1. `setAiVerdict` で**監査記録**（status は変えない＝判定と承認の分離）。
  2. `verdict==="ok"` **かつ** `isAdult(profile.birthdate)` のときだけ `approve(id,"ai")`＋承認通知。
     - **安全弁**: AI が ok でも 18歳未満 / プロフィール無し → **承認しない**（pending 据置）。
  3. `review`/`ng` → pending 据置（運営が A-09 で確認・ng は reject 操作）。
  4. 既に approved/rejected なら状態を動かさず**冪等**。
- レスポンス: `{ id, verdict, status, autoApproved }`。

---

## 4. トリガージョブ `tools/ai-identity-trigger.mjs`

役割は **キュー取得 → 判定 → 書き戻し**。環境変数 `AI_TRIGGER_BASE_URL` / `AI_TRIGGER_TOKEN`。

起動（トリガー駆動の例）— cron / スケジューラ / Claude Code 定期ジョブ等から:
```bash
AI_TRIGGER_BASE_URL=https://<deploy> AI_TRIGGER_TOKEN=<secret> node tools/ai-identity-trigger.mjs
```

### 4.1 判定シーム `judge(item)` — ここが Haiku/他トリガーAI連携の差し込み口
spec 要望2 の判定基準（①18歳以上か ②顔写真の有無 ③記載の読取）。

- **現状（実装済みの決定的ルール）**: プロトタイプとして決定的に判定する。
  1. `birthdate` から年齢算出。**18歳未満 → `ng`**（年齢の安全弁。サーバ側でも二重チェック）。
  2. `blobRef` に `blurry`/`unreadable`/`noface` を含む → `review`（運営確認）。
  3. それ以外（18+・顔あり・読取良好）→ `ok`（明白OK＝自動承認候補）。
- **本番（Haiku/他トリガーAIと連携）**: `judge` の中で、トリガー実行主体（Claude Code 等のAI）が
  `blobRef` の画像を取得し ①18歳以上か ②顔写真の有無 ③氏名/生年月日の読取可否 を判断して
  `{verdict, reason}` を返すよう差し替える。
  - `reason` には **PII・画像生データ・秘密値を入れない**（人間可読の要約のみ）。
  - **判定不能・エラー時は安全側の `review`**（勝手に `ok` を出して自動承認させない）。

---

## 5. セキュリティ（実装済みの不変条件）

- **トリガートークン（フェイルクローズ）** `src/lib/env.ts aiTriggerToken()`:
  - 本番(`production`)で `AI_TRIGGER_TOKEN` 未設定 → **null を返し、エンドポイントは 503**
    （予測可能な既定トークンで本番が開く事故を防ぐ）。非production は開発既定を許容。
  - トークン比較は**定数時間**（`src/lib/auth/trigger-auth.ts`）。値はログに出さない。
- **18歳安全弁はサーバ側**: トリガーの自己申告を信用しない。`applyAiVerdict` 内で
  `isAdult(profile.birthdate)` を必ず再判定し、ok でも 18未満は承認しない。
- **判定と承認の分離**: `setAiVerdict`（記録）と `approve`（承認）を分け、監査のため
  `aiVerdict/aiReason/aiCheckedAt` を必ず残す（出会い系規制の年齢確認責任）。
- **PII 最小**: ai-queue が返すのは判定に要る最小データのみ。氏名・lineUserId は返さない。
- **CSRF/レート制限の除外**: トリガーは Bearer 認証なので、`src/middleware.ts` の CSRF(Origin)
  チェックは **`Authorization: Bearer` を持つリクエストを除外**（`bearer_excluded`）。レート制限も
  Bearer を除外。＝トリガーが middleware に弾かれない。

---

## 6. E2E 実証

`tools/ai-identity-trigger-run.sh`（PORT 3702）でローカル実証できる:
1. テストユーザーで身分証を提出 → `GET /api/identity` は `status=pending`。
2. `node tools/ai-identity-trigger.mjs` 実行（キュー取得→判定→書き戻し）。
3. 再度 `GET /api/identity` → 18歳以上・読取良好なら `status=approved`（トリガー駆動で自動承認）。

> 提出時点では pending、トリガー実行後に approved になる＝「API同期でなくトリガーで判定が走る」実証。

---

## 7. 他のトリガーAIとの連携（横展開）

同じ「キュー → 判定 → 書き戻し」パターンで増やせる:

| 用途 | キュー(GET) | 書き戻し(POST) | サーバ側の不変条件（自己申告を信用しない） |
|------|------------|----------------|--------------------------------------------|
| 本人認証(本MD・実装済) | `ai-queue` | `ai-verdict` | 18歳以上(`isAdult`)でなければ自動承認しない |
| 会場提案（将来） | 成立枠の候補要求 | 候補の書き戻し | admin のみ反映・URL は http(s) 許可リスト |
| 不正/通報検知（将来） | 対象イベント | フラグ書き戻し | 課金/制裁は2人以上・サーバ集計で確定 |

認証トークンは用途ごとに分離可能。すべて「アプリは受け皿と安全弁、頭脳はトリガーAI」を守る。

---

## 8. 本番でやること

- [ ] `judge()` を実トリガーAI判定へ差し替え（画像の年齢/顔/読取・`reason`にPII入れない・不能はreview）。
- [ ] `AI_TRIGGER_TOKEN` を本番 env に設定（十分長いランダム値・コミット禁止）。
- [ ] トリガー起動を登録（cron / スケジューラ / Claude Code 定期ジョブ）。`AI_TRIGGER_BASE_URL` を本番URLに。
- [ ] 監査ログ（SEC-009）に AI 自動承認イベントを記録。
