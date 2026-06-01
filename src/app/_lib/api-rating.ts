// src/app/_lib/api-rating.ts — 評価クライアント（相互評価 / U-15・S8 3軸 + ドタキャン報告）.
//
// The rating backend is implemented and wired (src/app/api/ratings/**). The TRUTH
// for these shapes is src/lib/rating-types.ts + the route/service handlers (read
// those — the .md is a guide). Envelopes verified against the real handlers:
//   GET  /api/ratings/pending          -> PendingRatingDTO[]                    (bare array; route does jsonOk(pending))
//   GET  /api/ratings/received/summary -> { again, talk, manner, overall, count, avg }  (bare; avg=overall 後方互換)
//   POST /api/ratings  {slotId,rateeId,scoreAgain,scoreTalk,scoreManner,comment?,noShowReport?}
//                                      -> 200 { rating, summary, multiAxis, noShow }
//                                      -> 400 self_rate / invalid_score / validation_error
//                                      -> 403 forbidden            (非参加者 / 非同席者)
//                                      -> 409 already_rated        (二重評価)
//
// Per the parallel-impl rule the frontend re-declares the DTO shapes here, kept
// byte-identical to src/lib/rating-types.ts so the later swap is mechanical. On any
// network failure we FALL BACK to contract-shaped dummy data (`// FALLBACK`) so the
// U-15 list + detail render for review even with no live backend.

import { ApiCallError } from "./api";
import { atJstTime } from "./relative-date";
import type { Area } from "./types";

// ---- DTOs (mirror src/lib/rating-types.ts exactly) ----

/** 1件の評価（送信結果の確認に使用）。score は総合(overall)の四捨五入＝後方互換。 */
export interface RatingDTO {
  id: string;
  slotId: string;
  rateeId: string;
  score: number;
  comment: string | null;
  createdAt: string; // ISO8601
}

/** pending 一覧の同席者1名（PII最小: userId / displayName のみ）。 */
export interface PendingMemberDTO {
  userId: string;
  displayName: string;
}

/** 評価可能なイベント1件（done 参加 & 未評価の同席者が残っている Slot）。 */
export interface PendingRatingDTO {
  slotId: string;
  datetime: string; // ISO8601
  area: Area;
  members: PendingMemberDTO[];
}

/** 後方互換の単一スコア集計（POST レスポンスの summary）。 */
export interface RatingSummary {
  avg: number; // 0.0〜5.0（小数1桁）
  count: number;
}

/**
 * S8 多軸 受領評価サマリ（GET /api/ratings/received/summary）。
 * 各軸平均 + 総合(overall) + 件数。avg は overall と同値（後方互換）。
 */
export interface MultiAxisRatingSummary {
  again: number; // 「また会いたい」軸の平均（小数1桁）
  talk: number; // 「会話」軸の平均（小数1桁）
  manner: number; // 「マナー」軸の平均（小数1桁）
  overall: number; // 総合平均（小数1桁）
  count: number; // 受領件数
}

/** GET /api/ratings/received/summary のレスポンス（多軸 + 後方互換 avg）。 */
export interface ReceivedSummary extends MultiAxisRatingSummary {
  avg: number;
}

/** no-show 報告の処理結果（POST レスポンスの noShow）。 */
export interface NoShowOutcome {
  /** この評価が「来なかった」報告を含んでいたか。 */
  reported: boolean;
  /** 参加者からの報告が2人以上に達して確定したか。 */
  confirmed: boolean;
  /** 今回新たに罰金（¥5,000）を課金したか（冪等: 既存があれば false）。 */
  charged: boolean;
}

/**
 * POST /api/ratings の body（S8 / s8_spec 要望4-5）。
 * - 各軸 1〜5（整数）。comment 任意・最大300。
 * - noShowReport: この方を「来なかった」と報告するか（既定 false）。
 */
export interface SubmitRatingInput {
  slotId: string;
  rateeId: string;
  scoreAgain: number;
  scoreTalk: number;
  scoreManner: number;
  comment?: string;
  noShowReport?: boolean;
}

// ---- fetch helpers ----
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}

// ---- FALLBACK dummy data (contract-shaped). Delete when relying on live backend. ----
// 同席者は自分以外の最大5名（done イベント・6名成立のうち自分を除く）。userId/displayName のみ。
const FB_MEMBERS: PendingMemberDTO[] = [
  { userId: "u_riku", displayName: "リク" },
  { userId: "u_yuu", displayName: "ユウ" },
  { userId: "u_mina", displayName: "ミナ" },
  { userId: "u_rika", displayName: "リカ" },
  { userId: "u_aya", displayName: "アヤ" },
];

