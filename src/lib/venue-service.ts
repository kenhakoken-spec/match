// =============================================================================
// matching-app — S8 会場候補レコメンドサービス（route ↔ domain/repo の橋渡し）
// 正典: docs/01_s8_spec.md 要望2 / docs/backend/api-contract-s8-foundation.md
//
// 役割:
//  - 成立した枠に対し、エリア×人数(6名)で「合コン向きの店候補」を生成する。
//  - 各候補に 食べログ点数・Google点数 を併記し、合コン向き度(fitScore)でソート。
//  - 候補が揃ったら運営へ通知する（殿が選んで予約 → 会場入力）。
//  - 飲食店予約そのものは人間(=殿)が行う。ここは「候補出し + 通知」までを自動化する。
//
// 設計方針（将来の実API差し替え）:
//  - `recommendVenues(area, size)` は **純関数** で、現状は実食べログ/Google API が
//    無いためモック候補を返す（決定的・テスト可能）。実API接続時はこの関数の中身だけを
//    差し替えればよい（fetch → 正規化 → computeFitScore で fitScore 付与）。署名は不変。
//  - `computeFitScore(...)` も **純関数**（食べログ点×係数 + Google点×係数 + 席タイプ）。
//
// 副作用（repo 書き込み / 通知）は service 層の関数（suggest/choose/reject）に閉じる。
// 認証・認可・入力検証は route 側で済ませた前提（requireAdmin / zod）。
// =============================================================================

import "server-only";
import { getRepo } from "@/lib/repo";
import { sendNotification } from "@/lib/notify-mock";
import type { Area } from "@/lib/types";
import type {
  VenueCandidateEntity,
  MatchEntity,
} from "@/lib/repo";

// -----------------------------------------------------------------------------
// 純関数: fitScore（合コン向き度）の算出
// -----------------------------------------------------------------------------

/** 席タイプ（合コン向き度に効く簡易要素）。個室 > 半個室 > 通常席 の順で加点。 */
export type SeatType = "private_room" | "semi_private" | "table" | "counter";

/** fitScore 算出の入力。点数は欠損(null)可（その項目は寄与0）。 */
export interface FitScoreInput {
  /** 食べログ点数（概ね 3.0〜4.0 のレンジ）。未取得は null。 */
  tabelogScore: number | null;
  /** Google点数（概ね 1.0〜5.0 のレンジ）。未取得は null。 */
  googleScore: number | null;
  /** 席タイプ（合コンは個室・半個室が向く）。未指定は通常席相当。 */
  seatType?: SeatType;
}

// 係数（合コン向き度の重み付け）。食べログを主・Googleを従とし、席タイプで微調整する。
// 正規化: 食べログは満点5.0、Googleは満点5.0 とみなして 0..1 に寄せてから合成する。
const TABELOG_WEIGHT = 0.5; // 食べログ点（味/評判）の寄与。
const GOOGLE_WEIGHT = 0.3; // Google点（一般評判/口コミ数の代理）の寄与。
const SEAT_WEIGHT = 0.2; // 席タイプ（合コンのしやすさ）の寄与。

/** 席タイプの合コン適性（0..1）。個室が最も合コン向き。 */
function seatFitFactor(seat: SeatType | undefined): number {
  switch (seat) {
    case "private_room":
      return 1.0; // 個室: 会話が弾みやすく合コン最適。
    case "semi_private":
      return 0.8; // 半個室。
    case "table":
      return 0.55; // 通常テーブル席。
    case "counter":
      return 0.25; // カウンターは合コン向きでない。
    default:
      return 0.55; // 未指定は通常席相当。
  }
}

/** 点数(満点5.0想定)を 0..1 に正規化（null は 0、範囲外はクランプ）。 */
function norm5(score: number | null): number {
  if (score == null || !Number.isFinite(score)) return 0;
  if (score <= 0) return 0;
  if (score >= 5) return 1;
  return score / 5;
}

/**
 * 合コン向き度(fitScore, 0..1)を算出する純関数。
 * = 食べログ正規化×0.5 + Google正規化×0.3 + 席適性×0.2。
 * 小数第2位に丸める（表示・ソートの安定）。
 *
 * 設計意図:
 *  - 食べログ/Google が両方欠損なら席タイプのみで最大 0.2（情報が薄い候補は低く出る）。
 *  - 個室の高評価店ほど 1.0 に近づく。
 */
