// =============================================================================
// matching-app — in-memory Repository implementation (default / MOCK_DB=1)
// 契約§0: ローカルにPostgresが無いため in-memory でアプリを動かし E2E まで通す。
//
// 永続化はプロセスメモリのみ(dev/test 用)。HMR をまたいで状態を保つため
// globalThis にストアを保持する。本番は prisma.ts 実装に切替える。
// =============================================================================

import crypto from "node:crypto";
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
import {
  canAcceptGenderFlex,
  isFullByCountsFlex,
  flexCapacityFromSlot,
} from "@/lib/domain/match";

interface Store {
  users: Map<string, UserEntity>;
  profiles: Map<string, ProfileEntity>; // key: userId
  identities: Map<string, IdentityEntity>; // key: userId
  slots: Map<string, SlotEntity>; // key: slot id
  applications: Map<string, ApplicationEntity>; // key: application id
  badges: Map<string, Set<"premium">>; // key: userId → 保有バッジ集合(S2はseedのみ)
  matches: Map<string, MatchEntity>; // key: match id
  notifications: NotificationLogEntity[]; // 追記順（監査ログ）
  venueCandidates: Map<string, VenueCandidateEntity>; // key: venue candidate id
  seeded: boolean;
}

function cuid(): string {
  // cuid 風: 連番ID不使用(列挙攻撃難化)。dev用に十分なランダム性。
  return "c" + crypto.randomBytes(12).toString("hex");
}

const g = globalThis as unknown as { __mappStore?: Store };

function emptyStore(): Store {
  return {
    users: new Map(),
    profiles: new Map(),
    identities: new Map(),
    slots: new Map(),
    applications: new Map(),
    badges: new Map(),
    matches: new Map(),
    notifications: [],
    venueCandidates: new Map(),
    seeded: false,
  };
}

function store(): Store {
  if (!g.__mappStore) {
    g.__mappStore = emptyStore();
    seed(g.__mappStore);
  }
  return g.__mappStore;
}

