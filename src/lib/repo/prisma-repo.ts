// =============================================================================
// matching-app — Prisma Repository implementation (production / MOCK_DB=0)
//
// !!! 重要 !!!
// この実装は **実DB(Vercel Postgres / Neon)接続時に検証する**。
// S1 ではローカルに Postgres が無いため既定は in-memory(memory.ts)を使う。
// マイグレーション(prisma migrate)未実行のため、本クラスは実行時には呼ばれない
// (getRepo() が MOCK_DB!=0 のとき MemoryRepo を返す)。
// 型は Prisma Client に追従。スキーマ(prisma/schema.prisma)と1:1で対応する。
//
// 検証手順(将来 S0' 以降, DB接続後):
//   1. DATABASE_URL/DIRECT_URL を .env に設定
//   2. npx prisma migrate dev
//   3. MOCK_DB=0 で起動し、本実装の各メソッドを統合テストで検証
// =============================================================================

import { prisma } from "@/lib/prisma";
import {
  canAcceptGenderFlex,
  isFullByCountsFlex,
  flexCapacityFromSlot,
} from "@/lib/domain/match";
import type {
  Repo,
  UsersRepo,
  ProfilesRepo,
  IdentitiesRepo,
  SlotsRepo,
  ApplicationsRepo,
  BadgesRepo,
  MatchesRepo,
  NotificationsRepo,
  VenueCandidatesRepo,
  UserEntity,
  ProfileEntity,
  IdentityEntity,
  SlotEntity,
  ApplicationEntity,
  MatchEntity,
  NotificationLogEntity,
  VenueCandidateEntity,
  UpsertUserInput,
  UpsertProfileInput,
  SubmitIdentityInput,
  CreateSlotInput,
  ListSlotsFilter,
  CreateApplicationInput,
  CreateVenueCandidateInput,
  GenderCounts,
  ApplyAtomicResult,
  CancelOwnResult,
  SetVenueInput,
  CreateNotificationInput,
  MatchEntityStatus,
  NotificationTypeValue,
} from "./types";
import type {
  IdentityStatus,
  SlotStatus,
  Gender,
  IdentityAiVerdict,
  VenueCandidateStatus,
} from "@/lib/types";

class PrismaUsersRepo implements UsersRepo {
  async findById(id: string): Promise<UserEntity | null> {
    return (await prisma.user.findUnique({ where: { id } })) as UserEntity | null;
  }
  async findByLineUserId(lineUserId: string): Promise<UserEntity | null> {
    return (await prisma.user.findUnique({
      where: { lineUserId },
    })) as UserEntity | null;
  }
  async upsertByLineUserId(input: UpsertUserInput): Promise<UserEntity> {
    // create時のみ role を設定(update では昇格させない=権限昇格防止)。
    return (await prisma.user.upsert({
      where: { lineUserId: input.lineUserId },
      create: {
        lineUserId: input.lineUserId,
        displayName: input.displayName ?? null,
        role: input.role ?? "user",
      },
      update: {
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
      },
    })) as UserEntity;
  }
}