export function computeFitScore(input: FitScoreInput): number {
  const t = norm5(input.tabelogScore) * TABELOG_WEIGHT;
  const g = norm5(input.googleScore) * GOOGLE_WEIGHT;
  const s = seatFitFactor(input.seatType) * SEAT_WEIGHT;
  return round2(t + g + s);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// -----------------------------------------------------------------------------
// 純関数: 会場候補のレコメンド（モック。実API差し替え点）
// -----------------------------------------------------------------------------

/** レコメンド1件（fitScore は computeFitScore で付与済み）。 */
export interface RecommendedVenue {
  name: string;
  url: string | null;
  tabelogScore: number | null;
  googleScore: number | null;
  seatType: SeatType;
  fitScore: number;
}

/**
 * エリアごとのモック店舗カタログ（実API未接続のためのダミー）。
 * 実食べログ/Google API 接続時は recommendVenues 内のこの参照を fetch に差し替える。
 * 点数は現実的なレンジ（食べログ 3.0〜3.8 / Google 3.5〜4.5）で固定（決定的＝テスト可能）。
 */
const MOCK_CATALOG: Record<
  Area,
  Array<Omit<RecommendedVenue, "fitScore">>
> = {
  ebisu: [
    { name: "個室和食 恵比寿はなれ", url: "https://example.com/ebisu-hanare", tabelogScore: 3.64, googleScore: 4.3, seatType: "private_room" },
    { name: "恵比寿 イタリアン Lumino", url: "https://example.com/ebisu-lumino", tabelogScore: 3.52, googleScore: 4.1, seatType: "semi_private" },
    { name: "恵比寿 創作ダイニング 凪", url: "https://example.com/ebisu-nagi", tabelogScore: 3.41, googleScore: 4.0, seatType: "table" },
    { name: "恵比寿 立ち飲み 楽", url: null, tabelogScore: 3.18, googleScore: 3.6, seatType: "counter" },
  ],
  ikebukuro: [
    { name: "個室居酒屋 池袋 蔵", url: "https://example.com/ikebukuro-kura", tabelogScore: 3.55, googleScore: 4.2, seatType: "private_room" },
    { name: "池袋 海鮮個室 漁火", url: "https://example.com/ikebukuro-isaribi", tabelogScore: 3.46, googleScore: 4.0, seatType: "semi_private" },
    { name: "池袋 イタリアンバル Sole", url: "https://example.com/ikebukuro-sole", tabelogScore: 3.33, googleScore: 3.9, seatType: "table" },
    { name: "池袋 横丁 串よし", url: null, tabelogScore: 3.12, googleScore: 3.7, seatType: "counter" },
  ],
  ginza: [
    { name: "個室和食 銀座はなれ", url: "https://example.com/ginza-hanare", tabelogScore: 3.72, googleScore: 4.4, seatType: "private_room" },
    { name: "銀座 イタリアン Bar Sei", url: "https://example.com/ginza-bar-sei", tabelogScore: 3.58, googleScore: 4.2, seatType: "semi_private" },
    { name: "銀座 和ダイニング 月見", url: "https://example.com/ginza-tsukimi", tabelogScore: 3.44, googleScore: 4.0, seatType: "table" },
    { name: "銀座 立ち飲み やまだ", url: null, tabelogScore: 3.21, googleScore: 3.7, seatType: "counter" },
  ],
};

/**
 * 会場候補をレコメンドする **純関数**（副作用なし）。
 * 現状は実食べログ/Google API が無いためモックカタログから生成する（決定的）。
 *
 * @param area    対象エリア。
 * @param size    参加人数（6名想定）。人数で個室適性の足切りを微調整する。
 * @param maxResults 返す最大件数（既定 3 = 運営が選びやすい数）。
 * @returns fitScore 降順（同点は名前昇順）に並べた候補配列。
 *
 * 実API差し替え方針:
 *   この関数の中身を「food APIへ area/人数で問い合わせ → 各店の tabelogScore/googleScore/
 *   seatType を正規化 → computeFitScore で fitScore 付与 → ソート」に置き換える。
 *   署名（area, size, maxResults → RecommendedVenue[]）は変えない。
 */
export function recommendVenues(
  area: Area,
  size: number,
  maxResults = 3
): RecommendedVenue[] {
  const catalog = MOCK_CATALOG[area] ?? [];
  // 6名以上の合コンはカウンターを除外（席が足りない/会話しづらい）。
  const partySize = Number.isFinite(size) && size > 0 ? size : 6;
  const filtered =
    partySize >= 6
      ? catalog.filter((c) => c.seatType !== "counter")
      : catalog;

  const scored: RecommendedVenue[] = filtered.map((c) => ({
    name: c.name,
    url: c.url,
    tabelogScore: c.tabelogScore,
    googleScore: c.googleScore,
    seatType: c.seatType,
    fitScore: computeFitScore({
      tabelogScore: c.tabelogScore,
      googleScore: c.googleScore,
      seatType: c.seatType,
    }),
  }));

  scored.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.name.localeCompare(b.name);
  });

  return scored.slice(0, Math.max(0, maxResults));
}

