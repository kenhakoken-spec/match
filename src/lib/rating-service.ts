// =============================================================================
// matching-app — S5 相互評価サービス（route ↔ domain/repo の集約）
// 契約: docs/backend/api-contract-s5.md §0,§2。応募ゲートと同じく、評価可否は
// domain/rating の純関数 canRate に集約し、ここは repo から状態を集めて渡す結線に徹する。
//
// IDOR/認可の要（契約§2 / badge.md §0）:
//   - rater は **常にセッションの sub**（route が requireUser で解決して渡す）。
//   - 評価できるのは「自分が accepted で参加した done Slot」の「同席者(自分以外の accepted)」のみ。
//   - rateeId が同席者か・二重評価でないかをサーバ側で **再判定**（body の値を信用しない）。
// =============================================================================

import { getRepo } from "@/lib/repo";
import { getRatingRepo, DuplicateRatingError } from "@/lib/repo/rating-repo";
import { evaluateAndGrantOnRating } from "@/lib/badge-service";
import { evaluateNoShowForRatee } from "@/lib/noshow-service";
import {
  canRate,
  isRatingScoreValid,
  aggregateMultiAxis,
  type CanRateReason,
} from "@/lib/domain/rating";
import type { ApplicationEntity } from "@/lib/repo/types";
import type {
  PendingRatingDTO,
  PendingMemberDTO,
  RatingDTO,
  RatingSummary,
  MultiAxisRatingSummary,
} from "@/lib/rating-types";

/** その Slot で自分以外の accepted 同席者を返す（read-only / IDOR の同席判定の基礎）。 */
async function coMembersOfSlot(
  slotId: string,
  selfUserId: string
): Promise<ApplicationEntity[]> {
  const repo = getRepo();
  const apps = await repo.applications.listActiveBySlot(slotId);
  return apps.filter((a) => a.status === "accepted" && a.userId !== selfUserId);
}

/** 自分がその Slot に accepted で参加していたか（done 参加者判定）。 */
async function isAcceptedParticipant(
  slotId: string,
  userId: string
): Promise<boolean> {
  const repo = getRepo();
  const apps = await repo.applications.listActiveBySlot(slotId);
  return apps.some((a) => a.status === "accepted" && a.userId === userId);
}

/**
 * 評価可能なイベント + 未評価の同席者一覧（GET /api/ratings/pending）。
 * 「自分が accepted で参加した done Slot」のうち、まだ評価していない同席者が残るものだけ返す。
 */
export async function listPendingRatings(
  userId: string
): Promise<PendingRatingDTO[]> {
  const repo = getRepo();
  const ratingRepo = getRatingRepo();

  // 自分の応募から accepted の Slot を集める。
  const myApps = await repo.applications.listByUser(userId);
  const acceptedSlotIds = new Set<string>();
  for (const a of myApps) {
    if (a.status === "accepted") acceptedSlotIds.add(a.slotId);
  }

  const out: PendingRatingDTO[] = [];
  for (const slotId of acceptedSlotIds) {
    const slot = await repo.slots.findById(slotId);
    if (!slot) continue;
    // 評価対象は **done** のイベントのみ（契約§0）。
    if (slot.status !== "done") continue;

    const coMembers = await coMembersOfSlot(slotId, userId);
    if (coMembers.length === 0) continue;

    // 既に評価した相手を除外（未評価の同席者だけ pending に出す）。
    const rated = await ratingRepo.ratedRateeIds(slotId, userId);
    const pendingMembers: PendingMemberDTO[] = [];
    for (const m of coMembers) {
      if (rated.has(m.userId)) continue;
      const u = await repo.users.findById(m.userId);
      pendingMembers.push({
        userId: m.userId,
        // PII最小: displayName のみ（lineUserId は出さない）。
        displayName: u?.displayName ?? "(不明)",
      });
    }
    if (pendingMembers.length === 0) continue;

    out.push({
      slotId,
      datetime: slot.datetimeStart.toISOString(),
      area: slot.area,
      members: pendingMembers,
    });
  }

  // 開催が新しい順（datetime 降順）に。
  out.sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
  return out;
}

/** no-show 確定の結果サマリ（評価レスポンス補助）。確定しなければ confirmed=false。 */
export interface NoShowOutcome {
  /** この評価が「来なかった」報告を含んでいたか。 */
  reported: boolean;
  /** 参加者からの報告が2人以上に達して確定したか。 */
  confirmed: boolean;
  /** 今回新たに ¥5,000 を課金したか（冪等: 既存罰金があれば false）。 */
  charged: boolean;
}

/** 評価送信の結果（route が status に変換）。 */
export interface SubmitRatingResult {
  ok: boolean;
  /** 失敗理由（canRate の reason または "invalid_score"）。成功時 null。 */
  reason: CanRateReason | "invalid_score" | null;
  rating: RatingDTO | null;
  /** 保存後の被評価者の集計（後方互換の単一スコア集計）。 */
  summary: RatingSummary | null;
  /** S8: 保存後の被評価者の多軸集計（again/talk/manner/overall/count）。 */
  multiAxis: MultiAxisRatingSummary | null;
  /** S8: no-show 報告の処理結果（確定/課金）。 */
  noShow: NoShowOutcome | null;
}

/**
 * 評価を送信する（POST /api/ratings）。canRate をサーバ側で **再判定** してから保存。
 * - raterUserId は **セッションの sub**（route で解決）。body の rater は受け取らない。
 * - S8: 3軸（scoreAgain/scoreTalk/scoreManner 各1..5）。総合(overall)は domain で算出し、
 *   後方互換の score にも overall の四捨五入を保存する。
 * - 各軸 1..5 整数を再検証（zod でも弾くが二重防御）。
 * - 同席者でない / 非参加者 / 二重評価 / self はすべて canRate で拒否。
 * - noShowReport=true は「来なかった」報告。保存後に no-show 確定判定（2人以上）→
 *   確定なら noShowCount++ + ¥5,000 自動課金（冪等）。
 */
