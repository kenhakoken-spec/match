// =============================================================================
// matching-app — S5 Rating repository（相互評価の永続化）
// 契約: docs/backend/api-contract-s5.md §0,§2,§4 / docs/backend/badge.md §1-2。
//
// 所有範囲（契約§4）:
//   - Rating の in-memory Map は **このファイル内に** 持つ（既定 / MOCK_DB!=0）。
//   - Prisma 実装も併記（実DB未検証。MOCK_DB=0 のとき使う）。
//   - 既存 Slot/Application/Profile/User は getRepo() 経由で **読み取りのみ**。
//   - 共有 repo/types.ts / repo/memory.ts / repo/index.ts は **触らない**。
//
// 集計反映（契約§2）:
//   評価保存時に被評価者(ratee)の集計を再計算して **保持/返却** する。
//   Profile への実書き込み（Profile.ratingAvg/ratingCount/attendedCount, バッジ判定）は
//   統合時に開発将軍が結線するため、ここでは getRatingSummary() で集計値を返すに留め、
//   書き込みフック点を ★PROFILE-WRITE-HOOK として明示する（下記 recordRating 参照）。
//
// PII方針: Rating には userId（アプリ内ID）のみ。lineUserId は保持しない。
//   コメントは route 側でサニタイズ済みの値だけを渡す前提。
// =============================================================================

import crypto from "node:crypto";
import { getRepo } from "@/lib/repo";
import { isMockDbEnabled } from "@/lib/env";
import {
  aggregateRatings,
  aggregateMultiAxis,
  type RatingAggregate,
  type MultiAxisAggregate,
  type MultiAxisScore,
} from "@/lib/domain/rating";
import type { Gender } from "@/lib/types";
import type {
  SlotEntity,
  ApplicationEntity,
  ProfileEntity,
  UserEntity,
} from "@/lib/repo/types";

// -----------------------------------------------------------------------------
// Rating entity（schema.prisma の Rating に対応する S5/S8 サブセット）
// S8: 単一 score → 3軸（scoreAgain/scoreTalk/scoreManner 各1-5）+ noShowReport。
//   既存 score は **後方互換** で温存し、3軸の総合(overall)の丸めを保持する
//   （旧 aggregateRatings 経路・既存テストが score を参照しても壊れないため）。
// -----------------------------------------------------------------------------
export interface RatingEntity {
  id: string;
  slotId: string;
  raterId: string;
  rateeId: string;
  /** 後方互換の総合スコア（= 3軸 overall の四捨五入。1..5）。 */
  score: number;
  /** S8: また会いたい（1..5）。 */
  scoreAgain: number;
  /** S8: 会話の盛り上がり（1..5）。 */
  scoreTalk: number;
  /** S8: マナー・誠実さ（1..5）。 */
  scoreManner: number;
  /** S8: この rater が ratee を「来なかった（no-show）」と報告したか。 */
  noShowReport: boolean;
  comment: string | null;
  createdAt: Date;
}

/** 評価作成の入力（スコア範囲・サニタイズは呼び出し側で担保済みの前提）。 */
export interface CreateRatingInput {
  slotId: string;
  raterId: string;
  rateeId: string;
  /** 後方互換の総合（= overall 丸め）。呼び出し側が 3軸から算出して渡す。 */
  score: number;
  scoreAgain: number;
  scoreTalk: number;
  scoreManner: number;
  /** S8: 「来なかった」報告（既定 false）。 */
  noShowReport?: boolean;
  comment?: string | null;
}

/** 評価保存の結果。集計値を同時に返す（Profile 書き込みは service が結線）。 */
export interface RecordRatingResult {
  rating: RatingEntity;
  /** 保存後の被評価者(ratee)の最新集計（後方互換の単一スコア集計）。 */
  rateeAggregate: RatingAggregate;
  /** S8: 保存後の被評価者(ratee)の多軸集計（Profile.setMultiAxisSummary に反映）。 */
  rateeMultiAxis: MultiAxisAggregate;
}

function cuid(): string {
  // 連番ID不使用（列挙攻撃難化）。dev/test 用に十分なランダム性。
  return "r" + crypto.randomBytes(12).toString("hex");
}