class PrismaProfilesRepo implements ProfilesRepo {
  async findByUserId(userId: string): Promise<ProfileEntity | null> {
    return (await prisma.profile.findUnique({
      where: { userId },
    })) as ProfileEntity | null;
  }
  async upsertByUserId(input: UpsertProfileInput): Promise<ProfileEntity> {
    return (await prisma.profile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        gender: input.gender,
        birthdate: input.birthdate,
        areaPref: input.areaPref,
        bio: input.bio ?? null,
        // S8: occupation(enum) は任意。S12 #6: occupationText(自由入力)・#8: iconKey も任意。
        ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
        ...(input.occupationText !== undefined
          ? { occupationText: input.occupationText }
          : {}),
        ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      },
      update: {
        gender: input.gender,
        birthdate: input.birthdate,
        areaPref: input.areaPref,
        bio: input.bio ?? null,
        // 未指定は既存値維持（キーごと省く）。
        ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
        ...(input.occupationText !== undefined
          ? { occupationText: input.occupationText }
          : {}),
        ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      },
    })) as ProfileEntity;
  }
  async setPhotoUrl(userId: string, photoUrl: string): Promise<ProfileEntity | null> {
    return (await prisma.profile.update({
      where: { userId },
      data: { photoUrl },
    })) as ProfileEntity;
  }
  // NOTE(実DB未検証): 評価確定時に被評価者の集計を Profile に反映する。
  //   実DBでは Rating 挿入と同一 $transaction にまとめるのが正しい（rating-repo の
  //   ★PROFILE-WRITE-HOOK / badge.md §1）。ここは memory.ts と同契約の単発 update。
  async setRatingSummary(
    userId: string,
    summary: { avg: number; count: number }
  ): Promise<ProfileEntity | null> {
    return (await prisma.profile.update({
      where: { userId },
      data: {
        ratingAvg: summary.avg,
        ratingCount: summary.count,
        updatedAt: new Date(),
      },
    })) as ProfileEntity;
  }
  // NOTE(実DB未検証): S8 多軸評価の集計を Profile に反映。overall→ratingAvg、軸別→各*Avg。
  async setMultiAxisSummary(
    userId: string,
    summary: {
      again: number;
      talk: number;
      manner: number;
      overall: number;
      count: number;
    }
  ): Promise<ProfileEntity | null> {
    return (await prisma.profile.update({
      where: { userId },
      data: {
        ratingAvg: summary.overall,
        ratingCount: summary.count,
        scoreAgainAvg: summary.again,
        scoreTalkAvg: summary.talk,
        scoreMannerAvg: summary.manner,
        updatedAt: new Date(),
      },
    })) as ProfileEntity;
  }
  // NOTE(実DB未検証): done 参加の累計を +1（バッジ判定の入力）。原子的インクリメント。
  async incrementAttended(userId: string): Promise<ProfileEntity | null> {
    return (await prisma.profile.update({
      where: { userId },
      data: {
        attendedCount: { increment: 1 },
        updatedAt: new Date(),
      },
    })) as ProfileEntity;
  }
  // NOTE(実DB未検証): S8 no-show 確定時に noShowCount を +1。
  async incrementNoShow(userId: string): Promise<ProfileEntity | null> {
    return (await prisma.profile.update({
      where: { userId },
      data: {
        noShowCount: { increment: 1 },
        updatedAt: new Date(),
      },
    })) as ProfileEntity;
  }
}

class PrismaIdentitiesRepo implements IdentitiesRepo {
  async findByUserId(userId: string): Promise<IdentityEntity | null> {
    return (await prisma.identityVerification.findUnique({
      where: { userId },
    })) as IdentityEntity | null;
  }
  async findById(id: string): Promise<IdentityEntity | null> {
    return (await prisma.identityVerification.findUnique({
      where: { id },
    })) as IdentityEntity | null;
  }
  async submit(input: SubmitIdentityInput): Promise<IdentityEntity> {
    return (await prisma.identityVerification.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        docType: input.docType,
        status: "pending",
        blobRef: input.blobRef,
      },
      update: {
        docType: input.docType,
        status: "pending",
        blobRef: input.blobRef,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        imageDeletedAt: null,
        submittedAt: new Date(),
      },
    })) as IdentityEntity;
  }
  async listByStatus(status: IdentityStatus): Promise<IdentityEntity[]> {
    return (await prisma.identityVerification.findMany({
      where: { status },
      orderBy: { submittedAt: "asc" },
    })) as IdentityEntity[];
  }
  async approve(id: string, reviewerId: string): Promise<IdentityEntity | null> {
    const now = new Date();
    // **承認時に画像削除**: blobRef=null, imageDeletedAt=now (PII最小保持)。
    return (await prisma.identityVerification.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: reviewerId,
        reviewedAt: now,
        reviewNote: null,
        blobRef: null,
        imageDeletedAt: now,
      },
    })) as IdentityEntity;
  }
  async reject(
    id: string,
    reviewerId: string,
    reason: string
  ): Promise<IdentityEntity | null> {
    const now = new Date();
    return (await prisma.identityVerification.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedBy: reviewerId,
        reviewedAt: now,
        reviewNote: reason,
        blobRef: null,
        imageDeletedAt: now,
      },
    })) as IdentityEntity;
  }
  // NOTE(実DB未検証): S8 AI一次判定の記録（status は変えない＝判定と承認を分離）。
  async setAiVerdict(
    id: string,
    verdict: IdentityAiVerdict,
    reason: string
  ): Promise<IdentityEntity | null> {
    return (await prisma.identityVerification.update({
      where: { id },
      data: {
        aiVerdict: verdict,
        aiReason: reason,
        aiCheckedAt: new Date(),
      },
    })) as IdentityEntity;
  }
}

// =============================================================================
// S2 — Slot / Application / Badge Prisma 実装(**実DB接続時に検証**)。
// in-memory(memory.ts)と型・契約を一致させる。applyAtomic は $transaction +
// 行ロック(SELECT ... FOR UPDATE)で過充足/二重応募を直列化する想定。
// =============================================================================

