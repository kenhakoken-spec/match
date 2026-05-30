// =============================================================================
// matching-app — S8 ドタキャン(no-show)サービス。spec 要望5。
// 正典: docs/01_s8_spec.md 要望5 / docs/backend/api-contract-s8-foundation.md。
//
// 役割（route/評価サービスと domain/repo の橋渡し）:
//   - 評価で同席者が対象(ratee)を「来なかった(noShowReport)」と報告できる。
//   - **同一 slot の accepted 参加者** からの報告を ratee 別に集計し、
//     domain/noshow.isNoShowConfirmed（2人以上=確定）で確定判定する。
//   - 確定したら Profile.incrementNoShow（noShowCount++）+ ¥5,000 を自動課金
//     （payment-service.chargeNoShowPenalty・type=no_show_penalty）。
//   - **冪等**: 二重に noShowCount を増やさない / 二重課金しない。
//
// 認可/IDOR の前提:
//   - 報告(noShowReport)は評価(POST /api/ratings)の一部で、評価可否は canRate で
//     サーバ再判定済み（rater は accepted 参加者 & ratee は同席者）。本サービスは
//     「保存済み Rating の集計」と「確定後の副作用」に徹し、自前で再認可はしない。
//   - 自己申告（rater===ratee）は rating-repo 側で集計から除外済み。さらに本サービスで
//     「現在の accepted 参加者からの報告のみ」に絞る（spec: participant のみ集計）。
//
// 設計:
//   - 確定の数値判定は domain/noshow（純関数・テスト済）に委譲。
//   - 罰金額・課金は payment-service（type=no_show_penalty）に委譲。
//   - 本サービスは「参加者で絞った報告数 → 確定 → 副作用」の結線のみ。
// =============================================================================

import "server-only";
import { getRepo } from "@/lib/repo";
import { getRatingRepo } from "@/lib/repo/rating-repo";
import { isNoShowConfirmed } from "@/lib/domain/noshow";
import { chargeNoShowPenalty } from "@/lib/payment-service";

/** no-show 評価1件分の結果（評価送信のレスポンス補助 / バッチ結果に使う）。 */
export interface NoShowEvaluationResult {
  /** 対象ユーザー（来なかったと報告された人）。 */
  rateeUserId: string;
  /** 参加者から ratee への「来なかった」報告数（自己申告除外）。 */
  reportCount: number;
  /** isNoShowConfirmed の結果（2人以上で true）。 */
  confirmed: boolean;
  /** 今回 noShowCount を +1 したか（冪等: 既に罰金記録があれば false）。 */
  incremented: boolean;
  /** 今回新たに ¥5,000 を課金したか（冪等: 既存罰金があれば false）。 */
  charged: boolean;
}

/**
 * 同一 slot の **現在の accepted 参加者** から rateeId への no-show 報告数を数える。
 * rating-repo の生集計（自己申告除外済み）を、さらに「accepted 参加者の報告のみ」に絞る。
 *
 * 通常は評価できるのが参加者だけなので両者は一致するが、参加者集合が後から変わる
 * 可能性に備え、確定（=課金）の入力は常に「現参加者の報告」に正規化する（誤課金防止）。
 */
async function countParticipantNoShowReports(
  slotId: string,
  rateeId: string
): Promise<number> {
  const repo = getRepo();
  const ratingRepo = getRatingRepo();

  // accepted 参加者の userId 集合（report の出所を限定するため）。
  const apps = await repo.applications.listActiveBySlot(slotId);
  const acceptedUserIds = new Set<string>();
  for (const a of apps) {
    if (a.status === "accepted") acceptedUserIds.add(a.userId);
  }

  // rating-repo は rater 別の生報告を持たないため、ここでは「対象への報告総数
  // （自己申告除外済み）」を取り、参加者集合との整合は下の rater 走査で担保する。
  // → rater 単位で参加者かを判定するため、専用の rater 列挙を使う。
  const raterIds = await ratingRepo.noShowReporterIds(slotId, rateeId);
  let count = 0;
  for (const raterId of raterIds) {
    if (raterId === rateeId) continue; // 自己申告除外（二重防御）。
    if (!acceptedUserIds.has(raterId)) continue; // 参加者のみ集計。
    count += 1;
  }
  return count;
}

/**
 * ある (slot, ratee) について no-show を評価し、確定なら副作用（noShowCount++ / 課金）を行う。
 * 評価送信（submitRating）から、noShowReport を含む評価が保存された直後に呼ぶ。
 *
 * 冪等の要:
 *   - **既に罰金(no_show_penalty)が存在するか** を唯一の冪等キーにする。
 *     罰金が既にあれば incremented=false / charged=false（noShowCount も増やさない）。
 *   - これにより、確定後に同席者がさらに報告を足しても二重課金/二重カウントしない。
 *
 * @returns 評価結果（confirmed / incremented / charged / reportCount）。
 */
export async function evaluateNoShowForRatee(
  slotId: string,
  rateeUserId: string
): Promise<NoShowEvaluationResult> {
  const reportCount = await countParticipantNoShowReports(slotId, rateeUserId);
  const confirmed = isNoShowConfirmed(reportCount);

  if (!confirmed) {
    return {
      rateeUserId,
      reportCount,
      confirmed: false,
      incremented: false,
      charged: false,
    };
  }

  // 確定 → 課金（冪等）。罰金記録の有無を冪等キーにして noShowCount も同期する。
  // 先に課金（冪等判定込み）を行い、その「今回新規か」を noShowCount++ の可否に使う。
  const penalty = await chargeNoShowPenalty(rateeUserId, slotId);

  let incremented = false;
  if (penalty.charged) {
    // 罰金を新規作成したときだけ noShowCount を +1（=確定の確定打刻）。
    await getRepo().profiles.incrementNoShow(rateeUserId);
    incremented = true;
  }

  return {
    rateeUserId,
    reportCount,
    confirmed: true,
    incremented,
    charged: penalty.charged,
  };
}
