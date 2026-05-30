# S6 API契約（凍結） — 優良バッジ付与 ＋ バッジ限定枠の有効化

正典: [`../00_master_plan.md`](../00_master_plan.md)。schema の `Badge` を使用（migration不要）。S5評価集計の上に乗る（統合時配線）。
**並行実装の鉄則**: 共有 `src/lib/types.ts` / `repo/memory.ts` / `repo/index.ts` / `domain/index.ts` は**触らない**。専用ファイルで完結。`eligibility.ts`（S2所有）も触らない＝バッジ判定は新規ファイルで提供し、限定枠ゲートの結線は開発将軍が統合時に行う。

## 0. ルール
- 優良バッジ(premium)付与基準（純関数で固定・後で調整可）: **ratingAvg ≥ 4.0 かつ ratingCount ≥ 5 かつ attendedCount ≥ 2**。
- 付与は冪等（同一ユーザーに premium は1つ＝schema `@@unique([userId,type])`）。
- 自動付与: 評価確定（S5）時に判定。手動付与/取消: admin。
- 限定枠: `Slot.requiresBadge=true` の枠は **premium保有者のみ応募可**（判定はS2 eligibility に既に口がある。S6は「バッジ保有の実データが eligibility に渡るようにする」）。

## 1. 純関数（`src/lib/domain/badge.ts` + `badge.test.ts`・vitest必須）
```ts
type BadgeInput = { ratingAvg: number; ratingCount: number; attendedCount: number };
qualifiesForPremium(input: BadgeInput): boolean;                    // 上記AND条件
badgeCriteriaSnapshot(input: BadgeInput): Record<string, number>;  // 付与根拠スナップショット
```
境界テスト: avg 3.9/4.0/4.1, count 4/5, attended 1/2 の各境界、全条件満たす/1つ欠ける。

## 2. エンドポイント（`src/app/api/badges/**`, `src/app/api/admin/badges/**`）
| Method | Path | 説明 |
|---|---|---|
| GET | `/api/badges/mine` | 自分のバッジ一覧＋未取得時の進捗（avg/count/attended の現状） |
| GET | `/api/admin/badges` | （admin）バッジ付与状況一覧（A-10） |
| POST | `/api/admin/badges/grant` | （admin）手動付与 `{userId}` |
| POST | `/api/admin/badges/revoke` | （admin）取消 `{userId}` |
- 自動付与フック: 「評価確定時に qualifiesForPremium を判定し付与」する関数を badge-service に用意（S5との結線点はコメント明示、実結線は統合時に開発将軍）。
- 認可: admin系は requireAdmin。mine は本人のみ。

## 3. 専用型（`src/lib/badge-types.ts`）
`BadgeDTO`（type, grantedAt）, `BadgeProgressDTO`（hasPremium, ratingAvg, ratingCount, attendedCount, remaining{...}）。types.ts には追記しない。

## 4. ファイル所有（S6 backend）
- 所有: `src/lib/domain/badge.ts`(+test), `src/lib/badge-types.ts`, `src/lib/repo/badge-repo.ts`(Badge用 in-memory Map＋prisma実装は実DB未検証コメント), `src/lib/badge-service.ts`, `src/app/api/badges/**`, `src/app/api/admin/badges/**`。
- 読み取りのみ: 既存 Profile/User/Slot（getRepo経由）。
- 触らない: types.ts / repo/memory.ts / repo/index.ts / domain/index.ts / eligibility.ts / 他スプリント / frontend。
- 限定枠ゲートの結線（eligibility に badge 保有を渡す）は**開発将軍が統合時に**行う。あなたは「あるユーザーがpremium保有かを返す」関数を badge-repo に用意するだけ。

## 5. 完了条件（実証）
- `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` で自分の所有ファイルにエラー0（他所有既存エラーは切り分け報告）。
- `npm run test` で badge 純関数テスト全PASS（実数）。既存を壊さない。
- curl（1スクリプト内・PORT=3406）: 基準満たすユーザーに自動/手動付与→mine に premium / 基準未満→進捗表示 / admin grant/revoke 200 / 非admin grant→403 / 重複付与は1つ（冪等）。status+JSON。
- **kill系は1スクリプト内 `|| true`。pkill/fuser単独・混在禁止（exit144巻き添え）**。
