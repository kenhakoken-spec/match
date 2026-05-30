// =============================================================================
// matching-app — S6 Badge repository (専用・自己完結)。契約: api-contract-s6.md §4。
//
// 重要(並行実装の鉄則): 共有 repo/types.ts の Repo / BadgesRepo は **触らない**。
//   既存 BadgesRepo は `hasPremium` のみを宣言しており、付与/取消/一覧は S6 で
//   新規に必要になる。共有インターフェースを変更せずに済むよう、S6 のバッジ永続化は
//   **このファイル内に閉じた専用ストア** で完結させる(getBadgeRepo() で取得)。
//   既存 Profile/User は getRepo() 経由で **読み取りのみ** 参照する。
//
// MOCK_DB の扱い:
//   - 既定(非production / MOCK_DB!=0): in-memory(このファイルの Map)。
//   - MOCK_DB=0 / production: Prisma 実装(PrismaBadgeStore)。
//     **実DB未検証**(ローカルに Postgres 無し / migration 未実行)。型は schema.prisma の
//     Badge に 1:1 対応。DB 接続後に統合テストで検証すること。
// =============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { isMockDbEnabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { badgeCriteriaSnapshot, type BadgeInput } from "@/lib/domain/badge";

/** premium のみ(schema BadgeType と一致)。 */
export type BadgeTypeValue = "premium";

/** バッジ1件の永続化形(schema Badge の S6 サブセット)。 */
export interface BadgeRecord {
  userId: string;
  type: BadgeTypeValue;
  grantedAt: Date;
  /** "system"=自動付与 / admin の userId=手動付与。監査用。 */
  grantedBy: string | null;
  /** 付与根拠スナップショット(badgeCriteriaSnapshot 由来。手動付与は null も可)。 */
  criteriaSnapshot: Record<string, number> | null;
}

/** grant の入力。criteriaSnapshot は自動付与時に渡す(手動付与は省略可)。 */
export interface GrantBadgeInput {
  userId: string;
  grantedBy: string; // "system" | admin userId
  criteria?: BadgeInput;
}

/** S6 バッジストアの抽象(付与/取消/参照)。 */
export interface BadgeStore {
  /** ユーザーが premium を保有しているか(限定枠ゲートに渡す)。 */
  hasPremium(userId: string): Promise<boolean>;
  /** premium バッジ1件を取得(無ければ null)。 */
  findPremium(userId: string): Promise<BadgeRecord | null>;
  /**
   * premium を冪等付与する。既に保有していれば再付与せず既存を返す
   * (created=false)。新規付与時は created=true。
   * 冪等性は schema の @@unique([userId,type]) に対応。
   */
  grantPremium(
    input: GrantBadgeInput
  ): Promise<{ record: BadgeRecord; created: boolean }>;
  /**
   * premium を取消す。元々保有していなければ existed=false(冪等)。
   */
  revokePremium(userId: string): Promise<{ existed: boolean }>;
  /** 付与済み premium の一覧(grantedAt 降順)。admin 一覧用。 */
  listPremium(): Promise<BadgeRecord[]>;
}

// =============================================================================
// in-memory 実装(既定)。HMR / テスト間で状態を保つため globalThis に保持する。
// このファイル内で完結する専用ストア(repo/memory.ts の Store には相乗りしない)。
// =============================================================================

interface BadgeMemStore {
  /** key: userId → premium レコード(1ユーザー1件 = @@unique([userId,type]))。 */
  premium: Map<string, BadgeRecord>;
  seeded: boolean;
}

const g = globalThis as unknown as { __mappBadgeStore?: BadgeMemStore };

function emptyBadgeStore(): BadgeMemStore {
  return { premium: new Map(), seeded: false };
}

/**
 * seed: 既存 in-memory リポジトリ(repo/memory.ts)の seed と整合させ、
 * seed-user-male を premium 保有者として初期化する。これにより
 * 「バッジ限定枠の応募」「mine で premium 表示」を seed 起点で E2E 検証できる。
 * (repo/memory.ts 側の seed.badges は S2 までの遺物。S6 のバッジ正本はこのストア。)
 */
function seedBadges(s: BadgeMemStore): void {
  if (s.seeded) return;
  s.seeded = true;
  s.premium.set("seed-user-male", {
    userId: "seed-user-male",
    type: "premium",
    grantedAt: new Date(),
    grantedBy: "system",
    criteriaSnapshot: badgeCriteriaSnapshot({
      ratingAvg: 4.6,
      ratingCount: 8,
      attendedCount: 3,
    }),
  });
}

function badgeStore(): BadgeMemStore {
  if (!g.__mappBadgeStore) {
    g.__mappBadgeStore = emptyBadgeStore();
    seedBadges(g.__mappBadgeStore);
  }
  return g.__mappBadgeStore;
}

/** テスト用: ストアを初期化して seed し直す(vitest の beforeEach から呼ぶ)。 */
export function __resetBadgeStore(): void {
  g.__mappBadgeStore = emptyBadgeStore();
  seedBadges(g.__mappBadgeStore);
}

