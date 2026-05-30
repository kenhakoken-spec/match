# S5 API契約（凍結） — 相互評価 ＋ Profile集計

正典: [`../00_master_plan.md`](../00_master_plan.md)。schema の `Rating` を使用（migration不要）。
**並行実装の鉄則**: 共有 `src/lib/types.ts` / `repo/memory.ts` / `repo/index.ts` / `domain/index.ts` は**触らない**。専用ファイルで完結。Profile集計の配線は開発将軍が統合時に行う。

## 0. ルール
- 評価対象: **開催完了(Slot status=done)** のイベントの **同席者（自分以外の最大5名）**。
- 自分が参加(accepted)していたイベントのみ評価可。同一イベントの同一相手は**1回だけ**（schema `@@unique([slotId,raterId,rateeId])`）。
- スコア 1〜5（整数）。comment 任意（最大300・サニタイズ）。
- 集計: 受領評価から `ratingAvg`(0.0-5.0) と `ratingCount` を算出。

## 1. 純関数（`src/lib/domain/rating.ts` + `rating.test.ts`・vitest必須）
```ts
aggregateRatings(scores: number[]): { avg: number; count: number };   // 空→{0,0}, 四捨五入は小数1桁
isRatingScoreValid(score: number): boolean;                            // 1..5 整数
canRate(input: { isParticipantOfDoneSlot: boolean; rateeIsCoMember: boolean; alreadyRated: boolean; selfRate: boolean }): { ok: boolean; reason: string|null };
```
境界テスト: 空配列, 1件, 複数(平均/件数), 範囲外スコア(0/6/3.5), self評価不可, 二重評価不可, 非参加者不可。

## 2. エンドポイント（`src/app/api/ratings/**`）
| Method | Path | 説明 |
|---|---|---|
| GET | `/api/ratings/pending` | 評価可能なイベント＋未評価の同席者リスト |
| POST | `/api/ratings` | `{slotId, rateeId, score, comment?}` 評価送信。canRate をサーバ再判定 |
| GET | `/api/ratings/received/summary` | 自分の受領評価サマリ `{avg,count}` |
- 認可/IDOR: 自分が参加した done イベントの同席者のみ評価可。rater は常にセッションsub。他人になりすました評価は不可。
- 集計反映: 評価保存時に ratee の集計を更新（**Profile更新の具体配線は統合時に開発将軍が繋ぐ**ため、rating-repo 内に「集計を返す/保持する」関数を用意し、Profile への書き込みフック点をコメントで明示）。

## 3. 専用型（`src/lib/rating-types.ts`）
`RatingDTO`, `PendingRatingDTO`（slotId, datetime, area, members[{userId,displayName}]）, `RatingSummary`（avg,count）。types.ts には追記しない。

## 4. ファイル所有（S5 backend）
- 所有: `src/lib/domain/rating.ts`(+test), `src/lib/rating-types.ts`, `src/lib/repo/rating-repo.ts`(Rating用 in-memory Map＋prisma実装は実DB未検証コメント), `src/app/api/ratings/**`。
- 読み取りのみ: 既存 Slot/Application/Profile/User（getRepo経由）。
- 触らない: types.ts / repo/memory.ts / repo/index.ts / domain/index.ts / 他スプリント / frontend。
- seed: done 済イベント＋同席6名を rating-repo 側の補助 or 既存seed参照で用意（memory.ts は触らない。必要なら rating-repo 内に評価テスト用の最小データ）。

## 5. 完了条件（実証）
- `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` で自分の所有ファイルにエラー0（他所有既存エラーは切り分け報告）。
- `npm run test` で rating 純関数テスト全PASS（実数）。既存を壊さない。
- curl（1スクリプト内・PORT=3405）: done参加者が同席者を評価→200→summary に反映 / 二重評価→409 / self評価→400 / 非参加者評価→403。status+JSON。
- **kill系は1スクリプト内 `|| true`。pkill/fuser単独・混在禁止（exit144巻き添え）**。
