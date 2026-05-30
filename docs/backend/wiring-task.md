# 横断配線タスク（統合）— 評価→Profile集計→優良バッジ自動付与 ＋ done時attended++

S4/S5/S6 backendは「共有ファイルを触らない」契約を守ったため、横断フローが未配線。本タスクで結線する。
**dev server/build/curl/Playwrightは一切起動しない**（tsc と vitest のみ。`.next`競合回避）。

## 既に配線済み（再確認のみ・触らない）
- 限定枠ゲート: `src/lib/slot-service.ts:46` が `getBadgeRepo().hasPremium(userId)` を `evaluateEligibility` の `hasBadgePremium` に渡している。**完了済み**。

## 配線する（4点）

### 1. ProfilesRepo に集計write APIを追加
`src/lib/repo/types.ts` の `ProfilesRepo` インターフェースに2メソッド追加:
```ts
/** 受領評価の集計を Profile に反映（S5評価確定時）。存在しなければ null。 */
setRatingSummary(userId: string, summary: { avg: number; count: number }): Promise<ProfileEntity | null>;
/** 開催完了(done)参加の累計 attendedCount を +1（バッジ判定の入力）。 */
incrementAttended(userId: string): Promise<ProfileEntity | null>;
```

### 2. memory実装（`src/lib/repo/memory.ts` の MemoryProfilesRepo）
2メソッドを実装。`store()` を使い、対象 profile が無ければ null を返す。`updatedAt` を更新。
（注意: 既存メソッドの作法に厳密に合わせる。既存コードを壊さない。`const s = store();` を各メソッド先頭で取得する既存流儀に従う。）

### 3. prisma実装（`src/lib/repo/prisma-repo.ts` の PrismaProfilesRepo）
同2メソッドを実装。**実DB未検証コメント**を付す。`profile.update({ where:{userId}, data:{ ratingAvg, ratingCount, updatedAt } })` / `{ attendedCount: { increment: 1 } }` 相当。

### 4. rating-service の評価確定後に集計更新＋バッジ付与を呼ぶ
`src/lib/rating-service.ts` の `submitRating` の成功パス（`recordRating` が成功し `rateeAggregate` を得た直後、return の前）に:
```ts
// 評価確定 → 被評価者の Profile 集計を更新 → 優良バッジ自動付与判定（順序重要: 集計更新が先）。
await repo.profiles.setRatingSummary(rateeId, { avg: rateeAggregate.avg, count: rateeAggregate.count });
await evaluateAndGrantOnRating(rateeId); // badge-service。冪等。premium基準を満たせば付与＋通知。
```
import を追加: `import { evaluateAndGrantOnRating } from "@/lib/badge-service";`
（`applyRateeAggregateToProfile` の no-op はそのままでよい。実際の更新はこの結線で行う。）

### 5. done遷移で attendedCount++（admin成立完了アクション）
現状 Slot→done の遷移エンドポイントが無い。**新規 admin route を追加**:
`src/app/api/admin/matches/[id]/complete/route.ts`（POST, requireAdmin）:
- 対象 Match の Slot を `done` に（`repo.slots.setStatus(slotId, "done")`）。
- その枠の accepted 参加者全員に `repo.profiles.incrementAttended(userId)`。
- Match があり notified 済みのときのみ可（未通知や不在は409/404）。
- レスポンス: `{ slotStatus: "done", attendedIncremented: <人数> }`。
これで「開催完了→評価可能→バッジ判定」の前提（attendedCount）が実フローで揃う。

## 完了条件（自分で実行・実出力を報告）
1. `cd /mnt/c/tools/matching-app && rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` → **rc0**（全ツリー型エラー0）。
2. `npm run test` → 既存188が全PASS維持（壊さない）。可能なら setRatingSummary/incrementAttended の最小単体テストを memory 対象に追加（任意）。
3. 変更したファイル一覧と、上記5点それぞれの差分要点を報告。

## 禁止・制約
- **dev server / npm run build / curl / Playwright を起動しない**（`.next`競合の原因。検証は開発将軍が後で単独で行う）。tsc と vitest のみ。
- frontend所有（src/app のページ, src/components, src/app/_lib）に触らない。
- 既存の188テスト・既存ルートの挙動を壊さない。秘密のハードコード禁止。
- Bashで `pkill`/`fuser`/失敗する `curl`/未クォートglob を他コマンドと同一バッチに入れない（この環境はexit144で巻き添えキャンセル）。tsc/vitestは普通に実行してよい。