// -----------------------------------------------------------------------------
// Rating repository interface（このファイル専用。共有 Repo には足さない）
// -----------------------------------------------------------------------------
export interface RatingRepo {
  /** (slotId, raterId, rateeId) の評価が存在するか（二重評価判定 / UNIQUE 相当）。 */
  exists(slotId: string, raterId: string, rateeId: string): Promise<boolean>;
  /**
   * 評価を1件作成する。**冪等性は呼び出し側の canRate 再判定で担保**し、
   * ここでは存在時に競合エラーを返す（in-memory の同期区間で二重挿入を防ぐ）。
   * 戻り値に被評価者の最新集計を含める（Profile 反映用）。
   */
  recordRating(input: CreateRatingInput): Promise<RecordRatingResult>;
  /** rater がその slot で既に評価した相手(ratee)の userId 集合。pending 算出に使う。 */
  ratedRateeIds(slotId: string, raterId: string): Promise<Set<string>>;
  /** 被評価者(ratee)が受けた全評価のスコア配列。集計に使う。 */
  receivedScores(rateeId: string): Promise<number[]>;
  /** 被評価者(ratee)の現在の集計（avg/count）。Profile に書き込むべき値。 */
  getRatingSummary(rateeId: string): Promise<RatingAggregate>;
  /**
   * S8: 被評価者(ratee)が受けた全評価の3軸スコア配列。多軸集計に使う。
   * 各要素は {scoreAgain, scoreTalk, scoreManner}。
   */
  receivedMultiAxis(rateeId: string): Promise<MultiAxisScore[]>;
  /** S8: 被評価者(ratee)の多軸集計（again/talk/manner/overall/count）。 */
  getMultiAxisSummary(rateeId: string): Promise<MultiAxisAggregate>;
  /**
   * S8: ある枠で、対象(rateeId)に「来なかった」と報告した **別人(rater≠ratee)** の
   * raterId 集合。自己申告（rater===ratee）は除外する。
   * 参加者限定の集計は呼び出し側(noshow-service)が この集合を参加者で絞って行う。
   */
  noShowReporterIds(slotId: string, rateeId: string): Promise<Set<string>>;
  /**
   * S8: ある枠で、対象(rateeId)への「来なかった」報告数（自己申告除外）。
   * = noShowReporterIds(...).size。確定判定(isNoShowConfirmed)の素の入力。
   */
  countNoShowReports(slotId: string, rateeId: string): Promise<number>;
  /** S8: ある枠で no-show 報告が1件以上ある対象(ratee)の userId 集合。バッチ判定用。 */
  rateesWithNoShowReports(slotId: string): Promise<Set<string>>;
}

/** recordRating が二重挿入を検知したときに投げる（route で 409 に変換）。 */
export class DuplicateRatingError extends Error {
  constructor() {
    super("rating already exists for (slot, rater, ratee)");
    this.name = "DuplicateRatingError";
  }
}

// =============================================================================
// In-memory 実装（既定 / MOCK_DB!=0）— Rating ストアは **このファイル内** に保持。
// HMR/テスト間で状態を保つため globalThis に置く（既存 memory.ts とは別ストア）。
// =============================================================================
interface RatingStore {
  // key: rating id → RatingEntity
  ratings: Map<string, RatingEntity>;
}

const g = globalThis as unknown as { __mappRatingStore?: RatingStore };

function ratingStore(): RatingStore {
  if (!g.__mappRatingStore) {
    g.__mappRatingStore = { ratings: new Map() };
  }
  return g.__mappRatingStore;
}

/** (slot,rater,ratee) の合成キー（UNIQUE 相当の重複検知に使う）。 */
function uniqKey(slotId: string, raterId: string, rateeId: string): string {
  return `${slotId}::${raterId}::${rateeId}`;
}

class MemoryRatingRepo implements RatingRepo {
  async exists(slotId: string, raterId: string, rateeId: string): Promise<boolean> {
    const key = uniqKey(slotId, raterId, rateeId);
    for (const r of ratingStore().ratings.values()) {
      if (uniqKey(r.slotId, r.raterId, r.rateeId) === key) return true;
    }
    return false;
  }

