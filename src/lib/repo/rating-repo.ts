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
import { aggregateRatings, type RatingAggregate } from "@/lib/domain/rating";
import type { Gender } from "@/lib/types";
import type {
  SlotEntity,
  ApplicationEntity,
  ProfileEntity,
  UserEntity,
} from "@/lib/repo/types";

// -----------------------------------------------------------------------------
// Rating entity（schema.prisma の Rating に対応する S5 サブセット）
// -----------------------------------------------------------------------------
export interface RatingEntity {
  id: string;
  slotId: string;
  raterId: string;
  rateeId: string;
  score: number;
  comment: string | null;
  createdAt: Date;
}

/** 評価作成の入力（score の範囲・サニタイズは呼び出し側で担保済みの前提）。 */
export interface CreateRatingInput {
  slotId: string;
  raterId: string;
  rateeId: string;
  score: number;
  comment?: string | null;
}

/** 評価保存の結果。集計値を同時に返す（Profile 書き込みは統合時に結線）。 */
export interface RecordRatingResult {
  rating: RatingEntity;
  /** 保存後の被評価者(ratee)の最新集計（Profile に反映すべき値）。 */
  rateeAggregate: RatingAggregate;
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
      comment: input.comment ?? null,
      createdAt: new Date(),
    };
    s.ratings.set(rating.id, rating);

    // 被評価者の最新集計を算出して返す。
    const rateeAggregate = await this.getRatingSummary(input.rateeId);

    // ★PROFILE-WRITE-HOOK（統合時に開発将軍が結線する点）★ -------------------
    //   ここで ratee の Profile.ratingAvg / ratingCount を rateeAggregate で更新し、
    //   さらに badge.md §3 の qualifiesForPremium(...) を評価して premium 付与を行う。
    //   現状は **集計値を返すのみ**（Profile への副作用なし）。理由: 並行実装の鉄則で
    //   repo/memory.ts（Profile の正本ストア）を S5 では触らないため。結線方法は
    //   このファイル末尾の applyRateeAggregateToProfile() のコメントに記載。
    // -------------------------------------------------------------------------

    return { rating, rateeAggregate };
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
          comment: input.comment ?? null,
        },
      });
      rating = {
        id: row.id,
        slotId: row.slotId,
        raterId: row.raterId,
        rateeId: row.rateeId,
        score: row.score,
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

    // ★PROFILE-WRITE-HOOK（統合時に開発将軍が結線する点）★ -------------------
    //   実DB版では prisma.$transaction で Rating 挿入と Profile 集計更新 +
    //   バッジ判定を1トランザクションにまとめるのが正しい（badge.md §1 ⑤-⑦）。
    //   現状は集計値を返すのみ。Profile 更新は applyRateeAggregateToProfile() 参照。
    // -------------------------------------------------------------------------

    return { rating, rateeAggregate };
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
          ratingAvg: 0,
          ratingCount: 0,
          attendedCount: 1, // done を1回参加済み（バッジ判定の入力）。
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
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
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
