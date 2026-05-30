# マッチングロジック設計 — 3対3 成立判定 + 応募ゲート (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS2(枠/応募)〜S3(成立)。ロジックは単体テスト可能な純関数に分離する。
> 最終更新: 2026-05-30（本人認証ゲート / 限定イベント条件 / 決済連携を反映）

## 0. 方針

- マッチングは**レコメンドではない**。運営が用意した枠(日時×エリア)にユーザーが**応募**し、**男3/女3が揃ったら成立**する。
- スコアリング/相性アルゴリズムは無い(OUTスコープ)。判定は「定員カウント」+「応募ゲート(認証/条件/決済)」。
- 判定ロジックは**副作用のない純関数**に切り出し、DB/通知/決済から独立して単体テストできる形にする。

## 1. 状態遷移（コアループの状態マシン）

```
Slot.status:  open ─(男3&女3 充足)─▶ filled ─(運営が会場入力)─▶ confirmed ─(開催後)─▶ done ─(評価期間)─▶ (アーカイブ)
                │                       │                          │
                └────────── canceled ◀──┴──────────────────────────┘ (運営判断)

Match.status: (filled時に生成) pending_venue ─(会場入力)─▶ venue_set ─(6人へ通知)─▶ notified
                                     └────────── canceled ◀──────────┘

Application.status: applied ─(成立確定)─▶ accepted ─(done後)─▶ (評価対象)
                       └─(取消/除外)─▶ canceled

Payment.status(男性有料回のみ): created ─▶ requires_capture ─(成立)─▶ succeeded
                                              └─(不成立)─▶ canceled   (※不成立は課金しない)
```

### 段階と担当
| 段階 | トリガー | 担当 | 結果 |
|------|----------|------|------|
| 枠作成(条件設定可) | 運営が日時×エリア+条件を登録 | admin | `Slot(open)` |
| 応募(ゲート判定) | ユーザーが応募 | user | ゲート通過→`Application(applied)` (+男性有料回は Payment) |
| **成立判定** | 応募確定直後に評価 | system | 男女充足→`Slot(filled)`+`Match(pending_venue)`、男性決済を確定 |
| 運営通知 | 成立検知 | system→admin | `NotificationLog(match_to_admin)` |
| 会場入力 | 運営が店名/URL/予約名 | admin | `Match(venue_set)`+`Slot(confirmed)` |
| メンバー通知 | 運営が「通知送信」 | admin→6人 | `venue_to_member`×6, `Match(notified)` |
| 開催完了 | 日時経過 | admin/batch | `Slot(done)`, 参加者 `attendedCount++`, `rating_request` 通知 |
| 評価 | ユーザーが相互評価 | user | `Rating` 追加→ Profile集計更新→ バッジ判定 |
| 中止 | 定員割れ/会場不可 | admin | `Slot/Match canceled`, 決済 canceled(返金), `slot_canceled` 通知 |

## 2. 応募ゲート（純関数 / 応募可否の判定）

応募は以下を**全て**満たす場合のみ受理する。各条件は純関数として単体テスト可能にする。

```ts
type Gender = 'male' | 'female';

// (a) 本人認証ゲート: approved 必須
function isIdentityApproved(identityStatus: string): boolean {
  return identityStatus === 'approved';
}

// (b) 年齢条件(限定イベント): birthdate と枠の minAge/maxAge から判定
function calcAge(birthdate: Date, at: Date): number {
  let age = at.getFullYear() - birthdate.getFullYear();
  const m = at.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birthdate.getDate())) age -= 1;
  return age;
}
function meetsAge(age: number, minAge?: number | null, maxAge?: number | null): boolean {
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

// (c) バッジ条件(限定イベント): requiresBadge なら premium 保有必須
function meetsBadge(requiresBadge: boolean, hasPremium: boolean): boolean {
  return !requiresBadge || hasPremium;
}

// (d) 定員(過充足防止): その性別がまだ定員未満か
function canApplyCapacity(counts: { male: number; female: number }, gender: Gender, cap: number): boolean {
  return (gender === 'male' ? counts.male : counts.female) < cap;
}

// 総合: 18+(本人認証で担保)はapprovedに含意。プロフィール未登録(gender不明)は別途400。
function canApply(args: {
  identityStatus: string;
  age: number;
  minAge?: number | null;
  maxAge?: number | null;
  requiresBadge: boolean;
  hasPremium: boolean;
  counts: { male: number; female: number };
  gender: Gender;
  capacityPerGender: number;
  slotStatus: string;
}): { ok: boolean; reason?: string } {
  if (args.slotStatus !== 'open') return { ok: false, reason: 'slot_not_open' };
  if (!isIdentityApproved(args.identityStatus)) return { ok: false, reason: 'identity_required' };
  if (!meetsAge(args.age, args.minAge, args.maxAge)) return { ok: false, reason: 'age_not_eligible' };
  if (!meetsBadge(args.requiresBadge, args.hasPremium)) return { ok: false, reason: 'badge_required' };
  if (!canApplyCapacity(args.counts, args.gender, args.capacityPerGender)) return { ok: false, reason: 'capacity_full' };
  return { ok: true };
}
```