// -----------------------------------------------------------------------------
// service（副作用あり）: 候補生成 + 運営通知 / 採用 / 却下
// -----------------------------------------------------------------------------

/** suggestVenuesForSlot の結果。 */
export interface SuggestResult {
  /** 生成（または既存）した候補（fitScore 降順）。 */
  candidates: VenueCandidateEntity[];
  /** 新規に生成した件数（冪等再実行で既存があれば 0）。 */
  created: number;
  /** 運営へ通知した件数（admin 人数 ×1）。既に通知済み枠なら 0。 */
  notified: number;
}

/**
 * 成立枠に会場候補を生成し、運営へ通知する。
 *
 * 冪等性: 既にこの枠へ候補がある場合は **再生成しない**（重複候補・重複通知の防止）。
 * 成立検知時の自動呼び出し / admin の手動 suggest の両方からこの関数を使う。
 *
 * 手順:
 *  1. slot を解決（無ければ candidates 空・created/notified 0 で返す＝route が 404 判断）。
 *  2. 既存候補があればそれを返す（再生成しない）。
 *  3. recommendVenues(area, 6) で候補を生成し repo に保存（suggestedBy 記録）。
 *  4. 運営(admin)へ内部通知（match_to_admin を流用＝運営宛アクション通知）。
 *     payload は運用情報のみ（PII最小: 個人名/lineUserId は入れない）。
 *
 * @param slotId      対象成立枠。
 * @param suggestedBy 追加主体（admin userId / "system"=自動）。監査用。
 */
export async function suggestVenuesForSlot(
  slotId: string,
  suggestedBy: string
): Promise<SuggestResult> {
  const repo = getRepo();

  const slot = await repo.slots.findById(slotId);
  if (!slot) {
    return { candidates: [], created: 0, notified: 0 };
  }

  // 冪等: 既に候補があれば再生成しない。
  const existing = await repo.venueCandidates.listBySlot(slotId);
  if (existing.length > 0) {
    return { candidates: existing, created: 0, notified: 0 };
  }

  // 候補生成（6名想定）。
  const recommended = recommendVenues(slot.area, slot.capacityPerGender * 2);
  const created: VenueCandidateEntity[] = [];
  for (const r of recommended) {
    const c = await repo.venueCandidates.create({
      slotId,
      name: r.name,
      url: r.url,
      tabelogScore: r.tabelogScore,
      googleScore: r.googleScore,
      fitScore: r.fitScore,
      area: slot.area,
      suggestedBy,
    });
    created.push(c);
  }

  // 運営へ通知（候補が揃った → 殿が選んで予約）。
  // 通知種別は **reminder**（運営への「予約してね」の催促）を使う。成立検知の
  // match_to_admin（「枠が成立しました」）とは別イベントなので種別を分け、成立通知の
  // 冪等カウント（listByMatch(id,"match_to_admin")===1）を汚さない。
  let notified = 0;
  if (created.length > 0) {
    const match = await repo.matches.findBySlotId(slotId);
    const admins = await listAdmins();
    const topCandidate =
      created
        .slice()
        .sort((a, b) => (b.fitScore ?? -Infinity) - (a.fitScore ?? -Infinity))[0]
        ?.name ?? null;
    for (const adminId of admins) {
      await sendNotification({
        userId: adminId,
        type: "reminder",
        slotId,
        matchId: match?.id ?? null,
        // PII最小: 運用情報のみ。店名は運用情報として可（個人情報ではない）。
        payload: {
          kind: "venue_candidates_ready",
          slotId,
          matchId: match?.id ?? null,
          area: slot.area,
          datetimeStart: slot.datetimeStart.toISOString(),
          candidateCount: created.length,
          topCandidate,
          message: "会場候補が揃いました。選んで予約してください。",
        },
      });
      notified += 1;
    }
  }

  // 返却はソート済み（fitScore 降順）で。
  const candidates = await repo.venueCandidates.listBySlot(slotId);
  return { candidates, created: created.length, notified };
}

/** chooseVenueCandidate の結果コード。 */
export type ChooseVenueError =
  | "candidate_not_found"
  | "candidate_not_suggestable"
  | "match_not_found"
  | "match_not_settable";