class PrismaSlotsRepo implements SlotsRepo {
  async findById(id: string): Promise<SlotEntity | null> {
    return (await prisma.slot.findUnique({ where: { id } })) as SlotEntity | null;
  }
  async list(filter?: ListSlotsFilter): Promise<SlotEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter?.statuses && filter.statuses.length > 0) {
      where.status = { in: filter.statuses };
    }
    if (filter?.area) where.area = filter.area;
    if (filter?.from || filter?.to) {
      where.datetimeStart = {
        ...(filter.from ? { gte: filter.from } : {}),
        ...(filter.to ? { lte: filter.to } : {}),
      };
    }
    return (await prisma.slot.findMany({
      where,
      orderBy: { datetimeStart: "asc" },
    })) as SlotEntity[];
  }
  async create(input: CreateSlotInput): Promise<SlotEntity> {
    return (await prisma.slot.create({
      data: {
        datetimeStart: input.datetimeStart,
        area: input.area,
        capacityPerGender: input.capacityPerGender ?? 3,
        // S12 #10: 柔軟定員（既定は合計6・各性別2〜4）。
        capacityTotal: input.capacityTotal ?? 6,
        minPerGender: input.minPerGender ?? 2,
        maxPerGender: input.maxPerGender ?? 4,
        minAge: input.minAge ?? null,
        maxAge: input.maxAge ?? null,
        requiresBadge: input.requiresBadge ?? false,
        feeMale: input.feeMale ?? 2000,
        note: input.note ?? null,
      },
    })) as SlotEntity;
  }
  async setStatus(id: string, status: SlotStatus): Promise<SlotEntity | null> {
    return (await prisma.slot.update({
      where: { id },
      data: { status },
    })) as SlotEntity;
  }
}

class PrismaApplicationsRepo implements ApplicationsRepo {
  async findById(id: string): Promise<ApplicationEntity | null> {
    return (await prisma.application.findUnique({
      where: { id },
    })) as ApplicationEntity | null;
  }
  async findBySlotAndUser(
    slotId: string,
    userId: string
  ): Promise<ApplicationEntity | null> {
    return (await prisma.application.findUnique({
      where: { slotId_userId: { slotId, userId } },
    })) as ApplicationEntity | null;
  }
  async countActiveByGender(slotId: string): Promise<GenderCounts> {
    const rows = await prisma.application.groupBy({
      by: ["gender"],
      where: { slotId, status: { in: ["applied", "accepted"] } },
      _count: { _all: true },
    });
    const counts: GenderCounts = { male: 0, female: 0 };
    for (const r of rows as Array<{ gender: Gender; _count: { _all: number } }>) {
      if (r.gender === "male") counts.male = r._count._all;
      else counts.female = r._count._all;
    }
    return counts;
  }

  /**
   * **原子的応募作成**(実DB接続時に検証)。$transaction 内で枠を行ロックし、
   * 状態/二重応募/定員を再判定。UNIQUE(slotId,userId) で二重応募をDB保証する。
   *
   * S12 #10: 定員/成立は **slot の柔軟定員(合計6・各性別2〜4)** で判定する
   * (memory.applyAtomic と **完全に同一の純関数** canAcceptGenderFlex / isFullByCountsFlex
   *  を使い、in-memory とDB経路で成立条件がズレないようにする = SEC-001 再発防止)。
   * 成立(合計6 かつ 各性別[min,max])なら同一TXで Slot を filled に更新する。
   * 第2引数 `_capacityPerGender` は後方互換のため残すが判定には使わない。
   */
  async applyAtomic(
    input: CreateApplicationInput,
    _capacityPerGender: number
  ): Promise<ApplyAtomicResult> {
    return prisma.$transaction(async (tx) => {
      // 行ロック(Postgres)。Prisma の typed API に FOR UPDATE が無いため raw で確保。
      await tx.$queryRaw`SELECT id FROM "slots" WHERE id = ${input.slotId} FOR UPDATE`;
      const slot = (await tx.slot.findUnique({
        where: { id: input.slotId },
      })) as SlotEntity | null;
      if (!slot) {
        return { application: null, error: "slot_not_found" as const, matched: false, counts: { male: 0, female: 0 } };
      }
      if (slot.status !== "open") {
        return { application: null, error: "slot_closed" as const, matched: false, counts: { male: 0, female: 0 } };
      }
      const existing = (await tx.application.findUnique({
        where: { slotId_userId: { slotId: input.slotId, userId: input.userId } },
      })) as ApplicationEntity | null;
      if (existing && (existing.status === "applied" || existing.status === "accepted")) {
        return { application: null, error: "already_applied" as const, matched: false, counts: { male: 0, female: 0 } };
      }
      const grouped = await tx.application.groupBy({
        by: ["gender"],
        where: { slotId: input.slotId, status: { in: ["applied", "accepted"] } },
        _count: { _all: true },
      });
      const counts: GenderCounts = { male: 0, female: 0 };
      for (const r of grouped as Array<{ gender: Gender; _count: { _all: number } }>) {
        if (r.gender === "male") counts.male = r._count._all;
        else counts.female = r._count._all;
      }
      // S12 #10: 柔軟定員の応募ゲート。slot の cap を出所にし、引数には依存しない。
      const cap = flexCapacityFromSlot(slot);
      if (!canAcceptGenderFlex(counts, input.gender, cap)) {
        return { application: null, error: "gender_full" as const, matched: false, counts };
      }
      const app = (await tx.application.upsert({
        where: { slotId_userId: { slotId: input.slotId, userId: input.userId } },
        create: {
          slotId: input.slotId,
          userId: input.userId,
          gender: input.gender,
          status: "applied",
          paymentId: input.paymentId ?? null,
        },
        update: {
          status: "applied",
          gender: input.gender,
          paymentId: input.paymentId ?? null,
          appliedAt: new Date(),
        },
      })) as ApplicationEntity;

      const after: GenderCounts = {
        male: counts.male + (input.gender === "male" ? 1 : 0),
        female: counts.female + (input.gender === "female" ? 1 : 0),
      };
      // S12 #10: 柔軟定員の成立判定(memory.applyAtomic と同一の純関数)。
      const matched = isFullByCountsFlex(after, cap);
      if (matched) {
        await tx.slot.update({ where: { id: input.slotId }, data: { status: "filled" } });
      }
      return { application: app, error: null, matched, counts: after };
    });
  }

