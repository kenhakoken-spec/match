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
  UserEntity,
  ProfileEntity,
  IdentityEntity,
  SlotEntity,
  ApplicationEntity,
  MatchEntity,
  NotificationLogEntity,
  UpsertUserInput,
  UpsertProfileInput,
  SubmitIdentityInput,
  CreateSlotInput,
  ListSlotsFilter,
  CreateApplicationInput,
  GenderCounts,
  ApplyAtomicResult,
  CancelOwnResult,
  SetVenueInput,
  CreateNotificationInput,
  MatchEntityStatus,
  NotificationTypeValue,
} from "./types";
import type { IdentityStatus, SlotStatus, Gender } from "@/lib/types";

interface Store {
  users: Map<string, UserEntity>;
  profiles: Map<string, ProfileEntity>; // key: userId
  identities: Map<string, IdentityEntity>; // key: userId
  slots: Map<string, SlotEntity>; // key: slot id
  applications: Map<string, ApplicationEntity>; // key: application id
  badges: Map<string, Set<"premium">>; // key: userId → 保有バッジ集合(S2はseedのみ)
  matches: Map<string, MatchEntity>; // key: match id
  notifications: NotificationLogEntity[]; // 追記順（監査ログ）
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
      bio: input.bio ?? null,
      areaPref: input.areaPref,
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
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
  async incrementAttended(userId: string): Promise<ProfileEntity | null> {
    const s = store();
    const existing = s.profiles.get(userId);
    if (!existing) return null;
    existing.attendedCount += 1;
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
   * これにより男4/女4 等の過充足と二重応募を防止する(matching-logic.md §4)。
   * Prisma 実装側では SELECT ... FOR UPDATE + UNIQUE(slotId,userId) で同等を担保する。
   */
  async applyAtomic(
    input: CreateApplicationInput,
    capacityPerGender: number
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
    // 3. 定員(過充足防止)。自分の性別が cap 以上なら不可。
    const counts = countActiveByGenderSync(s, input.slotId);
    const myCount = input.gender === "male" ? counts.male : counts.female;
    if (myCount >= capacityPerGender) {
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

    // 5. 成立判定(男>=cap && 女>=cap)。成立なら枠を filled に。
    const after = countActiveByGenderSync(s, input.slotId);
    const matched = after.male >= capacityPerGender && after.female >= capacityPerGender;
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

export class MemoryRepo implements Repo {
  users = new MemoryUsersRepo();
  profiles = new MemoryProfilesRepo();
  identities = new MemoryIdentitiesRepo();
  slots = new MemorySlotsRepo();
  applications = new MemoryApplicationsRepo();
  badges = new MemoryBadgesRepo();
  matches = new MemoryMatchesRepo();
  notifications = new MemoryNotificationsRepo();
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
    bio: "よろしくお願いします",
    areaPref: ["ebisu", "ginza"],
    ratingAvg: 0,
    ratingCount: 0,
    attendedCount: 0,
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
    bio: null,
    areaPref: ["ikebukuro"],
    ratingAvg: 0,
    ratingCount: 0,
    attendedCount: 0,
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
  }> = [
    { id: "seed-m1", line: "Us3male1", name: "S3太郎", gender: "male", birthYear: 1992 },
    { id: "seed-m2", line: "Us3male2", name: "S3次郎", gender: "male", birthYear: 1993 },
    { id: "seed-m3", line: "Us3male3", name: "S3三郎", gender: "male", birthYear: 1991 },
    { id: "seed-f1", line: "Us3female1", name: "S3花子", gender: "female", birthYear: 1995 },
    { id: "seed-f2", line: "Us3female2", name: "S3桃子", gender: "female", birthYear: 1996 },
    { id: "seed-f3", line: "Us3female3", name: "S3梅子", gender: "female", birthYear: 1997 },
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
      bio: null,
      areaPref: ["ebisu", "ikebukuro", "ginza"],
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
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

  s.seeded = true;
}

/** テスト用: ストアをリセットして再シード。 */
export function __resetMemoryStore(): void {
  g.__mappStore = emptyStore();
  seed(g.__mappStore);
}