export async function submitRating(input: {
  raterUserId: string;
  slotId: string;
  rateeId: string;
  scoreAgain: number;
  scoreTalk: number;
  scoreManner: number;
  comment?: string | null;
  noShowReport?: boolean;
}): Promise<SubmitRatingResult> {
  const {
    raterUserId,
    slotId,
    rateeId,
    scoreAgain,
    scoreTalk,
    scoreManner,
    comment,
    noShowReport,
  } = input;
  const repo = getRepo();
  const ratingRepo = getRatingRepo();

  const fail = (
    reason: CanRateReason | "invalid_score"
  ): SubmitRatingResult => ({
    ok: false,
    reason,
    rating: null,
    summary: null,
    multiAxis: null,
    noShow: null,
  });

  // 0. 3軸スコア妥当性（範囲外/非整数を各軸で拒否）。
  if (
    !isRatingScoreValid(scoreAgain) ||
    !isRatingScoreValid(scoreTalk) ||
    !isRatingScoreValid(scoreManner)
  ) {
    return fail("invalid_score");
  }

  // 総合(overall)を 3軸から算出（1件ぶん）。後方互換の score は overall の四捨五入。
  const single = aggregateMultiAxis([{ scoreAgain, scoreTalk, scoreManner }]);
  const overallScore = Math.round(single.overall);

  // 1. サーバ状態を収集して canRate の入力を組み立てる。
  const slot = await repo.slots.findById(slotId);
  const isDone = slot?.status === "done";
  // done でない/存在しない Slot は「参加者でない」と同義に倒す（存在を過剰に漏らさない）。
  const isParticipantOfDoneSlot = isDone
    ? await isAcceptedParticipant(slotId, raterUserId)
    : false;

  const coMembers = await coMembersOfSlot(slotId, raterUserId);
  const rateeIsCoMember = coMembers.some((m) => m.userId === rateeId);

  const selfRate = raterUserId === rateeId;
  const alreadyRated = await ratingRepo.exists(slotId, raterUserId, rateeId);

  // 2. 純関数で可否判定（判定順: self→participant→coMember→duplicate）。
  const verdict = canRate({
    isParticipantOfDoneSlot,
    rateeIsCoMember,
    alreadyRated,
    selfRate,
  });
  if (!verdict.ok) {
    return fail(verdict.reason!);
  }

  // 3. 保存（同期区間で二重挿入を弾く。競合は 409）。
  try {
    const { rating, rateeAggregate, rateeMultiAxis } =
      await ratingRepo.recordRating({
        slotId,
        raterId: raterUserId,
        rateeId,
        score: overallScore,
        scoreAgain,
        scoreTalk,
        scoreManner,
        noShowReport: noShowReport ?? false,
        comment: comment ?? null,
      });

    // 評価確定 → 被評価者の Profile 多軸集計を更新 → 優良バッジ自動付与判定。
    // 順序重要: 集計更新が先（badge-service は Profile.ratingAvg(=overall)/ratingCount/
    // attendedCount を読んで qualifiesForPremium を判定するため）。バッジ付与は冪等。
    // setMultiAxisSummary は overall→ratingAvg・軸別→scoreXxxAvg・count→ratingCount を書く。
    await repo.profiles.setMultiAxisSummary(rateeId, {
      again: rateeMultiAxis.again,
      talk: rateeMultiAxis.talk,
      manner: rateeMultiAxis.manner,
      overall: rateeMultiAxis.overall,
      count: rateeMultiAxis.count,
    });
    await evaluateAndGrantOnRating(rateeId);

    // S8: no-show 報告があれば、保存後に確定判定（2人以上）→ 罰金課金（冪等）。
    // 報告が無い評価では集計しても確定しないが、報告込み評価のときだけ評価する
    // （無駄な集計を避ける。確定の冪等は noshow-service が担保）。
    let noShow: NoShowOutcome | null = null;
    if (noShowReport) {
      const r = await evaluateNoShowForRatee(slotId, rateeId);
      noShow = {
        reported: true,
        confirmed: r.confirmed,
        charged: r.charged,
      };
    }

    return {
      ok: true,
      reason: null,
      rating: {
        id: rating.id,
        slotId: rating.slotId,
        rateeId: rating.rateeId,
        score: rating.score,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
      },
      summary: { avg: rateeAggregate.avg, count: rateeAggregate.count },
      multiAxis: {
        again: rateeMultiAxis.again,
        talk: rateeMultiAxis.talk,
        manner: rateeMultiAxis.manner,
        overall: rateeMultiAxis.overall,
        count: rateeMultiAxis.count,
      },
      noShow,
    };
  } catch (err) {
    if (err instanceof DuplicateRatingError) {
      return fail("already_rated");
    }
    throw err;
  }
}

/**
 * 自分の受領評価サマリ（GET /api/ratings/received/summary）。IDOR: 自分の集計のみ。
 * S8: 3軸（again/talk/manner）+ 総合(overall) + 件数。後方互換のため avg(=overall) も返す。
 */
export async function getReceivedSummary(
  userId: string
): Promise<MultiAxisRatingSummary & { avg: number }> {
  const ratingRepo = getRatingRepo();
  const agg = await ratingRepo.getMultiAxisSummary(userId);
  return {
    again: agg.again,
    talk: agg.talk,
    manner: agg.manner,
    overall: agg.overall,
    count: agg.count,
    // 後方互換: 旧クライアントが参照する avg は総合(overall)と同値。
    avg: agg.overall,
  };
}
