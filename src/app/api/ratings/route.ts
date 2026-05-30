// =============================================================================
// matching-app — POST /api/ratings（評価送信・S8 3軸 + ドタキャン報告）
// 契約: api-contract-s5.md §2 / §0 / docs/01_s8_spec.md 要望4-5。
//   canRate をサーバ側で再判定してから保存。
// IDOR防止: rater は常にセッションの sub。body の rater は受け取らない。
//   rateeId が「自分が参加した done Slot の同席者」かをサーバで再判定する。
//
// body（S8）: { slotId, rateeId, scoreAgain, scoreTalk, scoreManner, comment?, noShowReport? }
//   各軸 1..5 整数。総合(overall)はサーバが算出し後方互換の score にも保存。
//
// status マッピング（契約§5）:
//   self評価          → 400 self_rate
//   非参加者/非同席者 → 403 forbidden
//   二重評価          → 409 already_rated
//   スコア範囲外      → 400（zod validation_error / domain invalid_score）
//   成功              → 200 { rating, summary, multiAxis, noShow }
// =============================================================================

import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { submitRatingSchema } from "@/lib/rating-validation";
import { submitRating } from "@/lib/rating-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    // 既存ルート踏襲: JSON を安全に読み（不正JSONは {} に倒す）、zod で検証＋サニタイズ。
    const raw = await req.json().catch(() => ({}));
    const body = submitRatingSchema.parse(raw);

    const result = await submitRating({
      raterUserId: user.id, // ★ rater は常にセッション sub（body から取らない）。
      slotId: body.slotId,
      rateeId: body.rateeId,
      scoreAgain: body.scoreAgain,
      scoreTalk: body.scoreTalk,
      scoreManner: body.scoreManner,
      comment: body.comment ?? null,
      noShowReport: body.noShowReport,
    });

    if (result.ok) {
      return jsonOk({
        rating: result.rating,
        summary: result.summary,
        multiAxis: result.multiAxis,
        noShow: result.noShow,
      });
    }

    switch (result.reason) {
      case "self_rate":
        return jsonError(400, "self_rate", "cannot rate yourself");
      case "invalid_score":
        return jsonError(400, "invalid_score", "score must be an integer 1..5");
      case "not_participant":
      case "not_co_member":
        // 非参加者/非同席者は同じ 403（存在や同席関係を過剰に漏らさない）。
        return jsonError(403, "forbidden", "you cannot rate this user for this event");
      case "already_rated":
        return jsonError(409, "already_rated", "you have already rated this user for this event");
      default:
        return jsonError(400, "cannot_rate", "rating not allowed");
    }
  });
}
