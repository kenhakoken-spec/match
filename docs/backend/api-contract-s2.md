# S2 API契約（凍結） — 枠（Slot）一覧・詳細・応募 ＋ 運営admin枠作成

S2は「運営が用意した枠（日時×エリア）をユーザーが見て応募する」コア体験。frontend/backend共有契約。
正典: [`../00_master_plan.md`](../00_master_plan.md) / S1契約: [`./api-contract-s1.md`](./api-contract-s1.md) / 設計: [`./matching-logic.md`](./matching-logic.md)

## 0. 前提
- S1の認証/セッション/Repository抽象/ゲーティング(canApply)を再利用する。
- 全モック前提（MOCK_DB=1 のインメモリで動く）。S1のseedにテスト枠も追加する。
- **応募の3ゲート**: ①本人認証approved ②プロフィール完成 ③参加条件充足（性別空きあり / 20代限定=年齢band / 優良バッジ限定=badge）。

## 1. 共有型（追加分）
```ts
interface SlotDTO {
  id: string;
  datetimeStart: string;      // ISO8601
  area: "ebisu" | "ikebukuro" | "ginza";
  capacityPerGender: number;  // 3
  filled: { male: number; female: number };  // 現在の確定/応募数
  conditions: { minAge: number | null; maxAge: number | null; requiresBadge: "premium" | null; };
  status: "open" | "filled" | "confirmed" | "done" | "canceled";
  feeMale: number;            // 2000（表示用。女性/初回は別途UIで無料明示）
}
interface SlotDetailDTO extends SlotDTO {
  myApplication: { status: "applied"|"accepted"|"canceled" } | null;
  eligibility: {
    canApply: boolean;
    reasons: string[];  // "identity_required"|"profile_required"|"age_out_of_range"|"badge_required"|"gender_full"|"already_applied"|"slot_closed"
  };
}
```

## 2. エンドポイント（ユーザー）
| Method | Path | 説明 | Res |
|---|---|---|---|
| GET | `/api/slots` | 募集中の枠一覧（`open`中心、日時昇順）。`?area=&from=&to=`任意 | `{ slots: SlotDTO[] }` |
| GET | `/api/slots/[id]` | 枠詳細＋自分の応募可否(eligibility)＋応募状態 | `{ slot: SlotDetailDTO }` |
| POST | `/api/slots/[id]/apply` | 応募。3ゲートをサーバ再検証して通過時のみ作成 | 成功`{application:{status:"applied"}}` / 不可`409 {error:{code,reasons}}` |
| POST | `/api/slots/[id]/cancel` | 自分の応募を取消（締切前/未成立のみ） | `{application:{status:"canceled"}}` |
| GET | `/api/applications` | 自分の応募一覧（U-07用） | `{ items: Array<{ slot: SlotDTO; status }> }` |

## 3. エンドポイント（admin / role=admin）
| Method | Path | 説明 | Req |
|---|---|---|---|
| POST | `/api/admin/slots` | 枠作成 | `{ datetimeStart, area, minAge?, maxAge?, requiresBadge? }` |
| GET | `/api/admin/slots` | 全枠一覧（状況つき） | — |
| POST | `/api/admin/slots/[id]/cancel` | 枠中止 | — |

## 4. 純関数（`src/lib/domain/` 追加・vitest必須）
```ts
evaluateEligibility(input: {
  identityStatus, hasCompleteProfile, gender, age, hasBadgePremium,
  slot: { minAge, maxAge, requiresBadge, status, filled, capacityPerGender },
  alreadyApplied: boolean,
}): { canApply: boolean; reasons: string[] }
genderFull(filled, capacityPerGender, gender): boolean
```
- 20代限定は `minAge=20, maxAge=29`。**応募はサーバ側で必ず再判定**（クライアントのcanApplyを信用しない）。TX内で二重応募・定員超過を防止。

## 5. ファイル所有（衝突回避・重要）
- **backend所有**: `src/app/api/slots/**`, `src/app/api/applications/**`, `src/app/api/admin/slots/**`, `src/lib/domain/eligibility*.ts`(+test), `src/lib/repo/**`(Slot/Application追加), `src/lib/types.ts`(追記), seed拡張。
- **frontend所有**: `src/app/(tabs)/browse/page.tsx`, `src/app/slots/[id]/page.tsx`, `src/app/(tabs)/applications/page.tsx`, `src/app/admin/slots/**`, 関連`src/components/**`追加。
- **S1既存ファイルは原則変更しない**。

## 6. 完了条件（実証必須）
- backend: tsc rc0 / vitest(eligibility網羅: 各reason・境界年齢19/20/29/30) PASS / build exit0 / curl: 一覧200→未承認応募409(identity_required)→承認後応募200→二重応募409(already_applied)→20代限定に31歳409(age_out_of_range)→admin枠作成200。実出力添付。
- frontend: build/tsc PASS / スマホ縦SS（枠一覧・詳細[応募可]・詳細[条件不足]・応募状況・admin枠作成）。空でないこと。