// 評価可能イベント（過去開催・done）。新しい順。
// 日付は「今から数日前」の相対生成（陳腐化防止 / s9_spec §4）。集合時刻の雰囲気は維持。
function fallbackPending(): PendingRatingDTO[] {
  return [
    {
      slotId: "slot_ebisu_done",
      datetime: atJstTime(-4, 19, 30),
      area: "ebisu",
      members: [...FB_MEMBERS],
    },
    {
      slotId: "slot_ginza_done",
      datetime: atJstTime(-11, 18, 0),
      area: "ginza",
      members: FB_MEMBERS.slice(0, 4),
    },
  ];
}

// ---- public API ----

/** 評価可能なイベント + 未評価の同席者一覧（U-15 一覧）。 */
export async function fetchPendingRatings(): Promise<PendingRatingDTO[]> {
  try {
    return await getJson<PendingRatingDTO[]>("/api/ratings/pending");
  } catch {
    return fallbackPending(); // FALLBACK
  }
}

/** 受領評価サマリ（送信後の反映確認に使用・3軸 + 総合 + 件数）。 */
export async function fetchReceivedSummary(): Promise<ReceivedSummary> {
  try {
    return await getJson<ReceivedSummary>("/api/ratings/received/summary");
  } catch {
    // FALLBACK — まだ受領0でも煽らない素直な初期値。
    return { again: 0, talk: 0, manner: 0, overall: 0, count: 0, avg: 0 };
  }
}

// 1件分の評価結果。canRate をサーバ再判定するため、結果はエラーコードまで返す。
export interface SubmitRatingOutcome {
  ok: boolean;
  rating?: RatingDTO;
  /** ratee 側の更新後の単一スコア集計（後方互換）。 */
  summary?: RatingSummary;
  /** ratee 側の更新後の多軸集計。 */
  multiAxis?: MultiAxisRatingSummary;
  /** no-show 報告の処理結果（報告なし送信時は null）。 */
  noShow?: NoShowOutcome | null;
  /** self_rate | invalid_score | validation_error | forbidden | already_rated | ... */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * 1名分の評価を送信（POST /api/ratings）。rater はサーバ側でセッション sub を使う
 * （body には載せない）。409/400/403 は errorCode を返し、呼び出し側で文言化する。
 * 失敗時（ネットワーク等）は FALLBACK で成功扱いにし、UI フローを確認可能にする。
 */
export async function submitRating(input: SubmitRatingInput): Promise<SubmitRatingOutcome> {
  try {
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new ApiCallError(res.status, await res.json().catch(() => null));
    }
    const data = (await res.json()) as {
      rating: RatingDTO;
      summary: RatingSummary;
      multiAxis: MultiAxisRatingSummary;
      noShow: NoShowOutcome | null;
    };
    return {
      ok: true,
      rating: data.rating,
      summary: data.summary,
      multiAxis: data.multiAxis,
      noShow: data.noShow ?? null,
    };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — backend 不通時のみ。送信できたものとして扱い、確認を妨げない。
    const overall =
      Math.round(((input.scoreAgain + input.scoreTalk + input.scoreManner) / 3) * 10) / 10;
    return {
      ok: true,
      rating: {
        id: `fb_${Date.now()}`,
        slotId: input.slotId,
        rateeId: input.rateeId,
        score: Math.round(overall),
        comment: input.comment?.trim() ? input.comment.trim() : null,
        createdAt: new Date().toISOString(),
      },
      summary: { avg: 0, count: 0 },
      multiAxis: { again: 0, talk: 0, manner: 0, overall: 0, count: 0 },
      noShow: input.noShowReport ? { reported: true, confirmed: false, charged: false } : null,
    };
  }
}

// 評価エラーコード → ユーザー向けの落ち着いた日本語（責めない・事実ベース）。
export function ratingErrorMessage(code: string | undefined): string {
  switch (code) {
    case "already_rated":
      return "この方への評価はすでに送信済みです。";
    case "forbidden":
      return "この会の同席者ではないため、評価できません。";
    case "self_rate":
      return "ご自身は評価の対象になりません。";
    case "invalid_score":
    case "validation_error":
      return "評価の内容を確認のうえ、もう一度お試しください。";
    default:
      return "送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。";
  }
}
