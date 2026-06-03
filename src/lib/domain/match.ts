// =============================================================================
// matching-app — pure domain functions for S3 成立判定 + 通知文面 (match)
// 副作用なし・DB非依存。vitest で単体テスト必須。
// 正典: docs/backend/api-contract-s3.md §1,§5 / docs/backend/matching-logic.md §3
//        / docs/backend/notification.md §2.1（venue_to_member の文面要素）
//
// 設計方針:
//  - 成立判定(isSlotFull)は S2 の applyAtomic 内部判定を **明示的な純関数** に切り出し、
//    境界（男2女3 / 男3女2 / canceled は数えない / 空）を単体テストできる形にする。
//  - 通知文面(buildVenueMessage)は master_plan §3 step7 の 6要素
//    （日時 / エリア / 店名 / 予約URL / 予約名 / 集合）を **すべて** 含む純関数。
//    実 LINE 送信とは独立にテストできる（notification.md §2.1 の文面例に対応）。
// =============================================================================

import type { Gender, Area } from "@/lib/types";

/**
 * 成立判定: 男女それぞれ有効応募(applied/accepted)が capacity 以上か。
 *
 * - applied と accepted のみを数える（canceled は除外）。
 * - 男 >= cap かつ 女 >= cap のとき true（= 3対3 充足）。
 * - 防御的に: capacity <= 0 / 非有限は「成立不可」とみなし false を返す。
 *
 * matching-logic.md §3 の countApplied + isMatched を 1 関数に統合した形。
 * applyAtomic（repo）はこのロジックと同義の判定で Slot を filled にしており、
 * 本関数はその判定基準を独立にテスト可能化する（契約§5）。
 */
export function isSlotFull(
  applications: { gender: Gender; status: "applied" | "accepted" | "canceled" }[],
  capacityPerGender: number
): boolean {
  if (!Number.isFinite(capacityPerGender) || capacityPerGender <= 0) return false;
  let male = 0;
  let female = 0;
  for (const a of applications) {
    if (a.status !== "applied" && a.status !== "accepted") continue;
    if (a.gender === "male") male += 1;
    else if (a.gender === "female") female += 1;
  }
  return male >= capacityPerGender && female >= capacityPerGender;
}

// =============================================================================
// S12 #10 — 定員の柔軟化(合計6人で 2:4〜4:2 を許容)。
//   殿FB#10/strategy §4: 男女厳密3:3固定でなく、合計6人で柔軟に成立させたい。
//   厳密3:3固定の枠は引き続き isSlotFull(per-gender cap) を使う。柔軟枠はこちらを使う。
// =============================================================================

/** 柔軟定員の構成。Slot の capacityTotal/minPerGender/maxPerGender に対応。 */
export interface FlexCapacity {
  /** 会の合計定員(既定6)。 */
  capacityTotal: number;
  /** 各性別の最低人数(偏り防止。既定2)。 */
  minPerGender: number;
  /** 各性別の上限人数(過充足防止。既定4)。 */
  maxPerGender: number;
}

/** S12 #10 の既定: 合計6人・各性別 2〜4。3:3 / 2:4 / 4:2 を許容、6:0/5:1 等は不可。 */
export const DEFAULT_FLEX_CAPACITY: FlexCapacity = {
  capacityTotal: 6,
  minPerGender: 2,
  maxPerGender: 4,
};

/** 有効応募(applied/accepted)を性別ごとに数える(canceled は除外)。 */
function countActive(
  applications: { gender: Gender; status: "applied" | "accepted" | "canceled" }[]
): { male: number; female: number } {
  let male = 0;
  let female = 0;
  for (const a of applications) {
    if (a.status !== "applied" && a.status !== "accepted") continue;
    if (a.gender === "male") male += 1;
    else if (a.gender === "female") female += 1;
  }
  return { male, female };
}

/**
 * その性別をあと1名 **受け入れてよいか**(柔軟定員の応募ゲート)。
 *   - 過充足防止: 受け入れ後にその性別が maxPerGender を超えない。
 *   - 合計超過防止: 受け入れ後に合計が capacityTotal を超えない。
 * minPerGender は「成立」の条件であって応募の可否には使わない(最初の1人を弾かないため)。
 * 不正な定員値(非有限/<=0、min>max、min*2>total)は防御的に false(=受け入れ不可)。
 */