## 3. 成立判定（純関数）

```ts
type Counts = { male: number; female: number };

function countApplied(apps: { gender: Gender; status: string }[]): Counts {
  return apps.reduce((c, a) => {
    if (a.status !== 'applied' && a.status !== 'accepted') return c;
    a.gender === 'male' ? (c.male += 1) : (c.female += 1);
    return c;
  }, { male: 0, female: 0 });
}

function isMatched(counts: Counts, capacityPerGender: number): boolean {
  return counts.male >= capacityPerGender && counts.female >= capacityPerGender;
}
```

### 単体テスト観点（S2/S3 Vitest）
- **応募ゲート**: identity未承認→`identity_required` / 19歳が20代限定(20-29)→`age_not_eligible` / 25歳が20代限定→ok / requiresBadge かつ premium無し→`badge_required` / その性別満員→`capacity_full` / 枠がopen以外→`slot_not_open`。
- **年齢計算**: 誕生日前後の境界(誕生日当日/前日)。
- **成立**: 男3女3→true / 男3女2・男2女3→false / canceled は数えない / 空→false。
- **過充足**: canApplyCapacity で阻止。トランザクションで男4/女4を発生させない。

## 4. トランザクション設計（応募〜成立 + 決済の原子性）

```
BEGIN
  1. SELECT slot FOR UPDATE  (status=open でなければ中断/409)
  2. 応募ゲート判定(本人認証approved / 年齢 / バッジ / 定員)。NGは該当エラー(403/409)
  3. 二重応募は UNIQUE(slotId,userId) でDB保証(衝突→409)
  4. (男性 && 非初回) なら 決済の前提を確認:
       - 初回判定: その男性に status=succeeded の Payment が無ければ「初回=無料」
       - 有料なら Payment(created/requires_capture) を作成 or 既存確認 (詳細 payment.md)
       - 不成立時に課金しないため、ここでは「確保」のみ。確定は成立時。
  5. INSERT application(applied)  (+ paymentId 紐付け: 有料回のみ)
  6. countApplied で充足判定:
       男>=cap && 女>=cap なら
         UPDATE slot SET status='filled'
         INSERT match(pending_venue, matchedAt=now)
         (有料の男性 Payment を capture/確定 = succeeded へ: payment.md の方式に従う)
COMMIT
  7. (TX外) 成立なら admin へ match_to_admin 通知 / 男性へ payment_request(事後課金方式の場合)
```

- **行ロック**(`FOR UPDATE`)で枠を直列化し、同時応募の過充足を防ぐ。
- **決済と成立の整合**: 「不成立は課金しない」を守るため、(A)与信確保→成立でcapture→不成立でcancel、または (B)成立後に課金、のいずれか。方式は [`payment.md`](./payment.md) で確定(推奨は事後課金または manual capture)。
- **通知/決済確定の外部I/Oはできるだけ TX外**(失敗で応募がロールバックしない)。失敗は各ログで再試行可能に。

## 5. レイヤリング（テスト容易性のための分離）

```
[Route Handler / Server Action]  ← 認証/認可/入力バリデーション(Zod)/IDOR検証
        │
[application service]            ← トランザクション境界(Prisma $transaction) + Stripe連携
        │
[domain (pure fns)]              ← canApply / countApplied / isMatched / calcAge / badge判定
        │                          (副作用なし = 単体テスト対象)
[Prisma repository]              ← DBアクセス(モック可能な境界)
```

- ドメイン純関数は **DB無しで単体テスト**。
- 統合テストは実DB(Neonテスト用/ローカルPg)。モックDBで通って本番migration失敗、を避ける。
- 決済はテストモード(Stripe test key)で統合テスト。

## 6. 応募ゲートまとめ（限定イベント / 本人認証）

| ゲート | 条件 | 不成立時 |
|--------|------|----------|
| 本人認証 | `IdentityVerification.status == approved` | 403 identity_required |
| 枠状態 | `Slot.status == open` | 409 slot_not_open |
| プロフィール | gender 登録済み | 400 profile_required |
| 年齢(限定) | `minAge<=age<=maxAge`(指定時) | 403 age_not_eligible |
| バッジ(限定) | `requiresBadge` なら premium 保有 | 403 badge_required |
| 定員 | その性別が定員未満 | 409 capacity_full |
| 二重応募 | (slotId,userId) 未存在 | 409 already_applied |
| 決済(男性有料回) | 決済確保/成功(初回は免除) | 402 payment_required |

## 7. 中止・取消時の整合

- **応募取消(open中)**: `Application.canceled`。男性の与信があれば解放(課金しない)。枠はopen継続。
- **応募取消(filled後)**: MVPは「自己取消不可・運営連絡」運用推奨。運営対応で canceled + 枠open戻し or 中止。S3で確定。
- **中止**: `Slot/Match canceled`。男性決済は capture せず canceled(既課金なら refunded)。`slot_canceled` 通知。