  async cancelOwn(applicationId: string, userId: string): Promise<CancelOwnResult> {
    return prisma.$transaction(async (tx) => {
      const app = (await tx.application.findUnique({
        where: { id: applicationId },
      })) as ApplicationEntity | null;
      if (!app) return { application: null, error: "not_found" as const };
      if (app.userId !== userId) return { application: null, error: "forbidden" as const };
      if (app.status !== "applied") return { application: null, error: "not_cancelable" as const };
      const slot = (await tx.slot.findUnique({ where: { id: app.slotId } })) as SlotEntity | null;
      if (slot && slot.status !== "open") {
        return { application: null, error: "not_cancelable" as const };
      }
      const updated = (await tx.application.update({
        where: { id: applicationId },
        data: { status: "canceled" },
      })) as ApplicationEntity;
      return { application: updated, error: null };
    });
  }

  async listByUser(userId: string): Promise<ApplicationEntity[]> {
    return (await prisma.application.findMany({
      where: { userId },
      orderBy: { appliedAt: "desc" },
    })) as ApplicationEntity[];
  }

  async listActiveBySlot(slotId: string): Promise<ApplicationEntity[]> {
    return (await prisma.application.findMany({
      where: { slotId, status: { in: ["applied", "accepted"] } },
      orderBy: { appliedAt: "asc" },
    })) as ApplicationEntity[];
  }

  async acceptAllActiveBySlot(slotId: string): Promise<ApplicationEntity[]> {
    // applied → accepted（既に accepted は据え置き）。確定後の有効応募を返す。
    await prisma.application.updateMany({
      where: { slotId, status: "applied" },
      data: { status: "accepted" },
    });
    return (await prisma.application.findMany({
      where: { slotId, status: "accepted" },
      orderBy: { appliedAt: "asc" },
    })) as ApplicationEntity[];
  }
}

class PrismaBadgesRepo implements BadgesRepo {
  async hasPremium(userId: string): Promise<boolean> {
    const badge = await prisma.badge.findUnique({
      where: { userId_type: { userId, type: "premium" } },
    });
    return badge !== null;
  }
}

// =============================================================================
// S3 — Match / NotificationLog Prisma 実装(**実DB接続時に検証**)。
// in-memory(memory.ts)と型・契約を一致させる。createForSlot は slotId 一意で
// 冪等（既存があれば返す）にし、二重成立通知を防ぐ。
// =============================================================================

const DEFAULT_MATCH_STATUSES: MatchEntityStatus[] = [
  "pending_venue",
  "venue_set",
  "notified",
];

