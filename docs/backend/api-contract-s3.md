# S3 API契約（凍結） — 成立判定(3対3) ＋ 運営admin会場確定 ＋ LINE通知(モック)

S3はコアループの中核: 男女3名ずつ充足→成立(Match)→運営が会場入力→6人へLINE通知。
正典: [`../00_master_plan.md`](../00_master_plan.md) §3 STEP4-7。S1/S2契約を踏襲。

## 0. 前提
- S1/S2の認証/セッション/Repository抽象/ゲート/原子的応募を再利用。全モック(MOCK_DB=1, MOCK_NOTIFY=1)。
- 通知は **MOCK_NOTIFY=1 のとき NotificationLog に記録するのみ**（実LINE送信しない）。文面・宛先6人分を payload に保存。
- 成立はS2の `applyAtomic` が「男女各3名充足で Slot を filled に」する所まで実装済み。S3はそこから先（Match生成・会場確定・通知）を担う。

## 1. 成立判定（backend）
- S2で枠が `filled` になった時点で **Match を生成**（status=`pending_venue`、matchedAt=now、6名の accepted Application を確定）。
- 成立時に **運営へ内部通知**（NotificationLog type=`match_to_admin`）。
- 成立した6名の Application.status を `applied`→`accepted` に。

## 2. 運営admin 会場確定 ＋ 通知（backend / role=admin）
| Method | Path | 説明 | Req |
|---|---|---|---|
| GET | `/api/admin/matches` | 成立一覧（pending_venue / venue_set / notified） | — |
| GET | `/api/admin/matches/[id]` | 成立詳細（6名のプロフィール要約＋枠情報） | — |
| POST | `/api/admin/matches/[id]/venue` | 会場入力（店名/予約URL/予約名/集合）→Match.status=`venue_set` | `{ venueName, venueUrl?, reservationName, meetingPlace }` |
| POST | `/api/admin/matches/[id]/notify` | 6名へLINE通知発火→Match.status=`notified`, Slot.status=`confirmed` | — |

- venue入力は `venueName`/`reservationName` 必須、`venueUrl` 任意、`meetingPlace` 任意。zod検証。
- notify は **会場入力済(venue_set)** でのみ可（未入力なら409）。発火で **6名分の NotificationLog(type=`venue_to_member`)** を作成。
- 通知 payload（文面の素）: `{ datetimeStart, area, venueName, venueUrl, reservationName, meetingPlace }`。MOCK_NOTIFY=1 は status=`sent` で記録（実送信なし）。

## 3. ユーザー側（frontend / backend）
| Method | Path | 説明 | Res |
|---|---|---|---|
| GET | `/api/matches/mine` | 自分が参加する成立の一覧 | `{ items: MatchSummaryDTO[] }` |
| GET | `/api/matches/[id]` | 成立詳細（会場情報。notified後のみ会場を返す。自分が参加者の時のみ＝IDOR防止） | `{ match: MatchDetailDTO }` |

```ts
interface MatchDetailDTO {
  id: string;
  slot: { datetimeStart: string; area: Area };
  status: "pending_venue"|"venue_set"|"notified";
  venue: { venueName: string; venueUrl: string|null; reservationName: string; meetingPlace: string|null } | null; // notified前はnull
  members: Array<{ displayName: string; gender: Gender }>; // 6名の最小情報（PII最小, lineUserId不可）
}
```

## 4. 画面（frontend）
- **U-08 成立詳細**: `src/app/matches/[id]/page.tsx`。会場確定後は店名/予約URL/予約名/集合/日時/エリア/メンバー概要を表示。確定前は「会場手配中」。チャット無しなので**このページが当日の案内所**。
- **U-07 マイ応募状況** 既存を成立反映（成立/会場確定の状態をStatusPillで）。
- **admin A-04 成立確認 / A-05 会場入力&通知**: `src/app/admin/matches/page.tsx` ＋ `src/app/admin/matches/[id]/page.tsx`。会場フォーム→「6名へ通知を送信」ボタン→送信結果（NotificationLog 6件）を表示。

## 5. 純関数（`src/lib/domain/`・vitest必須）
```ts
// 成立判定（S2のapplyAtomic内部判定を関数として明示・テスト可能化）
isSlotFull(applications: {gender:Gender,status:ApplicationStatus}[], capacityPerGender:number): boolean
// 通知文面の生成（純関数・テスト可能）
buildVenueMessage(input: { datetimeStart:Date, area:Area, venueName:string, venueUrl:string|null, reservationName:string, meetingPlace:string|null }): string
```

## 6. ファイル所有
- **backend**: `src/app/api/admin/matches/**`, `src/app/api/matches/**`, `src/lib/domain/match*.ts`(+test), `src/lib/notify-mock.ts`(拡張), `src/lib/repo/**`(Match操作), `src/lib/types.ts`(MatchDTO追記), seed(成立直前の枠＝あと1名で埋まる枠も用意)。
- **frontend**: `src/app/matches/**`, `src/app/admin/matches/**`, `src/app/(tabs)/applications/page.tsx`(成立反映), 関連`src/components/**`。

## 7. 完了条件（実証必須）
- backend: tsc rc0 / vitest全PASS(既存63+match新規) / build BUILD_ID / curl: 6名応募で成立→Match生成(pending_venue)→admin venue入力(venue_set)→未入力notifyは409→入力後notify200でNotificationLog6件(type=venue_to_member,status=sent)+Slot confirmed / 非参加者が GET /api/matches/[id] →403/404(IDOR) / 非admin が venue/notify →403。実出力添付。
- frontend: build/tsc PASS / スマホ縦SS（U-08成立詳細[会場確定後]・admin会場入力&通知送信・マイ応募の成立反映）。空でないこと。
- **通知文面**に master_plan §3-7 の要素（日時/エリア/店名/URL/予約名/集合）が全て含まれること（buildVenueMessageのテストで実証）。
