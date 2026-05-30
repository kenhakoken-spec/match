// =============================================================================
// matching-app — Repository abstraction: entity shapes + interface (S1)
// 契約§0: MOCK_DB=1(既定) で in-memory 実装、本番は Prisma 実装に切替える。
// S1の全機能は in-memory で E2E まで通ること。
//
// ここで扱う entity は Prisma モデルの S1 サブセット(User/Profile/Identity)。
// Slot/Application/Payment 等は S2 以降。
// =============================================================================

import type {
  Role,
  UserStatus,
  Gender,
  Area,
  IdentityStatus,
  IdDocType,
  SlotStatus,
  ApplicationStatus,
  Occupation,
  IdentityAiVerdict,
  VenueCandidateStatus,
} from "@/lib/types";

/** 成立(Match)の状態。schema.prisma の MatchStatus と一致。 */
export type MatchEntityStatus = "pending_venue" | "venue_set" | "notified" | "canceled";

/** 通知ログの種別/状態。schema.prisma の NotificationType / NotificationStatus と一致。 */
export type NotificationTypeValue =
  | "identity_approved"
  | "identity_rejected"
  | "match_to_admin"
  | "payment_request"
  | "venue_to_member"
  | "slot_canceled"
  | "rating_request"
  | "badge_granted"
  | "reminder";

export type NotificationStatusValue = "pending" | "sent" | "failed";