  async recordRating(input: CreateRatingInput): Promise<RecordRatingResult> {
    const s = ratingStore();
    // read→check→write を await なしの同期区間で行い、二重挿入を不可分に弾く
    // （in-memory は単スレッド。Prisma 実装は UNIQUE 制約で同等を担保）。
    if (await this.exists(input.slotId, input.raterId, input.rateeId)) {
      throw new DuplicateRatingError();
    }
    const rating: RatingEntity = {
      id: cuid(),
      slotId: input.slotId,
      raterId: input.raterId,
      rateeId: input.rateeId,
      score: input.score,
      scoreAgain: input.scoreAgain,
      scoreTalk: input.scoreTalk,
      scoreManner: input.scoreManner,
      noShowReport: input.noShowReport ?? false,
      comment: input.comment ?? null,
      createdAt: new Date(),
    };
    s.ratings.set(rating.id, rating);

    // 被評価者の最新集計を算出して返す（後方互換の単一スコア + S8 多軸）。
    const rateeAggregate = await this.getRatingSummary(input.rateeId);
    const rateeMultiAxis = await this.getMultiAxisSummary(input.rateeId);

    // Profile への反映（ratingAvg/scoreAgainAvg.. の更新）とバッジ判定は service 側で
    // setMultiAxisSummary + evaluateAndGrantOnRating を呼んで結線する（S8 統合済）。
    return { rating, rateeAggregate, rateeMultiAxis };
  }

  async ratedRateeIds(slotId: string, raterId: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const r of ratingStore().ratings.values()) {
      if (r.slotId === slotId && r.raterId === raterId) out.add(r.rateeId);
    }
    return out;
  }

  async receivedScores(rateeId: string): Promise<number[]> {
    const out: number[] = [];
    for (const r of ratingStore().ratings.values()) {
      if (r.rateeId === rateeId) out.push(r.score);
    }
    return out;
  }

  async getRatingSummary(rateeId: string): Promise<RatingAggregate> {
    const scores = await this.receivedScores(rateeId);
    return aggregateRatings(scores);
  }

  async receivedMultiAxis(rateeId: string): Promise<MultiAxisScore[]> {
    const out: MultiAxisScore[] = [];
    for (const r of ratingStore().ratings.values()) {
      if (r.rateeId === rateeId) {
        out.push({
          scoreAgain: r.scoreAgain,
          scoreTalk: r.scoreTalk,
          scoreManner: r.scoreManner,
        });
      }
    }
    return out;
  }

  async getMultiAxisSummary(rateeId: string): Promise<MultiAxisAggregate> {
    const ratings = await this.receivedMultiAxis(rateeId);
    return aggregateMultiAxis(ratings);
  }

  async noShowReporterIds(slotId: string, rateeId: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const r of ratingStore().ratings.values()) {
      if (r.slotId !== slotId) continue;
      if (r.rateeId !== rateeId) continue;
      if (!r.noShowReport) continue;
      // 自己申告は除外（来なかったと自分で報告しても罰金確定に数えない）。
      if (r.raterId === rateeId) continue;
      out.add(r.raterId);
    }
    return out;
  }

  async countNoShowReports(slotId: string, rateeId: string): Promise<number> {
    return (await this.noShowReporterIds(slotId, rateeId)).size;
  }

  async rateesWithNoShowReports(slotId: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (const r of ratingStore().ratings.values()) {
      if (r.slotId !== slotId) continue;
      if (!r.noShowReport) continue;
      if (r.raterId === r.rateeId) continue; // 自己申告除外
      out.add(r.rateeId);
    }
    return out;
  }
}

// =============================================================================
// Prisma 実装（MOCK_DB=0 のとき）。**実DB未検証**（ローカルに Postgres が無いため）。
// in-memory と同じ契約を満たす。UNIQUE([slotId,raterId,rateeId]) で二重評価を防ぐ。
// =============================================================================
class PrismaRatingRepo implements RatingRepo {
  // NOTE(実DB未検証): 実装は prisma.ts の PrismaClient を使う想定。
  //   実 DB 接続環境での結合テストは統合フェーズで行う（S5 単体は in-memory で検証）。

