// src/app/_lib/api-rating.ts — S5 client fetch helpers (相互評価 / U-15).
//
// The S5 backend is implemented and wired (src/app/api/ratings/**). The TRUTH for
// these shapes is src/lib/rating-types.ts + the route handlers (read those — the
// .md is a guide). Envelopes verified against the real route handlers:
//   GET  /api/ratings/pending          -> PendingRatingDTO[]            (bare array; route does jsonOk(pending))
//   GET  /api/ratings/received/summary -> RatingSummary                 ({ avg, count })
//   POST /api/ratings  {slotId,rateeId,score,comment?}
//                                      -> 200 { rating, summary }
//                                      -> 400 self_rate / invalid_score / validation_error
//                                      -> 403 forbidden            (非参加者 / 非同席者)
//                                      -> 409 already_rated        (二重評価)
//
// Per the parallel-impl rule the frontend re-declares the S5 DTO shapes here, kept
// byte-identical to src/lib/rating-types.ts so the later swap is mechanical. On any
// network failure we FALL BACK to contract-shaped dummy data (`// FALLBACK`) so the
// U-15 list + detail render for review even with no live backend.

import { ApiCallError } from "./api";
import type { Area } from "./types";

// ---- S5 DTOs (mirror src/lib/rating-types.ts exactly) ----

/** 1件の評価（送信結果の確認に使用）。 */
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

/** 受領評価サマリ（自分の集計。/api/ratings/received/summary）。 */
export interface RatingSummary {
  avg: number; // 0.0〜5.0（小数1桁）
  count: number;
}

/** POST /api/ratings の body（契約 §2）。comment 任意・最大300。 */
export interface SubmitRatingInput {
  slotId: string;
  rateeId: string;
  score: number; // 1〜5（整数）
  comment?: string;
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
const FB_PENDING: PendingRatingDTO[] = [
  {
    slotId: "slot_ebisu_done",
    datetime: "2026-05-29T19:30:00+09:00",
    area: "ebisu",
    members: FB_MEMBERS,
  },
  {
    slotId: "slot_ginza_done",
    datetime: "2026-05-22T18:00:00+09:00",
    area: "ginza",
    members: FB_MEMBERS.slice(0, 4),
  },
];

function fallbackPending(): PendingRatingDTO[] {
  return FB_PENDING.map((p) => ({ ...p, members: [...p.members] }));
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

/** 受領評価サマリ（送信後の反映確認に使用）。 */
export async function fetchReceivedSummary(): Promise<RatingSummary> {
  try {
    return await getJson<RatingSummary>("/api/ratings/received/summary");
  } catch {
    return { avg: 0, count: 0 }; // FALLBACK — まだ受領0でも煽らない素直な初期値。
  }
}

// 1件分の評価結果。canRate をサーバ再判定するため、結果はエラーコードまで返す。
export interface SubmitRatingOutcome {
  ok: boolean;
  rating?: RatingDTO;
  summary?: RatingSummary; // ratee 側の更新後集計（契約 §2 の {summary}）。
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
    const data = (await res.json()) as { rating: RatingDTO; summary: RatingSummary };
    return { ok: true, rating: data.rating, summary: data.summary };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — backend 不通時のみ。送信できたものとして扱い、確認を妨げない。
    return {
      ok: true,
      rating: {
        id: `fb_${Date.now()}`,
        slotId: input.slotId,
        rateeId: input.rateeId,
        score: input.score,
        comment: input.comment?.trim() ? input.comment.trim() : null,
        createdAt: new Date().toISOString(),
      },
      summary: { avg: 0, count: 0 },
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