export interface UserEntity {
  id: string;
  lineUserId: string; // PII: レスポンス/ログに出さない。DB内部でのみ保持。
  displayName: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileEntity {
  id: string;
  userId: string;
  gender: Gender;
  birthdate: Date;
  photoUrl: string | null;
  bio: string | null;
  areaPref: Area[];
  /** S8: 職種（表示・プレビュー用。未設定は null）。 */
  occupation: Occupation | null;
  /** 総合平均(=多軸 overall)。後方互換のためフィールド名は ratingAvg のまま。 */
  ratingAvg: number;
  ratingCount: number;
  attendedCount: number;
  /** S8: 多軸評価の軸別平均。 */
  scoreAgainAvg: number;
  scoreTalkAvg: number;
  scoreMannerAvg: number;
  /** S8: 確定した no-show 回数。 */
  noShowCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityEntity {
  id: string;
  userId: string;
  docType: IdDocType;
  status: IdentityStatus;
  blobRef: string | null;
  dobChecked: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  imageDeletedAt: Date | null;
  /** S8: AI一次判定（Haiku）。未判定は null。 */
  aiVerdict: IdentityAiVerdict | null;
  aiReason: string | null;
  aiCheckedAt: Date | null;
  submittedAt: Date;
  updatedAt: Date;
}

// --- S2 entities (Slot / Application). schema.prisma の S2 サブセットに対応。 ---

export interface SlotEntity {
  id: string;
  datetimeStart: Date;
  area: Area;
  capacityPerGender: number;
  status: SlotStatus;
  minAge: number | null;
  maxAge: number | null;
  requiresBadge: boolean;
  feeMale: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationEntity {
  id: string;
  slotId: string;
  userId: string;
  /** 応募時点の性別スナップショット。定員(男3/女3)判定はこの値を数える。 */
  gender: Gender;
  status: ApplicationStatus;
  paymentId: string | null;
  appliedAt: Date;
  updatedAt: Date;
}

// --- S3 entities (Match / NotificationLog). schema.prisma の S3 サブセットに対応。 ---

/** 成立(Match)。Slot:Match = 1:1。会場は成立後に運営が入力。 */
export interface MatchEntity {
  id: string;
  slotId: string;
  status: MatchEntityStatus;
  matchedAt: Date;
  // 会場情報（運営が手動入力。確定時に venueName/reservationName を必須化＝アプリ層）。
  venueName: string | null;
  venueUrl: string | null;
  reservationName: string | null;
  meetingPlace: string | null;
  confirmedAt: Date | null;
  notifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 通知ログ(NotificationLog)。LINE 送信の監査・再送判断。
 * payload は送信スナップショット。過剰なPIIを残さない（運用情報に留める）。
 * 宛先は userId（アプリ内ID）で表現。lineUserId は入れない。
 */
export interface NotificationLogEntity {
  id: string;
  userId: string;
  type: NotificationTypeValue;
  status: NotificationStatusValue;
  slotId: string | null;
  matchId: string | null;
  payload: Record<string, unknown>;
  providerMessageId: string | null;
  error: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

// --- S8 entity (VenueCandidate). schema.prisma の VenueCandidate に対応。 ---

/** 会場候補（成立枠に対する合コン向き店候補。運営が選んで予約）。 */
export interface VenueCandidateEntity {
  id: string;
  slotId: string;
  name: string;
  url: string | null;
  tabelogScore: number | null;
  googleScore: number | null;
  /** 合コン向き度（ソートの主キー）。 */
  fitScore: number | null;
  area: Area;
  status: VenueCandidateStatus;
  /** 追加主体（admin userId / "system"=AI）。監査用。 */
  suggestedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- input shapes ---
export interface UpsertUserInput {
  lineUserId: string;
  displayName?: string | null;
  role?: Role;
}

export interface UpsertProfileInput {
  userId: string;
  gender: Gender;
  birthdate: Date;
  areaPref: Area[];
  bio?: string | null;
  /** S8: 職種（任意）。未指定は既存値維持 / 新規は null。 */
  occupation?: Occupation | null;
}

export interface SubmitIdentityInput {
  userId: string;
  docType: IdDocType;
  blobRef: string;
}

// --- S2 input shapes ---

export interface CreateSlotInput {
  datetimeStart: Date;
  area: Area;
  minAge?: number | null;
  maxAge?: number | null;
  requiresBadge?: boolean;
  capacityPerGender?: number;
  feeMale?: number;
  note?: string | null;
}

export interface ListSlotsFilter {
  /** 既定は ["open"]。admin 一覧は status 指定なしで全件。 */
  statuses?: SlotStatus[];
  area?: Area;
  /** datetimeStart >= from (含む)。 */
  from?: Date;
  /** datetimeStart <= to (含む)。 */
  to?: Date;
}

/** 応募作成の入力(gender は呼び出し側がプロフィールから解決して渡す)。 */
export interface CreateApplicationInput {
  slotId: string;
  userId: string;
  gender: Gender;
  paymentId?: string | null;
}

/** 性別ごとの有効応募数(applied + accepted)。成立/定員判定に使う。 */
export interface GenderCounts {
  male: number;
  female: number;
}

// --- S3 input shapes ---

/** 会場入力（venueName/reservationName 必須はアプリ層 zod で担保）。 */
export interface SetVenueInput {
  venueName: string;
  venueUrl?: string | null;
  reservationName: string;
  meetingPlace?: string | null;
}

/** 通知ログ作成の入力（payload は運用情報のみ・PII最小）。 */
export interface CreateNotificationInput {
  userId: string;
  type: NotificationTypeValue;
  status?: NotificationStatusValue;
  slotId?: string | null;
  matchId?: string | null;
  payload: Record<string, unknown>;
  providerMessageId?: string | null;
  error?: string | null;
}

export interface UsersRepo {
  findById(id: string): Promise<UserEntity | null>;
  findByLineUserId(lineUserId: string): Promise<UserEntity | null>;
  /** lineUserId をキーに upsert。初回は role=user/status=active。 */
  upsertByLineUserId(input: UpsertUserInput): Promise<UserEntity>;
}

export interface ProfilesRepo {
  findByUserId(userId: string): Promise<ProfileEntity | null>;
  upsertByUserId(input: UpsertProfileInput): Promise<ProfileEntity>;
  setPhotoUrl(userId: string, photoUrl: string): Promise<ProfileEntity | null>;
  /** 受領評価の集計を Profile に反映（S5評価確定時）。存在しなければ null。 */
  setRatingSummary(
    userId: string,
    summary: { avg: number; count: number }
  ): Promise<ProfileEntity | null>;
  /**
   * S8: 多軸評価の集計を Profile に反映（3軸APIの評価確定時）。
   * overall を ratingAvg に、軸別平均を scoreAgainAvg/scoreTalkAvg/scoreMannerAvg に書く。
   * 既存 setRatingSummary（単一スコア）と併存（後方互換）。存在しなければ null。
   */
  setMultiAxisSummary(
    userId: string,
    summary: {
      again: number;
      talk: number;
      manner: number;
      overall: number;
      count: number;
    }
  ): Promise<ProfileEntity | null>;
  /** 開催完了(done)参加の累計 attendedCount を +1（バッジ判定の入力）。存在しなければ null。 */
  incrementAttended(userId: string): Promise<ProfileEntity | null>;
  /** S8: no-show 確定時に noShowCount を +1。存在しなければ null。 */
  incrementNoShow(userId: string): Promise<ProfileEntity | null>;
}

export interface IdentitiesRepo {
  findByUserId(userId: string): Promise<IdentityEntity | null>;
  findById(id: string): Promise<IdentityEntity | null>;
  /** 申請(pending化)。却下後の再申請も同じ行を上書き。 */
  submit(input: SubmitIdentityInput): Promise<IdentityEntity>;
  /** 審査キュー(status指定。既定 pending)。 */
  listByStatus(status: IdentityStatus): Promise<IdentityEntity[]>;
  /** 承認: status=approved + reviewedBy/At + **画像削除(blobRef=null, imageDeletedAt=now)**。 */
  approve(id: string, reviewerId: string): Promise<IdentityEntity | null>;
  /** 却下: status=rejected + reviewNote(理由)。 */
  reject(id: string, reviewerId: string, reason: string): Promise<IdentityEntity | null>;
  /**
   * S8: AI一次判定(Haiku)の結果を記録する（spec 要望2）。
   * verdict/reason と aiCheckedAt=now を書き込む。status は変更しない
   * （明白OKの自動承認は呼び出し側 service が approve を別途呼ぶ＝判定と承認を分離）。
   * 存在しなければ null。
   */
  setAiVerdict(
    id: string,
    verdict: IdentityAiVerdict,
    reason: string
  ): Promise<IdentityEntity | null>;
}

export interface SlotsRepo {
  findById(id: string): Promise<SlotEntity | null>;
  /** フィルタつき一覧。datetimeStart 昇順。 */
  list(filter?: ListSlotsFilter): Promise<SlotEntity[]>;
  create(input: CreateSlotInput): Promise<SlotEntity>;
  /** 枠状態を更新(成立で filled、中止で canceled 等)。 */
  setStatus(id: string, status: SlotStatus): Promise<SlotEntity | null>;
}

export interface ApplicationsRepo {
  findById(id: string): Promise<ApplicationEntity | null>;
  /** 同一(slotId,userId)の応募(状態不問)。二重応募・取消後の再応募判定に使う。 */
  findBySlotAndUser(
    slotId: string,
    userId: string
  ): Promise<ApplicationEntity | null>;
  /** この枠の有効応募(applied/accepted)の性別カウント。 */
  countActiveByGender(slotId: string): Promise<GenderCounts>;
  /**
   * 応募を **原子的に** 作成する(定員・二重応募・枠状態をTX相当で再検証)。
   * - 枠が open でない → "slot_closed"
   * - 既に有効応募がある(applied/accepted) → "already_applied"
   * - その性別が定員以上 → "gender_full"
   * いずれも例外を投げず、エラーコードを result.error に返す(呼び出し側で 409 に変換)。
   * 成功時は result.application を返す。in-memory では単スレッドの同期区間で原子性を担保し、
   * Prisma 実装では $transaction + SELECT ... FOR UPDATE で直列化する。
   */
  applyAtomic(
    input: CreateApplicationInput,
    capacityPerGender: number
  ): Promise<ApplyAtomicResult>;
  /**
   * 自分の応募を取消(open かつ自分の applied のみ)。IDOR防止のため userId 必須で
   * 所有者一致を内部で確認する。締切後(枠が open でない)や他人の応募は取消不可。
   */
  cancelOwn(
    applicationId: string,
    userId: string
  ): Promise<CancelOwnResult>;
  /** 自分の応募一覧(U-07用)。appliedAt 降順。 */
  listByUser(userId: string): Promise<ApplicationEntity[]>;
  /** この枠の有効応募(applied/accepted)。成立メンバーの確定/一覧に使う。appliedAt 昇順。 */
  listActiveBySlot(slotId: string): Promise<ApplicationEntity[]>;
  /**
   * この枠の有効応募(applied)を **すべて accepted に確定** する（成立時）。
   * 既に accepted のものは据え置き。確定後の有効応募配列を返す。
   */
  acceptAllActiveBySlot(slotId: string): Promise<ApplicationEntity[]>;
}

/** applyAtomic の結果。エラーは re-validate で弾いた理由コード。 */
export interface ApplyAtomicResult {
  application: ApplicationEntity | null;
  error: "slot_closed" | "already_applied" | "gender_full" | "slot_not_found" | null;
  /** 応募が成立条件(男>=cap && 女>=cap)を満たしたか(成立判定の入力)。 */
  matched: boolean;
  counts: GenderCounts;
}

/** cancelOwn の結果。 */
export interface CancelOwnResult {
  application: ApplicationEntity | null;
  error: "not_found" | "forbidden" | "not_cancelable" | null;
}

export interface BadgesRepo {
  /** ユーザーが優良バッジ(premium)を保有しているか。限定枠の応募可否に使う。 */
  hasPremium(userId: string): Promise<boolean>;
}

export interface MatchesRepo {
  findById(id: string): Promise<MatchEntity | null>;
  findBySlotId(slotId: string): Promise<MatchEntity | null>;
  /**
   * 成立一覧。既定は pending_venue / venue_set / notified（canceled 除外）。
   * matchedAt 降順（新しい成立から運営が処理する）。
   */
  list(statuses?: MatchEntityStatus[]): Promise<MatchEntity[]>;
  /**
   * 成立を冪等に作成する（slotId が一意）。既に Match があれば既存を返す（再作成しない）。
   * status=pending_venue / matchedAt=now で作る。
   */
  createForSlot(slotId: string): Promise<MatchEntity>;
  /** 会場入力 → status=venue_set, confirmedAt=now。 */
  setVenue(id: string, input: SetVenueInput): Promise<MatchEntity | null>;
  /** 通知完了 → status=notified, notifiedAt=now。 */
  markNotified(id: string): Promise<MatchEntity | null>;
}

export interface NotificationsRepo {
  /** 通知ログを1件作成する。 */
  create(input: CreateNotificationInput): Promise<NotificationLogEntity>;
  /** match に紐づく通知（type 指定可）。監査/再送/テスト検証に使う。 */
  listByMatch(
    matchId: string,
    type?: NotificationTypeValue
  ): Promise<NotificationLogEntity[]>;
}

/** S8: 会場候補の作成入力（AI/運営が候補を追加）。spec 要望2。 */
export interface CreateVenueCandidateInput {
  slotId: string;
  name: string;
  url?: string | null;
  tabelogScore?: number | null;
  googleScore?: number | null;
  fitScore?: number | null;
  area: Area;
  suggestedBy?: string | null;
}

/** S8: 会場候補リポジトリ（spec 要望2: 成立枠に対する店候補レコメンド）。 */
export interface VenueCandidatesRepo {
  /** 枠の候補一覧。fitScore 降順（合コン向き度が高い順）→ 同点は createdAt 昇順。 */
  listBySlot(slotId: string): Promise<VenueCandidateEntity[]>;
  findById(id: string): Promise<VenueCandidateEntity | null>;
  create(input: CreateVenueCandidateInput): Promise<VenueCandidateEntity>;
  /** 候補の状態更新（chosen で運営が予約確定 / rejected で除外）。 */
  setStatus(
    id: string,
    status: VenueCandidateStatus
  ): Promise<VenueCandidateEntity | null>;
}

export interface Repo {
  users: UsersRepo;
  profiles: ProfilesRepo;
  identities: IdentitiesRepo;
  slots: SlotsRepo;
  applications: ApplicationsRepo;
  badges: BadgesRepo;
  matches: MatchesRepo;
  notifications: NotificationsRepo;
  /** S8: 会場候補。 */
  venueCandidates: VenueCandidatesRepo;
}

/** 応募(Application)に紐づくユーザーの最小情報（メンバー要約用・PII最小）。 */
export interface MatchMemberRow {
  userId: string;
  displayName: string | null;
  gender: Gender;
}