  async exists(slotId: string, raterId: string, rateeId: string): Promise<boolean> {
    const { prisma } = await import("@/lib/prisma");
    // 実DB未検証: findUnique は @@unique([slotId,raterId,rateeId]) を使う。
    const row = await prisma.rating.findUnique({
      where: { slotId_raterId_rateeId: { slotId, raterId, rateeId } },
      select: { id: true },
    });
    return row != null;
  }

  async recordRating(input: CreateRatingInput): Promise<RecordRatingResult> {
    const { prisma } = await import("@/lib/prisma");
    // 実DB未検証: UNIQUE 違反は P2002 を DuplicateRatingError に変換する。
    let rating: RatingEntity;
    try {
      const row = await prisma.rating.create({
        data: {
          slotId: input.slotId,
          raterId: input.raterId,
          rateeId: input.rateeId,
          score: input.score,
          scoreAgain: input.scoreAgain,
          scoreTalk: input.scoreTalk,
          scoreManner: input.scoreManner,
          noShowReport: input.noShowReport ?? false,
          comment: input.comment ?? null,
        },
      });
      rating = {
        id: row.id,
        slotId: row.slotId,
        raterId: row.raterId,
        rateeId: row.rateeId,
        score: row.score,
        scoreAgain: row.scoreAgain,
        scoreTalk: row.scoreTalk,
        scoreManner: row.scoreManner,
        noShowReport: row.noShowReport,
        comment: row.comment,
        createdAt: row.createdAt,
      };
    } catch (err) {
      // Prisma の一意制約違反コードは P2002。
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        throw new DuplicateRatingError();
      }
      throw err;
    }

    const rateeAggregate = await this.getRatingSummary(input.rateeId);
    const rateeMultiAxis = await this.getMultiAxisSummary(input.rateeId);

    // 実DB版では prisma.$transaction で Rating 挿入と Profile 集計更新 +
    // バッジ判定/no-show 罰金を1トランザクションにまとめるのが正しい（統合時に検証）。
    return { rating, rateeAggregate, rateeMultiAxis };
  }

  async ratedRateeIds(slotId: string, raterId: string): Promise<Set<string>> {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.rating.findMany({
      where: { slotId, raterId },
      select: { rateeId: true },
    });
    return new Set(rows.map((r: { rateeId: string }) => r.rateeId));
  }

  async receivedScores(rateeId: string): Promise<number[]> {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.rating.findMany({
      where: { rateeId },
      select: { score: true },
    });
    return rows.map((r: { score: number }) => r.score);
  }

  async getRatingSummary(rateeId: string): Promise<RatingAggregate> {
    const scores = await this.receivedScores(rateeId);
    return aggregateRatings(scores);
  }

  async receivedMultiAxis(rateeId: string): Promise<MultiAxisScore[]> {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.rating.findMany({
      where: { rateeId },
      select: { scoreAgain: true, scoreTalk: true, scoreManner: true },
    });
    return rows.map(
      (r: { scoreAgain: number; scoreTalk: number; scoreManner: number }) => ({
        scoreAgain: r.scoreAgain,
        scoreTalk: r.scoreTalk,
        scoreManner: r.scoreManner,
      })
    );
  }

  async getMultiAxisSummary(rateeId: string): Promise<MultiAxisAggregate> {
    const ratings = await this.receivedMultiAxis(rateeId);
    return aggregateMultiAxis(ratings);
  }

  async noShowReporterIds(slotId: string, rateeId: string): Promise<Set<string>> {
    const { prisma } = await import("@/lib/prisma");
    // 自己申告除外（raterId !== rateeId）。実DB未検証。
    const rows = await prisma.rating.findMany({
      where: { slotId, rateeId, noShowReport: true, NOT: { raterId: rateeId } },
      select: { raterId: true },
    });
    return new Set(rows.map((r: { raterId: string }) => r.raterId));
  }

  async countNoShowReports(slotId: string, rateeId: string): Promise<number> {
    return (await this.noShowReporterIds(slotId, rateeId)).size;
  }

  async rateesWithNoShowReports(slotId: string): Promise<Set<string>> {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.rating.findMany({
      where: { slotId, noShowReport: true },
      select: { raterId: true, rateeId: true },
    });
    const out = new Set<string>();
    for (const r of rows as Array<{ raterId: string; rateeId: string }>) {
      if (r.raterId === r.rateeId) continue;
      out.add(r.rateeId);
    }
    return out;
  }
}