class MemoryUsersRepo implements UsersRepo {
  async findById(id: string): Promise<UserEntity | null> {
    return store().users.get(id) ?? null;
  }
  async findByLineUserId(lineUserId: string): Promise<UserEntity | null> {
    for (const u of store().users.values()) {
      if (u.lineUserId === lineUserId) return u;
    }
    return null;
  }
  async upsertByLineUserId(input: UpsertUserInput): Promise<UserEntity> {
    const s = store();
    const existing = await this.findByLineUserId(input.lineUserId);
    const now = new Date();
    if (existing) {
      // displayName のみ任意更新。role は upsert で勝手に昇格させない(権限昇格防止)。
      if (input.displayName !== undefined) existing.displayName = input.displayName;
      existing.updatedAt = now;
      s.users.set(existing.id, existing);
      return existing;
    }
    const user: UserEntity = {
      id: cuid(),
      lineUserId: input.lineUserId,
      displayName: input.displayName ?? null,
      // role: dev-login のみ明示 role を許容(契約: MOCK専用)。既定は user。
      role: input.role ?? "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    s.users.set(user.id, user);
    return user;
  }
}

class MemoryProfilesRepo implements ProfilesRepo {
  async findByUserId(userId: string): Promise<ProfileEntity | null> {
    return store().profiles.get(userId) ?? null;
  }
  async upsertByUserId(input: UpsertProfileInput): Promise<ProfileEntity> {
    const s = store();
    const now = new Date();
    const existing = s.profiles.get(input.userId);
    if (existing) {
      existing.gender = input.gender;
      existing.birthdate = input.birthdate;
      existing.areaPref = input.areaPref;
      existing.bio = input.bio ?? null;
      // occupation/occupationText/iconKey は指定時のみ更新（未指定は既存値維持＝部分更新の事故防止）。
      if (input.occupation !== undefined) existing.occupation = input.occupation;
      if (input.occupationText !== undefined)
        existing.occupationText = input.occupationText;
      if (input.iconKey !== undefined) existing.iconKey = input.iconKey;
      existing.updatedAt = now;
      s.profiles.set(input.userId, existing);
      return existing;
    }
    const profile: ProfileEntity = {
      id: cuid(),
      userId: input.userId,
      gender: input.gender,
      birthdate: input.birthdate,
      photoUrl: null,
      iconKey: input.iconKey ?? null,
      bio: input.bio ?? null,
      areaPref: input.areaPref,
      occupation: input.occupation ?? null,
      occupationText: input.occupationText ?? null,
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
      scoreAgainAvg: 0,
      scoreTalkAvg: 0,
      scoreMannerAvg: 0,
      noShowCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    s.profiles.set(input.userId, profile);
    return profile;
  }
  async setPhotoUrl(userId: string, photoUrl: string): Promise<ProfileEntity | null> {
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    existing.photoUrl = photoUrl;
    existing.updatedAt = new Date();
    s.profiles.set(userId, existing);
    return existing;
  }
  async setRatingSummary(
    userId: string,
    summary: { avg: number; count: number }
  ): Promise<ProfileEntity | null> {
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    existing.ratingAvg = summary.avg;
    existing.ratingCount = summary.count;
    existing.updatedAt = new Date();
    s.profiles.set(userId, existing);
    return existing;
  }
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
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    // overall を総合(ratingAvg)へ、軸別を各 *Avg へ。ratingCount も同期。
    existing.ratingAvg = summary.overall;
    existing.ratingCount = summary.count;
    existing.scoreAgainAvg = summary.again;
    existing.scoreTalkAvg = summary.talk;
    existing.scoreMannerAvg = summary.manner;
    existing.updatedAt = new Date();
    s.profiles.set(userId, existing);
    return existing;
  }
  async incrementAttended(userId: string): Promise<ProfileEntity | null> {
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    existing.attendedCount += 1;
    existing.updatedAt = new Date();
    s.profiles.set(userId, existing);
    return existing;
  }
  async incrementNoShow(userId: string): Promise<ProfileEntity | null> {
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    existing.noShowCount += 1;
    existing.updatedAt = new Date();
    s.profiles.set(userId, existing);
    return existing;
  }
}

class MemoryIdentitiesRepo implements IdentitiesRepo {
  async findByUserId(userId: string): Promise<IdentityEntity | null> {
    return store().identities.get(userId) ?? null;
  }
  async findById(id: string): Promise<IdentityEntity | null> {
    for (const iv of store().identities.values()) {
      if (iv.id === id) return iv;
    }
    return null;
  }
  async submit(input: SubmitIdentityInput): Promise<IdentityEntity> {
    const s = store();
    const now = new Date();
    const existing = s.identities.get(input.userId);
    if (existing) {
      // 却下後の再申請: pending に戻し、新しい画像参照を入れ、審査メタをリセット。
      existing.docType = input.docType;
      existing.status = "pending";
      existing.blobRef = input.blobRef;
      existing.reviewedBy = null;
      existing.reviewedAt = null;
      existing.reviewNote = null;
      existing.imageDeletedAt = null;
      // 再申請時はAI判定もリセット（新しい画像で再判定する）。
      existing.aiVerdict = null;
      existing.aiReason = null;
      existing.aiCheckedAt = null;
      existing.submittedAt = now;
      existing.updatedAt = now;
      s.identities.set(input.userId, existing);
      return existing;
    }
    const iv: IdentityEntity = {
      id: cuid(),
      userId: input.userId,
      docType: input.docType,
      status: "pending",
      blobRef: input.blobRef,
      dobChecked: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      imageDeletedAt: null,
      aiVerdict: null,
      aiReason: null,
      aiCheckedAt: null,
      submittedAt: now,
      updatedAt: now,
    };
    s.identities.set(input.userId, iv);
    return iv;
  }
  async listByStatus(status: IdentityStatus): Promise<IdentityEntity[]> {
    const out: IdentityEntity[] = [];
    for (const iv of store().identities.values()) {
      if (iv.status === status) out.push(iv);
    }
    // submittedAt 昇順(古い申請から審査)。
    out.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    return out;
  }
  async approve(id: string, reviewerId: string): Promise<IdentityEntity | null> {
    const iv = await this.findById(id);
    if (!iv) return null;
    const now = new Date();
    iv.status = "approved";
    iv.reviewedBy = reviewerId;
    iv.reviewedAt = now;
    iv.reviewNote = null;
    // **PII最小保持**: 承認時に画像実体を削除し参照を null 化、削除日時を記録。
    iv.blobRef = null;
    iv.imageDeletedAt = now;
    iv.updatedAt = now;
    store().identities.set(iv.userId, iv);
    return iv;
  }
  async reject(
    id: string,
    reviewerId: string,
    reason: string
  ): Promise<IdentityEntity | null> {
    const iv = await this.findById(id);
    if (!iv) return null;
    const now = new Date();
    iv.status = "rejected";
    iv.reviewedBy = reviewerId;
    iv.reviewedAt = now;
    iv.reviewNote = reason;
    // 却下でも再提出に備え画像を早期削除(運用ポリシー / auth-flow.md §2)。
    iv.blobRef = null;
    iv.imageDeletedAt = now;
    iv.updatedAt = now;
    store().identities.set(iv.userId, iv);
    return iv;
  }
  async setAiVerdict(
    id: string,
    verdict: IdentityAiVerdict,
    reason: string
  ): Promise<IdentityEntity | null> {
    const iv = await this.findById(id);
    if (!iv) return null;
    const now = new Date();
    // 判定の記録のみ（status は変えない＝判定と承認/却下を分離）。
    iv.aiVerdict = verdict;
    iv.aiReason = reason;
    iv.aiCheckedAt = now;
    iv.updatedAt = now;
    store().identities.set(iv.userId, iv);
    return iv;
  }
}

// --- helpers shared by Slot/Application repos ----------------------------

/** 有効応募(applied/accepted)を性別ごとに数える(同期・store直読み)。 */
function countActiveByGenderSync(s: Store, slotId: string): GenderCounts {
  const counts: GenderCounts = { male: 0, female: 0 };
  for (const a of s.applications.values()) {
    if (a.slotId !== slotId) continue;
    if (a.status !== "applied" && a.status !== "accepted") continue;
    if (a.gender === "male") counts.male += 1;
    else counts.female += 1;
  }
  return counts;
}

class MemorySlotsRepo implements SlotsRepo {
  async findById(id: string): Promise<SlotEntity | null> {
    return store().slots.get(id) ?? null;
  }
  async list(filter?: ListSlotsFilter): Promise<SlotEntity[]> {
    const s = store();
    const statuses = filter?.statuses;
    const out: SlotEntity[] = [];
    for (const slot of s.slots.values()) {
      if (statuses && !statuses.includes(slot.status)) continue;
      if (filter?.area && slot.area !== filter.area) continue;
      if (filter?.from && slot.datetimeStart.getTime() < filter.from.getTime())
        continue;
      if (filter?.to && slot.datetimeStart.getTime() > filter.to.getTime())
        continue;
      out.push(slot);
    }
    // datetimeStart 昇順(同時刻は id で安定化)。
    out.sort((a, b) => {
      const d = a.datetimeStart.getTime() - b.datetimeStart.getTime();
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
    return out;
  }
  async create(input: CreateSlotInput): Promise<SlotEntity> {
    const s = store();
    const now = new Date();
    const slot: SlotEntity = {
      id: cuid(),
      datetimeStart: input.datetimeStart,
      area: input.area,
      capacityPerGender: input.capacityPerGender ?? 3,
      capacityTotal: input.capacityTotal ?? 6,
      minPerGender: input.minPerGender ?? 2,
      maxPerGender: input.maxPerGender ?? 4,
      status: "open",
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      requiresBadge: input.requiresBadge ?? false,
      feeMale: input.feeMale ?? 2000,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    s.slots.set(slot.id, slot);
    return slot;
  }
  async setStatus(id: string, status: SlotStatus): Promise<SlotEntity | null> {
    const s = store();
    const slot = s.slots.get(id);
    if (!slot) return null;
    slot.status = status;
    slot.updatedAt = new Date();
    s.slots.set(id, slot);
    return slot;
  }
}

class MemoryApplicationsRepo implements ApplicationsRepo {
  async findById(id: string): Promise<ApplicationEntity | null> {
    return store().applications.get(id) ?? null;
  }
  async findBySlotAndUser(
    slotId: string,
    userId: string
  ): Promise<ApplicationEntity | null> {
    for (const a of store().applications.values()) {
      if (a.slotId === slotId && a.userId === userId) return a;
    }
    return null;
  }
  async countActiveByGender(slotId: string): Promise<GenderCounts> {
    return countActiveByGenderSync(store(), slotId);
  }

  /**
   * **原子的応募作成**。in-memory は単スレッド: read→validate→write の間に
   * await を挟まないため、この同期区間は不可分(他の応募と割り込まない)。
   * これにより同性別5名以上の過充足・合計超過と二重応募を防止する(matching-logic.md §4)。
   * Prisma 実装側では SELECT ... FOR UPDATE + UNIQUE(slotId,userId) で同等を担保する。
   *
   * S12 #10: 定員/成立は **slot の柔軟定員(合計6・各性別2〜4)** で判定する。
   * 第2引数 `_capacityPerGender` は後方互換のため残すが判定には使わない
   * (cap は slot から flexCapacityFromSlot で解決し、memory/prisma で同一基準にする)。
   */
  async applyAtomic(
    input: CreateApplicationInput,
    _capacityPerGender: number
  ): Promise<ApplyAtomicResult> {
    const s = store();

    const slot = s.slots.get(input.slotId);
    if (!slot) {
      return { application: null, error: "slot_not_found", matched: false, counts: { male: 0, female: 0 } };
    }
    // 1. 枠状態
    if (slot.status !== "open") {
      return {
        application: null,
        error: "slot_closed",
        matched: false,
        counts: countActiveByGenderSync(s, input.slotId),
      };
    }
    // 2. 二重応募(有効/取消問わず既存行があれば衝突。取消後の再応募もここで弾く)。
    //    取消後の再応募を許す運用にするならここを status 判定に緩めるが、
    //    UNIQUE(slotId,userId) のDB制約に合わせ「行が存在したら衝突」とする。
    const existing = await this.findBySlotAndUser(input.slotId, input.userId);
    if (existing && (existing.status === "applied" || existing.status === "accepted")) {
      return {
        application: null,
        error: "already_applied",
        matched: false,
        counts: countActiveByGenderSync(s, input.slotId),
      };
    }
    // 3. 定員(過充足防止)。S12 #10: 柔軟定員(合計6・各性別2〜4)。
    //    判定は slot の flex cap を出所とし、引数 capacityPerGender(後方互換)には依存しない。
    //    canAcceptGenderFlex が false = その性別を1名足すと max 超過 or 合計超過 → gender_full。
    const counts = countActiveByGenderSync(s, input.slotId);
    const cap = flexCapacityFromSlot(slot);
    if (!canAcceptGenderFlex(counts, input.gender, cap)) {
      return { application: null, error: "gender_full", matched: false, counts };
    }

    // 4. 作成(取消済みの既存行があれば applied に復活、無ければ新規)。
    const now = new Date();
    let app: ApplicationEntity;
    if (existing) {
      existing.status = "applied";
      existing.gender = input.gender;
      existing.paymentId = input.paymentId ?? null;
      existing.appliedAt = now;
      existing.updatedAt = now;
      app = existing;
    } else {
      app = {
        id: cuid(),
        slotId: input.slotId,
        userId: input.userId,
        gender: input.gender,
        status: "applied",
        paymentId: input.paymentId ?? null,
        appliedAt: now,
        updatedAt: now,
      };
    }
    s.applications.set(app.id, app);

    // 5. 成立判定(S12 #10 柔軟定員)。合計==capacityTotal かつ 各性別∈[min,max]。
    //    3:3 / 2:4 / 4:2=成立、5:1 / 6:0=不成立。after カウントから純関数で判定。
    const after = countActiveByGenderSync(s, input.slotId);
    const matched = isFullByCountsFlex(after, cap);
    if (matched) {
      slot.status = "filled";
      slot.updatedAt = now;
      s.slots.set(slot.id, slot);
    }

    return { application: app, error: null, matched, counts: after };
  }

  async cancelOwn(
    applicationId: string,
    userId: string
  ): Promise<CancelOwnResult> {
    const s = store();
    const app = s.applications.get(applicationId);
    if (!app) return { application: null, error: "not_found" };
    // IDOR防止: 所有者一致を確認(URLのidだけでなくセッションuserと突合)。
    if (app.userId !== userId) return { application: null, error: "forbidden" };
    if (app.status !== "applied") {
      // accepted(成立後) / canceled は自己取消不可(matching-logic.md §7)。
      return { application: null, error: "not_cancelable" };
    }
    const slot = s.slots.get(app.slotId);
    if (slot && slot.status !== "open") {
      // 締切後(filled以降)は自己取消不可。
      return { application: null, error: "not_cancelable" };
    }
    app.status = "canceled";
    app.updatedAt = new Date();
    s.applications.set(app.id, app);
    return { application: app, error: null };
  }

  async listByUser(userId: string): Promise<ApplicationEntity[]> {
    const out: ApplicationEntity[] = [];
    for (const a of store().applications.values()) {
      if (a.userId === userId) out.push(a);
    }
    out.sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
    return out;
  }

  async listActiveBySlot(slotId: string): Promise<ApplicationEntity[]> {
    const out: ApplicationEntity[] = [];
    for (const a of store().applications.values()) {
      if (a.slotId !== slotId) continue;
      if (a.status !== "applied" && a.status !== "accepted") continue;
      out.push(a);
    }
    out.sort((a, b) => a.appliedAt.getTime() - b.appliedAt.getTime());
    return out;
  }

  async acceptAllActiveBySlot(slotId: string): Promise<ApplicationEntity[]> {
    const s = store();
    const now = new Date();
    const out: ApplicationEntity[] = [];
    for (const a of s.applications.values()) {
      if (a.slotId !== slotId) continue;
      if (a.status === "applied") {
        a.status = "accepted";
        a.updatedAt = now;
        s.applications.set(a.id, a);
      }
      if (a.status === "accepted") out.push(a);
    }
    out.sort((a, b) => a.appliedAt.getTime() - b.appliedAt.getTime());
    return out;
  }
}

class MemoryBadgesRepo implements BadgesRepo {
  async hasPremium(userId: string): Promise<boolean> {
    const set = store().badges.get(userId);
    return set ? set.has("premium") : false;
  }
}

const DEFAULT_MATCH_STATUSES: MatchEntityStatus[] = [
  "pending_venue",
  "venue_set",
  "notified",
];

class MemoryMatchesRepo implements MatchesRepo {
  async findById(id: string): Promise<MatchEntity | null> {
    return store().matches.get(id) ?? null;
  }
  async findBySlotId(slotId: string): Promise<MatchEntity | null> {
    for (const m of store().matches.values()) {
      if (m.slotId === slotId) return m;
    }
    return null;
  }
  async list(statuses?: MatchEntityStatus[]): Promise<MatchEntity[]> {
    const want = statuses && statuses.length > 0 ? statuses : DEFAULT_MATCH_STATUSES;
    const out: MatchEntity[] = [];
    for (const m of store().matches.values()) {
      if (want.includes(m.status)) out.push(m);
    }
    // matchedAt 降順（新しい成立から処理）。同時刻は id で安定化。
    out.sort((a, b) => {
      const d = b.matchedAt.getTime() - a.matchedAt.getTime();
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
    return out;
  }
  async createForSlot(slotId: string): Promise<MatchEntity> {
    const s = store();
    // 冪等: 既存があれば再作成しない（slotId 一意 / 二重成立通知の防止）。
    const existing = await this.findBySlotId(slotId);
    if (existing) return existing;
    const now = new Date();
    const match: MatchEntity = {
      id: cuid(),
      slotId,
      status: "pending_venue",
      matchedAt: now,
      venueName: null,
      venueUrl: null,
      reservationName: null,
      meetingPlace: null,
      confirmedAt: null,
      notifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    s.matches.set(match.id, match);
    return match;
  }
  async setVenue(id: string, input: SetVenueInput): Promise<MatchEntity | null> {
    const s = store();
    const m = s.matches.get(id);
    if (!m) return null;
    const now = new Date();
    m.venueName = input.venueName;
    m.venueUrl = input.venueUrl ?? null;
    m.reservationName = input.reservationName;
    m.meetingPlace = input.meetingPlace ?? null;
    m.status = "venue_set";
    m.confirmedAt = now;
    m.updatedAt = now;
    s.matches.set(id, m);
    return m;
  }
  async markNotified(id: string): Promise<MatchEntity | null> {
    const s = store();
    const m = s.matches.get(id);
    if (!m) return null;
    const now = new Date();
    m.status = "notified";
    m.notifiedAt = now;
    m.updatedAt = now;
    s.matches.set(id, m);
    return m;
  }
}

class MemoryNotificationsRepo implements NotificationsRepo {
  async create(input: CreateNotificationInput): Promise<NotificationLogEntity> {
    const s = store();
    const now = new Date();
    const status = input.status ?? "pending";
    const entry: NotificationLogEntity = {
      id: cuid(),
      userId: input.userId,
      type: input.type,
      status,
      slotId: input.slotId ?? null,
      matchId: input.matchId ?? null,
      // payload は浅いコピーで保持（呼び出し側の後続変更から隔離）。
      payload: { ...input.payload },
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      sentAt: status === "sent" ? now : null,
      createdAt: now,
    };
    s.notifications.push(entry);
    return entry;
  }
  async listByMatch(
    matchId: string,
    type?: NotificationTypeValue
  ): Promise<NotificationLogEntity[]> {
    return store().notifications.filter(
      (n) => n.matchId === matchId && (type ? n.type === type : true)
    );
  }
}

class MemoryVenueCandidatesRepo implements VenueCandidatesRepo {
  async listBySlot(slotId: string): Promise<VenueCandidateEntity[]> {
    const out: VenueCandidateEntity[] = [];
    for (const v of store().venueCandidates.values()) {
      if (v.slotId === slotId) out.push(v);
    }
    // fitScore 降順（合コン向き度が高い順）。null は最後。同点は createdAt 昇順で安定化。
    out.sort((a, b) => {
      const fa = a.fitScore ?? -Infinity;
      const fb = b.fitScore ?? -Infinity;
      if (fb !== fa) return fb - fa;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return out;
  }
  async findById(id: string): Promise<VenueCandidateEntity | null> {
    return store().venueCandidates.get(id) ?? null;
  }
  async create(input: CreateVenueCandidateInput): Promise<VenueCandidateEntity> {
    const s = store();
    const now = new Date();
    const v: VenueCandidateEntity = {
      id: cuid(),
      slotId: input.slotId,
      name: input.name,
      url: input.url ?? null,
      tabelogScore: input.tabelogScore ?? null,
      googleScore: input.googleScore ?? null,
      fitScore: input.fitScore ?? null,
      area: input.area,
      status: "suggested",
      suggestedBy: input.suggestedBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    s.venueCandidates.set(v.id, v);
    return v;
  }
  async setStatus(
    id: string,
    status: VenueCandidateStatus
  ): Promise<VenueCandidateEntity | null> {
    const s = store();
    const v = s.venueCandidates.get(id);
    if (!v) return null;
    v.status = status;
    v.updatedAt = new Date();
    s.venueCandidates.set(id, v);
    return v;
  }
}

export class MemoryRepo implements Repo {
  users = new MemoryUsersRepo();
  profiles = new MemoryProfilesRepo();
  identities = new MemoryIdentitiesRepo();
  slots = new MemorySlotsRepo();
  applications = new MemoryApplicationsRepo();
  badges = new MemoryBadgesRepo();
  matches = new MemoryMatchesRepo();
  notifications = new MemoryNotificationsRepo();
  venueCandidates = new MemoryVenueCandidatesRepo();
}

// =============================================================================
// dev seed — admin 1名 + テストユーザー(男女)。in-memory のみ。
// admin 昇格はアプリ経由で行わない(auth-flow.md §3)。ここで直接 role=admin を付与。
// =============================================================================
function seed(s: Store): void {
  if (s.seeded) return;
  const now = new Date();

  const admin: UserEntity = {
    id: "seed-admin",
    lineUserId: "Uadmin0000000000000000000000seed",
    displayName: "運営アドミン",
    role: "admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  s.users.set(admin.id, admin);

  // 男性テストユーザー(approved + profile完成 → canApply:true 状態)。
  const male: UserEntity = {
    id: "seed-user-male",
    lineUserId: "Umale00000000000000000000000seed",
    displayName: "テスト太郎",
    role: "user",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  s.users.set(male.id, male);
  s.profiles.set(male.id, {
    id: "seed-profile-male",
    userId: male.id,
    gender: "male",
    birthdate: new Date(Date.UTC(1994, 4, 15)), // 1994-05-15 → 31歳
    photoUrl: null,
    iconKey: "fox", // S12 #8: 写真ではなくプリセットアイコン。
    bio: "よろしくお願いします",
    areaPref: ["ebisu", "ginza"],
    occupation: "it",
    occupationText: "ITエンジニア（スタートアップ）", // S12 #6: 自由入力（成立詳細で開示）。
    ratingAvg: 4.6, // premium 相当の総合平均（バッジ seed と整合）。
    ratingCount: 8,
    attendedCount: 3,
    scoreAgainAvg: 4.7,
    scoreTalkAvg: 4.5,
    scoreMannerAvg: 4.6,
    noShowCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  s.identities.set(male.id, {
    id: "seed-identity-male",
    userId: male.id,
    docType: "drivers_license",
    status: "approved",
    blobRef: null, // 承認済 = 画像削除済
    dobChecked: null,
    reviewedBy: admin.id,
    reviewedAt: now,
    reviewNote: null,
    imageDeletedAt: now,
    aiVerdict: "ok", // 承認済 = AI一次判定 ok（自動承認経路のサンプル）。
    aiReason: "18歳以上・顔写真あり・記載読取可（seed）",
    aiCheckedAt: now,
    submittedAt: now,
    updatedAt: now,
  });

  // 男性 seed は優良バッジ(premium)保有 → バッジ限定枠の応募経路をテスト可能に。
  s.badges.set(male.id, new Set(["premium"]));

  // 女性テストユーザー(identity未提出 → canApply:false / identity_required)。
  const female: UserEntity = {
    id: "seed-user-female",
    lineUserId: "Ufemale000000000000000000000seed",
    displayName: "テスト花子",
    role: "user",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  s.users.set(female.id, female);
  s.profiles.set(female.id, {
    id: "seed-profile-female",
    userId: female.id,
    gender: "female",
    birthdate: new Date(Date.UTC(1996, 7, 20)), // 1996-08-20 → 29歳
    photoUrl: null,
    iconKey: "cat", // S12 #8
    bio: "はじめまして。お酒と旅行が好きです。", // S12 #4: 成立詳細で開示。
    areaPref: ["ikebukuro"],
    occupation: "medical",
    occupationText: "看護師", // S12 #6
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

  // --- S2 seed: テスト枠を複数(通常 / 20代限定 / 優良バッジ限定)。--------------
  // datetimeStart は seed 時刻から十分未来(JST表示の都合は問わない・判定は status/条件)。
  const day = 24 * 60 * 60 * 1000;
  const base = now.getTime();

  const slotNormal: SlotEntity = {
    id: "seed-slot-normal",
    datetimeStart: new Date(base + 7 * day),
    area: "ebisu",
    capacityPerGender: 3,
    capacityTotal: 6,
    minPerGender: 2,
    maxPerGender: 4,
    status: "open",
    minAge: null,
    maxAge: null,
    requiresBadge: false,
    feeMale: 2000,
    note: "通常枠(条件なし)",
    createdAt: now,
    updatedAt: now,
  };
  s.slots.set(slotNormal.id, slotNormal);

  const slotTwenties: SlotEntity = {
    id: "seed-slot-twenties",
    datetimeStart: new Date(base + 8 * day),
    area: "ikebukuro",
    capacityPerGender: 3,
    capacityTotal: 6,
    minPerGender: 2,
    maxPerGender: 4,
    status: "open",
    minAge: 20,
    maxAge: 29, // 20代限定
    requiresBadge: false,
    feeMale: 2000,
    note: "20代限定(minAge20/maxAge29)",
    createdAt: now,
    updatedAt: now,
  };
  s.slots.set(slotTwenties.id, slotTwenties);

  const slotBadge: SlotEntity = {
    id: "seed-slot-badge",
    datetimeStart: new Date(base + 9 * day),
    area: "ginza",
    capacityPerGender: 3,
    capacityTotal: 6,
    minPerGender: 2,
    maxPerGender: 4,
    status: "open",
    minAge: null,
    maxAge: null,
    requiresBadge: true, // 優良バッジ限定
    feeMale: 2000,
    note: "優良バッジ(premium)限定",
    createdAt: now,
    updatedAt: now,
  };
  s.slots.set(slotBadge.id, slotBadge);

  // --- S3 seed: 成立周辺の枠を用意（契約§6: 成立直前 + 成立済 pending_venue）。----
  // 6名分のメンバー（男3/女3）。全員 approved + profile完成 = 応募可能な状態。
  // 成立済枠のメンバー表示（displayName/gender）と、あと1名枠の充足テストに使う。
  const members: Array<{
    id: string;
    line: string;
    name: string;
    gender: Gender;
    birthYear: number;
    occupation: ProfileEntity["occupation"];
    occupationText: string; // S12 #6: 成立詳細で開示する自由入力。
    iconKey: string; // S12 #8
  }> = [
    { id: "seed-m1", line: "Us3male1", name: "S3太郎", gender: "male", birthYear: 1992, occupation: "company_employee", occupationText: "メーカー勤務（営業）", iconKey: "bear" },
    { id: "seed-m2", line: "Us3male2", name: "S3次郎", gender: "male", birthYear: 1993, occupation: "executive", occupationText: "会社経営", iconKey: "panda" },
    { id: "seed-m3", line: "Us3male3", name: "S3三郎", gender: "male", birthYear: 1991, occupation: "finance", occupationText: "金融（証券）", iconKey: "penguin" },
    { id: "seed-f1", line: "Us3female1", name: "S3花子", gender: "female", birthYear: 1995, occupation: "creative", occupationText: "デザイナー", iconKey: "leaf" },
    { id: "seed-f2", line: "Us3female2", name: "S3桃子", gender: "female", birthYear: 1996, occupation: "public_servant", occupationText: "市役所勤務", iconKey: "flower" },
    { id: "seed-f3", line: "Us3female3", name: "S3梅子", gender: "female", birthYear: 1997, occupation: "it", occupationText: "Webエンジニア", iconKey: "star" },
  ];
  for (const m of members) {
    s.users.set(m.id, {
      id: m.id,
      lineUserId: m.line,
      displayName: m.name,
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    s.profiles.set(m.id, {
      id: `seed-profile-${m.id}`,
      userId: m.id,
      gender: m.gender,
      birthdate: new Date(Date.UTC(m.birthYear, 3, 10)),
      photoUrl: null,
      iconKey: m.iconKey,
      bio: `${m.name}です。よろしくお願いします。`, // S12 #4: 成立詳細で開示。
      areaPref: ["ebisu", "ikebukuro", "ginza"],
      occupation: m.occupation,
      occupationText: m.occupationText,
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
    s.identities.set(m.id, {
      id: `seed-identity-${m.id}`,
      userId: m.id,
      docType: "drivers_license",
      status: "approved",
      blobRef: null,
      dobChecked: null,
      reviewedBy: admin.id,
      reviewedAt: now,
      reviewNote: null,
      imageDeletedAt: now,
      aiVerdict: "ok",
      aiReason: "18歳以上・顔写真あり（seed）",
      aiCheckedAt: now,
      submittedAt: now,
      updatedAt: now,
    });
  }

  // (A) 「あと1名で成立」枠: 男3 + 女2 = 5名 applied。女性が1名応募すると成立する。
  const slotAlmost: SlotEntity = {
    id: "seed-slot-almost-full",
    datetimeStart: new Date(base + 10 * day),
    area: "ebisu",
    capacityPerGender: 3,
    capacityTotal: 6,
    minPerGender: 2,
    maxPerGender: 4,
    status: "open",
    minAge: null,
    maxAge: null,
    requiresBadge: false,
    feeMale: 2000,
    note: "あと1名で成立(男3/女2)",
    createdAt: now,
    updatedAt: now,
  };
  s.slots.set(slotAlmost.id, slotAlmost);
  const almostApplicants = ["seed-m1", "seed-m2", "seed-m3", "seed-f1", "seed-f2"];
  for (const uid of almostApplicants) {
    const prof = s.profiles.get(uid)!;
    s.applications.set(`seed-app-almost-${uid}`, {
      id: `seed-app-almost-${uid}`,
      slotId: slotAlmost.id,
      userId: uid,
      gender: prof.gender,
      status: "applied",
      paymentId: null,
      appliedAt: now,
      updatedAt: now,
    });
  }

  // (B) 「成立済(pending_venue)」枠: 男3/女3 = 6名 accepted、Slot=filled、Match=pending_venue。
  //     運営の会場入力フローを seed から直接テスト可能にする（契約§6）。
  const slotMatched: SlotEntity = {
    id: "seed-slot-matched",
    datetimeStart: new Date(base + 11 * day),
    area: "ginza",
    capacityPerGender: 3,
    capacityTotal: 6,
    minPerGender: 2,
    maxPerGender: 4,
    status: "filled",
    minAge: null,
    maxAge: null,
    requiresBadge: false,
    feeMale: 2000,
    note: "成立済(pending_venue)",
    createdAt: now,
    updatedAt: now,
  };
  s.slots.set(slotMatched.id, slotMatched);
  for (const m of members) {
    s.applications.set(`seed-app-matched-${m.id}`, {
      id: `seed-app-matched-${m.id}`,
      slotId: slotMatched.id,
      userId: m.id,
      gender: m.gender,
      status: "accepted",
      paymentId: null,
      appliedAt: now,
      updatedAt: now,
    });
  }
  s.matches.set("seed-match-pending", {
    id: "seed-match-pending",
    slotId: slotMatched.id,
    status: "pending_venue",
    matchedAt: now,
    venueName: null,
    venueUrl: null,
    reservationName: null,
    meetingPlace: null,
    confirmedAt: null,
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  // 成立検知の運営内部通知（match_to_admin）も seed しておく（admin宛）。
  s.notifications.push({
    id: "seed-notif-match-admin",
    userId: admin.id,
    type: "match_to_admin",
    status: "sent",
    slotId: slotMatched.id,
    matchId: "seed-match-pending",
    payload: {
      kind: "match_to_admin",
      slotId: slotMatched.id,
      matchId: "seed-match-pending",
      area: slotMatched.area,
      datetimeStart: slotMatched.datetimeStart.toISOString(),
      message: "枠が成立しました。会場を手配してください。",
    },
    providerMessageId: null,
    error: null,
    sentAt: now,
    createdAt: now,
  });

  // --- S8 seed: 水/金/土 19:30集合 の枠を恵比寿/池袋/銀座で複数（spec 要望3）。--------
  // 「誰でもOK」中心 + 20代限定1 + 優良バッジ限定1。プレビュー(要望1)で枠一覧/詳細を
  // 見せるための初期データ。19:30 JST = 10:30 UTC。next で各曜日の最も近い未来日時を作る。
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  /** 指定曜日(0=日..6=土)・JST hh:mm の「現在より未来で最も近い」日時を返す。 */
  function nextWeekdayAtJst(weekday: number, hh: number, mm: number): Date {
    // now(UTC) を JST のカレンダー日に直し、目標曜日まで進めてから UTC に戻す。
    const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
    const result = new Date(
      Date.UTC(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth(),
        jstNow.getUTCDate(),
        hh,
        mm,
        0,
        0
      )
    );
    // result は「JSTのhh:mm」を表す壁時計。UTC実体へ変換するため offset を引く。
    let utcTarget = result.getTime() - JST_OFFSET_MS;
    const dayMs = 24 * 60 * 60 * 1000;
    // 目標曜日まで前進（同日でも時刻が過ぎていたら来週へ）。
    while (
      new Date(utcTarget + JST_OFFSET_MS).getUTCDay() !== weekday ||
      utcTarget <= now.getTime()
    ) {
      utcTarget += dayMs;
    }
    return new Date(utcTarget);
  }

  const WED = 3;
  const FRI = 5;
  const SAT = 6;
  const s8Slots: SlotEntity[] = [
    {
      id: "seed-slot-s8-wed-ebisu",
      datetimeStart: nextWeekdayAtJst(WED, 19, 30),
      area: "ebisu",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      status: "open",
      minAge: null,
      maxAge: null,
      requiresBadge: false,
      feeMale: 2000,
      note: "水 19:30 恵比寿（誰でもOK）",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-slot-s8-fri-ikebukuro",
      datetimeStart: nextWeekdayAtJst(FRI, 19, 30),
      area: "ikebukuro",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      status: "open",
      minAge: null,
      maxAge: null,
      requiresBadge: false,
      feeMale: 2000,
      note: "金 19:30 池袋（誰でもOK）",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-slot-s8-sat-ginza",
      datetimeStart: nextWeekdayAtJst(SAT, 19, 30),
      area: "ginza",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      status: "open",
      minAge: null,
      maxAge: null,
      requiresBadge: false,
      feeMale: 2000,
      note: "土 19:30 銀座（誰でもOK）",
      createdAt: now,
      updatedAt: now,
    },
    {
      // 20代限定の会（要望3）。
      id: "seed-slot-s8-fri-ebisu-20s",
      datetimeStart: nextWeekdayAtJst(FRI, 19, 30),
      area: "ebisu",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      status: "open",
      minAge: 20,
      maxAge: 29,
      requiresBadge: false,
      feeMale: 2000,
      note: "金 19:30 恵比寿（20代限定）",
      createdAt: now,
      updatedAt: now,
    },
    {
      // 優良バッジ限定の会（要望3）。
      id: "seed-slot-s8-sat-ebisu-badge",
      datetimeStart: nextWeekdayAtJst(SAT, 19, 30),
      area: "ebisu",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      status: "open",
      minAge: null,
      maxAge: null,
      requiresBadge: true,
      feeMale: 2000,
      note: "土 19:30 恵比寿（優良バッジ限定）",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const slot of s8Slots) s.slots.set(slot.id, slot);

  // プレビュー(要望1)を「参加者のすごさ」付きで見せるため、誰でもOK枠の1つ
  // (水・恵比寿)に既存 seed メンバーを数名 applied で入れておく（職種/評価が見える）。
  const previewApplicants = ["seed-m1", "seed-f1", "seed-user-male"];
  for (const uid of previewApplicants) {
    const prof = s.profiles.get(uid);
    if (!prof) continue;
    s.applications.set(`seed-app-s8wed-${uid}`, {
      id: `seed-app-s8wed-${uid}`,
      slotId: "seed-slot-s8-wed-ebisu",
      userId: uid,
      gender: prof.gender,
      status: "applied",
      paymentId: null,
      appliedAt: now,
      updatedAt: now,
    });
  }

  // --- S8 seed: 会場候補（要望2）。成立済枠(seed-slot-matched)に合コン向き店候補を
  //     複数。fitScore 降順でレコメンド表示される（運営が chosen を選んで予約）。----
  const s8VenueCandidates: VenueCandidateEntity[] = [
    {
      id: "seed-venue-cand-1",
      slotId: slotMatched.id,
      name: "個室和食 銀座はなれ",
      url: "https://example.com/ginza-hanare",
      tabelogScore: 3.62,
      googleScore: 4.3,
      fitScore: 0.92,
      area: slotMatched.area,
      status: "suggested",
      suggestedBy: "system",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-venue-cand-2",
      slotId: slotMatched.id,
      name: "イタリアン Bar Sei",
      url: "https://example.com/bar-sei",
      tabelogScore: 3.48,
      googleScore: 4.1,
      fitScore: 0.81,
      area: slotMatched.area,
      status: "suggested",
      suggestedBy: "system",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-venue-cand-3",
      slotId: slotMatched.id,
      name: "立ち飲み やまだ",
      url: null,
      tabelogScore: 3.21,
      googleScore: 3.7,
      fitScore: 0.55,
      area: slotMatched.area,
      status: "suggested",
      suggestedBy: "system",
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const v of s8VenueCandidates) s.venueCandidates.set(v.id, v);

  s.seeded = true;
}

/** テスト用: ストアをリセットして再シード。 */
export function __resetMemoryStore(): void {
  g.__mappStore = emptyStore();
  seed(g.__mappStore);
}