export function canAcceptGenderFlex(
  current: { male: number; female: number },
  gender: Gender,
  cap: FlexCapacity = DEFAULT_FLEX_CAPACITY
): boolean {
  if (!isValidFlexCapacity(cap)) return false;
  const male = current.male + (gender === "male" ? 1 : 0);
  const female = current.female + (gender === "female" ? 1 : 0);
  const mine = gender === "male" ? male : female;
  if (mine > cap.maxPerGender) return false;
  if (male + female > cap.capacityTotal) return false;
  return true;
}

/**
 * 柔軟定員での **成立判定**。
 *   合計が capacityTotal に達し、かつ 各性別が [minPerGender, maxPerGender] に収まる。
 *   例(既定 6/2/4): 3:3=○ / 2:4=○ / 4:2=○ / 5:1=× / 6:0=× / 1:5=×。
 *   applied/accepted のみ数える(canceled 除外)。不正な定員値は false。
 */
export function isSlotFullFlex(
  applications: { gender: Gender; status: "applied" | "accepted" | "canceled" }[],
  cap: FlexCapacity = DEFAULT_FLEX_CAPACITY
): boolean {
  if (!isValidFlexCapacity(cap)) return false;
  const { male, female } = countActive(applications);
  if (male + female !== cap.capacityTotal) return false;
  if (male < cap.minPerGender || male > cap.maxPerGender) return false;
  if (female < cap.minPerGender || female > cap.maxPerGender) return false;
  return true;
}

/** 柔軟定員の整合チェック(防御)。min<=max、min*2<=total<=max*2、すべて有限の正数。 */
export function isValidFlexCapacity(cap: FlexCapacity): boolean {
  const { capacityTotal, minPerGender, maxPerGender } = cap;
  if (
    !Number.isFinite(capacityTotal) ||
    !Number.isFinite(minPerGender) ||
    !Number.isFinite(maxPerGender)
  ) {
    return false;
  }
  if (capacityTotal <= 0 || minPerGender < 0 || maxPerGender <= 0) return false;
  if (minPerGender > maxPerGender) return false;
  // 2性別なので min*2 <= total <= max*2 でなければ成立解が存在しない。
  if (minPerGender * 2 > capacityTotal) return false;
  if (maxPerGender * 2 < capacityTotal) return false;
  return true;
}

/** エリアコード → 日本語表示（通知文面用）。 */
const AREA_LABEL: Record<Area, string> = {
  ebisu: "恵比寿",
  ikebukuro: "池袋",
  ginza: "銀座",
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 日時を JST(Asia/Tokyo, UTC+9) の「YYYY年M月D日(曜) HH:MM」表記にする。
 * 環境のローカルタイムゾーンに依存しないよう UTC+9 を明示的に加算して算出する
 * （サーバ/CI のタイムゾーン差で文面がブレないため）。
 */
function formatJst(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = jst.getUTCMonth() + 1;
  const da = jst.getUTCDate();
  const w = WEEKDAY_JA[jst.getUTCDay()];
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}年${mo}月${da}日(${w}) ${hh}:${mi}`;
}

export interface VenueMessageInput {
  datetimeStart: Date;
  area: Area;
  venueName: string;
  venueUrl: string | null;
  reservationName: string;
  meetingPlace: string | null;
}

/**
 * 会場確定 → 6人へ送る本命メッセージ(venue_to_member)の文面を生成する純関数。
 *
 * master_plan §3 step7 / notification.md §2.1 の必須要素を **すべて** 含む:
 *   日時 / エリア / 店名 / 予約URL / 予約名 / 集合場所。
 * venueUrl / meetingPlace が null の場合も「URL」「集合」のラベル行は出し、
 * 値を補助文言（未定/当日案内）に置換する（6要素が常に文面に現れることを保証）。
 *
 * 文面・要素の有無は副作用なくテストできる（match.test.ts で 6要素を assert）。
 */
export function buildVenueMessage(input: VenueMessageInput): string {
  const lines = [
    "🎉 合コンが成立しました！",
    "",
    `📅 日時: ${formatJst(input.datetimeStart)}`,
    `📍 エリア: ${AREA_LABEL[input.area]}`,
    `🍽 お店: ${input.venueName}`,
    `🔗 予約URL: ${input.venueUrl && input.venueUrl.length > 0 ? input.venueUrl : "（なし）"}`,
    `🔖 ご予約名: ${input.reservationName}`,
    `🧭 集合: ${input.meetingPlace && input.meetingPlace.length > 0 ? input.meetingPlace : "当日ご案内します"}`,
    "",
    "当日はお気をつけてお越しください。",
    "※キャンセルが必要な場合は運営までご連絡ください。",
  ];
  return lines.join("\n");
}
