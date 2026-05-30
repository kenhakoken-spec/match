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