class PrismaMatchesRepo implements MatchesRepo {
  async findById(id: string): Promise<MatchEntity | null> {
    return (await prisma.match.findUnique({ where: { id } })) as MatchEntity | null;
  }
  async findBySlotId(slotId: string): Promise<MatchEntity | null> {
    return (await prisma.match.findUnique({
      where: { slotId },
    })) as MatchEntity | null;
  }
  async list(statuses?: MatchEntityStatus[]): Promise<MatchEntity[]> {
    const want = statuses && statuses.length > 0 ? statuses : DEFAULT_MATCH_STATUSES;
    return (await prisma.match.findMany({
      where: { status: { in: want } },
      orderBy: { matchedAt: "desc" },
    })) as MatchEntity[];
  }
  async createForSlot(slotId: string): Promise<MatchEntity> {
    // 冪等: slotId 一意なので既存があれば返す（再作成しない）。
    const existing = await this.findBySlotId(slotId);
    if (existing) return existing;
    return (await prisma.match.create({
      data: { slotId, status: "pending_venue", matchedAt: new Date() },
    })) as MatchEntity;
  }
  async setVenue(id: string, input: SetVenueInput): Promise<MatchEntity | null> {
    return (await prisma.match.update({
      where: { id },
      data: {
        venueName: input.venueName,
        venueUrl: input.venueUrl ?? null,
        reservationName: input.reservationName,
        meetingPlace: input.meetingPlace ?? null,
        status: "venue_set",
        confirmedAt: new Date(),
      },
    })) as MatchEntity;
  }
  async markNotified(id: string): Promise<MatchEntity | null> {
    return (await prisma.match.update({
      where: { id },
      data: { status: "notified", notifiedAt: new Date() },
    })) as MatchEntity;
  }
}

class PrismaNotificationsRepo implements NotificationsRepo {
  async create(input: CreateNotificationInput): Promise<NotificationLogEntity> {
    const status = input.status ?? "pending";
    return (await prisma.notificationLog.create({
      data: {
        userId: input.userId,
        type: input.type,
        status,
        slotId: input.slotId ?? null,
        matchId: input.matchId ?? null,
        payload: input.payload as never,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ?? null,
        sentAt: status === "sent" ? new Date() : null,
      },
    })) as unknown as NotificationLogEntity;
  }
  async listByMatch(
    matchId: string,
    type?: NotificationTypeValue
  ): Promise<NotificationLogEntity[]> {
    return (await prisma.notificationLog.findMany({
      where: { matchId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "asc" },
    })) as unknown as NotificationLogEntity[];
  }
}

// =============================================================================
// S8 — VenueCandidate Prisma 実装(**実DB接続時に検証**)。spec 要望2。
// schema.prisma の VenueCandidate に 1:1。fitScore 降順(null最後)→createdAt 昇順。
// =============================================================================
class PrismaVenueCandidatesRepo implements VenueCandidatesRepo {
  async listBySlot(slotId: string): Promise<VenueCandidateEntity[]> {
    // Postgres は NULLS LAST が既定（DESC 時 null が先頭になるのを避けるため
    // createdAt の昇順も併用）。厳密な null 配置は実DB検証時に nulls 指定を足す。
    return (await prisma.venueCandidate.findMany({
      where: { slotId },
      orderBy: [{ fitScore: "desc" }, { createdAt: "asc" }],
    })) as VenueCandidateEntity[];
  }
  async findById(id: string): Promise<VenueCandidateEntity | null> {
    return (await prisma.venueCandidate.findUnique({
      where: { id },
    })) as VenueCandidateEntity | null;
  }
  async create(input: CreateVenueCandidateInput): Promise<VenueCandidateEntity> {
    return (await prisma.venueCandidate.create({
      data: {
        slotId: input.slotId,
        name: input.name,
        url: input.url ?? null,
        tabelogScore: input.tabelogScore ?? null,
        googleScore: input.googleScore ?? null,
        fitScore: input.fitScore ?? null,
        area: input.area,
        status: "suggested",
        suggestedBy: input.suggestedBy ?? null,
      },
    })) as VenueCandidateEntity;
  }
  async setStatus(
    id: string,
    status: VenueCandidateStatus
  ): Promise<VenueCandidateEntity | null> {
    return (await prisma.venueCandidate.update({
      where: { id },
      data: { status },
    })) as VenueCandidateEntity;
  }
}

export class PrismaRepo implements Repo {
  users = new PrismaUsersRepo();
  profiles = new PrismaProfilesRepo();
  identities = new PrismaIdentitiesRepo();
  slots = new PrismaSlotsRepo();
  applications = new PrismaApplicationsRepo();
  badges = new PrismaBadgesRepo();
  matches = new PrismaMatchesRepo();
  notifications = new PrismaNotificationsRepo();
  venueCandidates = new PrismaVenueCandidatesRepo();
}