class MemoryBadgeStore implements BadgeStore {
  async hasPremium(userId: string): Promise<boolean> {
    return badgeStore().premium.has(userId);
  }
  async findPremium(userId: string): Promise<BadgeRecord | null> {
    return badgeStore().premium.get(userId) ?? null;
  }
  async grantPremium(
    input: GrantBadgeInput
  ): Promise<{ record: BadgeRecord; created: boolean }> {
    const s = badgeStore();
    const existing = s.premium.get(input.userId);
    if (existing) {
      // 冪等: 既保有なら再付与しない(@@unique([userId,type]))。
      return { record: existing, created: false };
    }
    const record: BadgeRecord = {
      userId: input.userId,
      type: "premium",
      grantedAt: new Date(),
      grantedBy: input.grantedBy,
      criteriaSnapshot: input.criteria
        ? badgeCriteriaSnapshot(input.criteria)
        : null,
    };
    s.premium.set(input.userId, record);
    return { record, created: true };
  }
  async revokePremium(userId: string): Promise<{ existed: boolean }> {
    const s = badgeStore();
    const existed = s.premium.delete(userId);
    return { existed };
  }
  async listPremium(): Promise<BadgeRecord[]> {
    const out = [...badgeStore().premium.values()];
    out.sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
    return out;
  }
}

// =============================================================================
// Prisma 実装(production / MOCK_DB=0)。
// !!! 実DB未検証 !!! ローカルに Postgres 無し / migration 未実行のため、既定では
// 呼ばれない(getBadgeRepo() が in-memory を返す)。schema.prisma の Badge に 1:1。
// DB 接続後の検証手順は repo/prisma-repo.ts のヘッダに準ずる。
// =============================================================================

class PrismaBadgeStore implements BadgeStore {
  async hasPremium(userId: string): Promise<boolean> {
    // 実DB未検証。索引 Badge(userId,type) を使う複合一意で存在確認。
    const row = await prisma.badge.findUnique({
      where: { userId_type: { userId, type: "premium" } },
    });
    return row !== null;
  }
  async findPremium(userId: string): Promise<BadgeRecord | null> {
    // 実DB未検証。
    const row = await prisma.badge.findUnique({
      where: { userId_type: { userId, type: "premium" } },
    });
    if (!row) return null;
    return toBadgeRecord(row);
  }
  async grantPremium(
    input: GrantBadgeInput
  ): Promise<{ record: BadgeRecord; created: boolean }> {
    // 実DB未検証。@@unique([userId,type]) により upsert で冪等付与。
    const existing = await prisma.badge.findUnique({
      where: { userId_type: { userId: input.userId, type: "premium" } },
    });
    if (existing) return { record: toBadgeRecord(existing), created: false };
    // criteriaSnapshot は Json 列。Record<string,number> を Prisma の InputJsonValue
    // として渡す。未指定時はキー自体を省く(exactOptional 安全 / Json列は省略可)。
    const data: Prisma.BadgeCreateInput = {
      user: { connect: { id: input.userId } },
      type: "premium",
      grantedBy: input.grantedBy,
      ...(input.criteria
        ? {
            criteriaSnapshot: badgeCriteriaSnapshot(
              input.criteria
            ) as Prisma.InputJsonValue,
          }
        : {}),
    };
    const created = await prisma.badge.create({ data });
    return { record: toBadgeRecord(created), created: true };
  }
  async revokePremium(userId: string): Promise<{ existed: boolean }> {
    // 実DB未検証。deleteMany で存在しなくても例外を出さず count を見る。
    const res = await prisma.badge.deleteMany({
      where: { userId, type: "premium" },
    });
    return { existed: res.count > 0 };
  }
  async listPremium(): Promise<BadgeRecord[]> {
    // 実DB未検証。
    const rows = await prisma.badge.findMany({
      where: { type: "premium" },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(toBadgeRecord);
  }
}

/** Prisma 行 → BadgeRecord(criteriaSnapshot は number 値のみ受容)。実DB未検証。 */
function toBadgeRecord(row: {
  userId: string;
  type: string;
  grantedAt: Date;
  grantedBy: string | null;
  criteriaSnapshot: unknown;
}): BadgeRecord {
  return {
    userId: row.userId,
    type: "premium",
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy,
    criteriaSnapshot: normalizeSnapshot(row.criteriaSnapshot),
  };
}

/** Json(unknown) を Record<string, number> に正規化(数値以外は捨てる)。 */
function normalizeSnapshot(v: unknown): Record<string, number> | null {
  if (v === null || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

// =============================================================================
// factory — 単一インスタンスを使い回す(in-memory の状態一貫性のため)。
// =============================================================================

let _store: BadgeStore | null = null;

export function getBadgeRepo(): BadgeStore {
  if (_store) return _store;
  // 本番(production)は env.ts のフェイルクローズで常に Prisma(実DB)。
  _store = isMockDbEnabled() ? new MemoryBadgeStore() : new PrismaBadgeStore();
  return _store;
}

/**
 * 限定枠ゲート結線用の薄いヘルパ。あるユーザーが premium 保有かを返す。
 * 開発将軍が統合時に eligibility(actor.hasBadgePremium)へこの値を渡す。
 * 契約§4: 「あなたは『あるユーザーが premium 保有かを返す』関数を用意するだけ」。
 */
export async function hasPremium(userId: string): Promise<boolean> {
  return getBadgeRepo().hasPremium(userId);
}