// -----------------------------------------------------------------------------
// factory（既存 repo/index.ts の getRepo と同じ env 判定を踏襲）
// -----------------------------------------------------------------------------
let _ratingRepo: RatingRepo | null = null;

export function getRatingRepo(): RatingRepo {
  if (_ratingRepo) return _ratingRepo;
  _ratingRepo = isMockDbEnabled() ? new MemoryRatingRepo() : new PrismaRatingRepo();
  return _ratingRepo;
}

// =============================================================================
// Profile 集計の統合配線ポイント（統合時に開発将軍が結線する）
// =============================================================================
/**
 * 被評価者の集計を Profile に反映する **配線テンプレート**（現状は未結線）。
 *
 * S5 単体では repo/memory.ts（Profile の正本ストア）を触らない契約のため、
 * recordRating は Profile を書き換えず集計値を返すだけにしている。統合時には
 * recordRating の ★PROFILE-WRITE-HOOK で本関数相当を呼び、以下を行う:
 *
 *   1. Profile.ratingAvg = agg.avg / Profile.ratingCount = agg.count を更新。
 *      （in-memory なら repo/memory.ts に setRatingSummary を足す、
 *        Prisma なら $transaction 内で profile.update）。
 *   2. attendedCount は「done 参加回数」。done 化処理（別途）で ++ する。
 *   3. badge.md §3 qualifiesForPremium({ratingAvg,ratingCount,attendedCount}) を評価し、
 *      充足かつ未保有なら Badge(premium, grantedBy="system", criteriaSnapshot=…) を付与。
 *
 * 現状は getRepo().profiles が write API（setRatingSummary 等）を S5 範囲で
 * 公開していないため、ここは **意図的に no-op** とし、結線手順のみ記載する。
 */
export async function applyRateeAggregateToProfile(
  rateeId: string,
  agg: RatingAggregate
): Promise<void> {
  // 統合時に上記 1-3 を実装する。S5 範囲では Profile 書き込みを行わない。
  void rateeId;
  void agg;
}

// =============================================================================
// テスト用 seed: done 済イベント + 同席6名（契約§4 / §5 curl 用）
// memory.ts は触らない方針のため、MemoryRepo が読む共有 in-memory ストア
// （globalThis.__mappStore）へ **このファイルから** 最小データを追記する。
// memory.ts のコードは一切変更しない（同じ global ハンドルにデータを足すだけ）。
// MOCK_DB!=0（in-memory）専用。冪等（既に seed 済なら何もしない）。
// =============================================================================

/** memory.ts の Store の S5 で触る部分のみを写した最小 shape（read/write 用）。 */
interface SharedStoreSubset {
  users: Map<string, UserEntity>;
  profiles: Map<string, ProfileEntity>;
  slots: Map<string, SlotEntity>;
  applications: Map<string, ApplicationEntity>;
  seeded?: boolean;
}

const DONE_SLOT_ID = "seed-slot-done";
/** done イベントの同席メンバー6名（S5 評価テスト専用の固定ユーザー）。 */
const DONE_MEMBERS: Array<{ id: string; name: string; gender: Gender }> = [
  { id: "rate-m1", name: "評価太郎", gender: "male" },
  { id: "rate-m2", name: "評価次郎", gender: "male" },
  { id: "rate-m3", name: "評価三郎", gender: "male" },
  { id: "rate-f1", name: "評価花子", gender: "female" },
  { id: "rate-f2", name: "評価桃子", gender: "female" },
  { id: "rate-f3", name: "評価梅子", gender: "female" },
];

/** 評価テスト用の固定ユーザーID（curl/テストで rater/ratee/非参加者に使う）。 */
export const RATING_TEST_IDS = {
  doneSlotId: DONE_SLOT_ID,
  members: DONE_MEMBERS.map((m) => m.id),
  /** done に参加していない外部ユーザー（403 検証用）。 */
  outsider: "rate-outsider",
} as const;