export interface ChooseVenueResult {
  candidate: VenueCandidateEntity | null;
  match: MatchEntity | null;
  error: ChooseVenueError | null;
}

/** 会場確定の入力（予約名は別途 admin 入力 / venueName・URL は候補から転記可）。 */
export interface ChooseVenueInput {
  reservationName: string;
  /** 省略時は候補の name を転記。 */
  venueName?: string;
  /** 省略時は候補の url を転記。 */
  venueUrl?: string | null;
  meetingPlace?: string | null;
}

/**
 * 候補を採用(chosen)し、その内容で Match.setVenue を呼んで会場を確定する。
 * 既存の会場確定フロー（POST /api/admin/matches/[id]/venue → Match.setVenue）と整合する
 * （同じ repo.matches.setVenue を通すため、status=venue_set / confirmedAt=now になる）。
 *
 * ガード:
 *  - 候補が無い → candidate_not_found。
 *  - 候補が suggested 以外（既に chosen/rejected）→ candidate_not_suggestable。
 *  - 枠の Match が無い → match_not_found。
 *  - Match が notified/canceled（確定不可状態）→ match_not_settable。
 *
 * @param candidateId 採用する候補ID。
 * @param input       予約名（必須）＋会場名/URL/集合場所（省略時は候補から転記）。
 */
export async function chooseVenueCandidate(
  candidateId: string,
  input: ChooseVenueInput
): Promise<ChooseVenueResult> {
  const repo = getRepo();

  const candidate = await repo.venueCandidates.findById(candidateId);
  if (!candidate) {
    return { candidate: null, match: null, error: "candidate_not_found" };
  }
  if (candidate.status !== "suggested") {
    return { candidate, match: null, error: "candidate_not_suggestable" };
  }

  const match = await repo.matches.findBySlotId(candidate.slotId);
  if (!match) {
    return { candidate, match: null, error: "match_not_found" };
  }
  // notified 後 / canceled は会場を差し替えない（既存 venue ルートと同じ運用ガード）。
  if (match.status === "notified" || match.status === "canceled") {
    return { candidate, match, error: "match_not_settable" };
  }

  // 候補を chosen に。
  const chosen = await repo.venueCandidates.setStatus(candidateId, "chosen");

  // Match へ会場を確定（候補から転記 + 予約名を反映）。
  const updatedMatch = await repo.matches.setVenue(match.id, {
    venueName: input.venueName ?? candidate.name,
    venueUrl: input.venueUrl !== undefined ? input.venueUrl : candidate.url,
    reservationName: input.reservationName,
    meetingPlace: input.meetingPlace ?? null,
  });

  return { candidate: chosen ?? candidate, match: updatedMatch, error: null };
}

/** rejectVenueCandidate の結果。 */
export interface RejectVenueResult {
  candidate: VenueCandidateEntity | null;
  error: "candidate_not_found" | "candidate_not_suggestable" | null;
}

/**
 * 候補を却下(rejected)する（運営が選択肢から外す）。
 * suggested のものだけ却下できる（既に chosen を取り消す運用はここでは扱わない）。
 */
export async function rejectVenueCandidate(
  candidateId: string
): Promise<RejectVenueResult> {
  const repo = getRepo();
  const candidate = await repo.venueCandidates.findById(candidateId);
  if (!candidate) {
    return { candidate: null, error: "candidate_not_found" };
  }
  if (candidate.status !== "suggested") {
    return { candidate, error: "candidate_not_suggestable" };
  }
  const rejected = await repo.venueCandidates.setStatus(candidateId, "rejected");
  return { candidate: rejected ?? candidate, error: null };
}

/**
 * 会場候補一覧（fitScore 降順）。route の GET から呼ぶ薄いラッパ。
 * 枠が存在しなければ null（route が 404 を返す）。
 */
export async function listVenueCandidatesForSlot(
  slotId: string
): Promise<VenueCandidateEntity[] | null> {
  const repo = getRepo();
  const slot = await repo.slots.findById(slotId);
  if (!slot) return null;
  return repo.venueCandidates.listBySlot(slotId);
}

/**
 * 運営宛通知の宛先（admin の userId 群）を解決する。
 * match-service.listAdmins と同じ方針（seed-admin 起点）。実DBでは role=admin を引く。
 */
async function listAdmins(): Promise<string[]> {
  const repo = getRepo();
  const seedAdmin = await repo.users.findById("seed-admin");
  const ids = new Set<string>();
  if (seedAdmin && seedAdmin.role === "admin") ids.add(seedAdmin.id);
  return [...ids];
}
