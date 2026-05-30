# 評価 & 優良バッジ設計 (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS5(評価)〜S6(バッジ+限定イベント)。判定は単体テスト可能な純関数に分離する。
> 最終更新: 2026-05-30

## 0. 方針

- イベント(=done になった Slot)の後、参加者同士が**相互評価**する。
- 高評価が**複数回**蓄積した人へ **優良バッジ(premium)** を付与する。
- premium は**限定イベント**(`Slot.requiresBadge=true`)の応募条件に使う。
- 判定は副作用のない純関数に切り出し、DB/通知から独立して単体テストできる形にする。

## 1. 評価(Rating)の収集フロー

```
[Slot が done になる(開催完了)]
  ① 参加者(accepted) の Profile.attendedCount++
  ② 各参加者へ rating_request 通知(相互評価のお願い)
[ユーザー]
  ③ そのイベントの同席者(自分以外の5人)を評価
       POST /api/ratings { slotId, rateeId, score(1-5), comment? }
[server]
  ④ バリデーション: score 1-5 / 自分自身は不可 / 同席者(同 slot の accepted)のみ / 二重評価不可(UNIQUE)
  ⑤ Rating 追加
  ⑥ 被評価者(ratee)の Profile.ratingAvg / ratingCount を再計算(トランザクション)
  ⑦ バッジ判定を実行(下記 §3) → 条件充足なら premium 付与
```

### 評価の制約・IDOR
- 評価できるのは **done になった Slot に accepted で参加した本人**のみ。
- 評価対象は **同席者(同 Slot の accepted, 自分以外)** のみ。`rateeId` が同席者か検証(IDOR/不正評価防止)。
- `@@unique([slotId, raterId, rateeId])` で同一イベント・同一相手の二重評価を防ぐ。
- 評価期間(例: 開催後7日)を設けるのは運用で(MVPは無期限でも可。S5で決定)。

## 2. 集計（Profile.ratingAvg / ratingCount）

```ts
// 純関数: 被評価者の全 Rating から平均と件数を算出
function aggregateRatings(scores: number[]): { ratingAvg: number; ratingCount: number } {
  const ratingCount = scores.length;
  const ratingAvg = ratingCount === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / ratingCount;
  return { ratingAvg: Math.round(ratingAvg * 100) / 100, ratingCount };
}
```
- Rating 追加時に再計算してキャッシュ(`Profile.ratingAvg`/`ratingCount`)。正本は Rating 群。
- 大量更新時はバッチ再計算も可(規模〜1千人なら都度再計算で十分)。

## 3. 優良バッジ(premium)付与ロジック（純関数）

「高評価 × 複数回参加」を満たしたら付与。閾値は調整可能な定数にする(運用で変えられるよう env/設定値)。

```ts
// 付与基準(MVP初期値。運用で調整)。
const PREMIUM_CRITERIA = {
  minRatingAvg: 4.0,   // 平均評価 4.0 以上
  minRatingCount: 5,   // 受領評価 5件以上(評価の信頼性を担保)
  minAttended: 2,      // 参加(成立・done)2回以上 = 「複数回参加」
};

// 純関数: 付与すべきか判定
function qualifiesForPremium(p: {
  ratingAvg: number;
  ratingCount: number;
  attendedCount: number;
}): boolean {
  return (
    p.ratingAvg >= PREMIUM_CRITERIA.minRatingAvg &&
    p.ratingCount >= PREMIUM_CRITERIA.minRatingCount &&
    p.attendedCount >= PREMIUM_CRITERIA.minAttended
  );
}
```

### 付与処理
```
評価集計の直後に qualifiesForPremium(profile) を評価:
  true かつ 未保有(Badge に premium 無し) なら
    INSERT Badge(userId, type=premium, grantedBy="system",
                 criteriaSnapshot={ ratingAvg, ratingCount, attendedCount })
    → badge_granted 通知
  @@unique([userId, type]) で重複付与を防止(冪等)
```

- **criteriaSnapshot** に付与時点の数値を残す。後から基準を変えても「なぜ付与されたか」を再現できる。
- **降格(剥奪)**: MVPは行わない方針(一度付与したら維持)。低評価が続く場合の剥奪は運用ポリシー次第でS6以降に検討(その場合も Badge を削除 or 無効フラグで監査を残す)。
- **手動付与**: 運営が例外的に付与する場合は `grantedBy=admin.userId`。

## 4. 限定イベント(requiresBadge)との連携

- `Slot.requiresBadge=true` の枠は **premium 保有者のみ応募可**。
- 応募ゲートで `meetsBadge(requiresBadge, hasPremium)` を判定([`matching-logic.md`](./matching-logic.md) §2)。
- `hasPremium` は `Badge where userId=? and type=premium` の存在で判定(索引 `Badge(userId,type)`)。

## 5. 単体テスト観点（S5/S6 Vitest）

- **集計**: 空→avg0/count0 / [5,4,3]→avg4.0,count3 / 端数の丸め。
- **付与判定**:
  - avg4.0 count5 attended2 → true。
  - avg3.9(<4.0) → false / count4(<5) → false / attended1(<2) → false。
  - 既に premium 保有 → 二重付与しない(冪等)。
- **評価ゲート**: 非同席者を評価→拒否 / 自分自身→拒否 / 二重評価→拒否(UNIQUE)。
- **限定応募**: requiresBadge かつ premium 無し→`badge_required` / premium 有り→ok。

## 6. API 一覧（草案 / S5-S6実装）

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/api/ratings/pending` | 評価すべき相手一覧(done参加の同席者・未評価) |
| POST | `/api/ratings` | 評価投稿(同席者検証・二重不可) |
| GET | `/api/me/profile` | 自分の評価サマリ・バッジ表示 |
| GET | `/api/admin/badges?type=premium` | バッジ付与状況(運営) |
| PUT | `/api/admin/badges` | 手動付与(例外運用) |

## 7. セキュリティ / PII

- 評価コメントはサニタイズ(XSS/制御文字)。被評価者への見せ方は匿名/集計を基本に(誰が何点付けたかの直結露出を避ける運用。S5で決定)。
- 評価は同席者間のみ(IDOR: rateeId が同 Slot の accepted か検証)。
- バッジ付与は `criteriaSnapshot` + `grantedBy` で監査可能に。