/**
 * done 済イベント + 6名 accepted を共有 in-memory ストアに用意する（冪等・dev/test専用）。
 * 既存 seed（memory.ts の seed-*）は壊さない。MOCK_DB=0 のときは no-op（実DB seed は別運用）。
 * @returns 用意したメンバーのID配列と done slotId。
 */
export function seedDoneEventForTest(): {
  doneSlotId: string;
  memberIds: string[];
  outsiderId: string;
} {
  if (!isMockDbEnabled()) {
    // 実DBモードでは in-memory seed をしない（実DB未検証）。
    return {
      doneSlotId: DONE_SLOT_ID,
      memberIds: DONE_MEMBERS.map((m) => m.id),
      outsiderId: RATING_TEST_IDS.outsider,
    };
  }
  const gg = globalThis as unknown as { __mappStore?: SharedStoreSubset };
  // getRepo() を一度呼んで MemoryRepo 側の seed（__mappStore 初期化）を確実に走らせる。
  getRepo();
  const store = gg.__mappStore;
  if (!store) {
    // 取得できない場合は何もしない（理論上は getRepo 後に必ず存在する）。
    return {
      doneSlotId: DONE_SLOT_ID,
      memberIds: DONE_MEMBERS.map((m) => m.id),
      outsiderId: RATING_TEST_IDS.outsider,
    };
  }

  const now = new Date();
  // 冪等: done slot が既にあれば seed 済とみなす。
  if (!store.slots.has(DONE_SLOT_ID)) {
    const day = 24 * 60 * 60 * 1000;
    const doneSlot: SlotEntity = {
      id: DONE_SLOT_ID,
      // 過去日時（開催完了済みを表現）。
      datetimeStart: new Date(now.getTime() - 3 * day),
      area: "ebisu",
      capacityPerGender: 3,
      status: "done",
      minAge: null,
      maxAge: null,
      requiresBadge: false,
      feeMale: 2000,
      note: "S5評価テスト用 done イベント(男3/女3)",
      createdAt: now,
      updatedAt: now,
    };
    store.slots.set(doneSlot.id, doneSlot);

    for (const m of DONE_MEMBERS) {
      if (!store.users.has(m.id)) {
        store.users.set(m.id, {
          id: m.id,
          lineUserId: `Urate_${m.id}`,
          displayName: m.name,
          role: "user",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
      if (!store.profiles.has(m.id)) {
        store.profiles.set(m.id, {
          id: `rate-profile-${m.id}`,
          userId: m.id,
          gender: m.gender,
          birthdate: new Date(Date.UTC(1995, 0, 1)),
          photoUrl: null,
          bio: null,
          areaPref: ["ebisu"],
          occupation: null,
          ratingAvg: 0,
          ratingCount: 0,
          attendedCount: 1, // done を1回参加済み（バッジ判定の入力）。
          scoreAgainAvg: 0,
          scoreTalkAvg: 0,
          scoreMannerAvg: 0,
          noShowCount: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      const appId = `rate-app-${DONE_SLOT_ID}-${m.id}`;
      if (!store.applications.has(appId)) {
        store.applications.set(appId, {
          id: appId,
          slotId: DONE_SLOT_ID,
          userId: m.id,
          gender: m.gender,
          status: "accepted", // done イベントの確定メンバー。
          paymentId: null,
          appliedAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 非参加者（外部ユーザー）も用意（done に accepted では入れない）。
  if (!store.users.has(RATING_TEST_IDS.outsider)) {
    store.users.set(RATING_TEST_IDS.outsider, {
      id: RATING_TEST_IDS.outsider,
      lineUserId: "Urate_outsider",
      displayName: "部外者",
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    store.profiles.set(RATING_TEST_IDS.outsider, {
      id: "rate-profile-outsider",
      userId: RATING_TEST_IDS.outsider,
      gender: "male",
      birthdate: new Date(Date.UTC(1990, 0, 1)),
      photoUrl: null,
      bio: null,
      areaPref: ["ebisu"],
      occupation: null,
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
      scoreAgainAvg: 0,
      scoreTalkAvg: 0,
      scoreMannerAvg: 0,
      noShowCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  return {
    doneSlotId: DONE_SLOT_ID,
    memberIds: DONE_MEMBERS.map((m) => m.id),
    outsiderId: RATING_TEST_IDS.outsider,
  };
}
