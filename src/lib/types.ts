// =============================================================================
// matching-app — shared API types (S1 frozen contract §1)
// 正典: docs/backend/api-contract-s1.md §1 / docs/00_master_plan.md
//
// PII方針: APIレスポンスに lineUserId を含めない。ログにも出さない。
// 本ファイルは backend が定義する共有型。frontend は契約§1に基づき自前型でfetchしてよい。
// =============================================================================

export type Gender = "male" | "female";
export type Area = "ebisu" | "ikebukuro" | "ginza";
export type Role = "user" | "admin";
export type UserStatus = "active" | "suspended" | "withdrawn";
export type IdentityStatus = "pending" | "approved" | "rejected";
export type IdDocType =
  | "drivers_license"
  | "passport"
  | "my_number_card"
  | "health_insurance"
  | "residence_card";

export interface ProfileDTO {
  displayName: string;
  gender: Gender;
  birthdate: string; // "YYYY-MM-DD"
  age: number; // サーバ算出
  areaPref: Area[];
  bio: string | null;
  photoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
}

export interface MeUser {
  id: string;
  role: Role;
  status: UserStatus;
  displayName: string | null;
}

export interface MeIdentity {
  status: IdentityStatus;
  rejectReason: string | null;
}

export interface MeResponse {
  user: MeUser;
  profile: ProfileDTO | null;
  identity: MeIdentity | null;
  canApply: boolean; // 本人認証approved かつ profile完成 のとき true
  canApplyReason: string | null; // false の理由 ("identity_required" | "profile_required" 等)
}

// =============================================================================
// S2 — Slot / Application shared types (api-contract-s2.md §1)
// =============================================================================

export type SlotStatus = "open" | "filled" | "confirmed" | "done" | "canceled";
export type ApplicationStatus = "applied" | "accepted" | "canceled";

/** 限定イベントの参加条件(null = 制限なし)。 */
export interface SlotConditions {
  minAge: number | null;
  maxAge: number | null;
  requiresBadge: "premium" | null;
}

export interface SlotDTO {
  id: string;
  datetimeStart: string; // ISO8601
  area: Area;
  capacityPerGender: number; // 3
  filled: { male: number; female: number }; // 現在の確定/応募数
  conditions: SlotConditions;
  status: SlotStatus;
  feeMale: number; // 2000(表示用。女性/初回は別途UIで無料明示)
}

/** 応募ゲートの理由コード(domain/eligibility の EligibilityReason に一致)。 */
export type EligibilityReasonCode =
  | "identity_required"
  | "profile_required"
  | "age_out_of_range"
  | "badge_required"
  | "gender_full"
  | "already_applied"
  | "slot_closed";

export interface SlotEligibility {
  canApply: boolean;
  reasons: EligibilityReasonCode[];
}

export interface SlotDetailDTO extends SlotDTO {
  myApplication: { status: ApplicationStatus } | null;
  eligibility: SlotEligibility;
}

/** 応募一覧(U-07)の各項目。 */
export interface ApplicationListItem {
  slot: SlotDTO;
  status: ApplicationStatus;
}

// --- S2 admin slot creation request (contract §3) ---
export interface AdminCreateSlotInput {
  datetimeStart: string; // ISO8601
  area: Area;
  minAge?: number | null;
  maxAge?: number | null;
  requiresBadge?: boolean;
}

// =============================================================================
// S3 — Match / Venue shared types (api-contract-s3.md §1,§3)
// 成立(Match)はS2で枠が filled になった時点で生成され、運営の会場入力→6人通知で
// 進行する。会場情報は **notified 後のみ** ユーザーに返す（契約§3）。
// PII方針: members は displayName/gender のみ（lineUserId は絶対に出さない）。
// =============================================================================

/** 成立(Match)の進行状態。canceled はユーザー/admin DTO では扱わない（一覧は除外）。 */
export type MatchStatus = "pending_venue" | "venue_set" | "notified";

/** 会場情報（notified 後のみユーザーへ返す。venueUrl/meetingPlace は任意）。 */
export interface VenueDTO {
  venueName: string;
  venueUrl: string | null;
  reservationName: string;
  meetingPlace: string | null;
}

/** 6名メンバーの最小情報（PII最小: lineUserId 不可、誕生日/連絡先も含めない）。 */
export interface MatchMemberDTO {
  displayName: string;
  gender: Gender;
}

/** ユーザー側 成立詳細（契約§3 MatchDetailDTO）。 */
export interface MatchDetailDTO {
  id: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  /** notified 前は null（会場手配中）。 */
  venue: VenueDTO | null;
  members: MatchMemberDTO[];
}

/** ユーザー側 マイ成立一覧の各項目（/api/matches/mine）。 */
export interface MatchSummaryDTO {
  id: string;
  slotId: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  /** 会場確定済み(venue_set 以降)か。一覧では会場の中身は返さない（PII/段階制御）。 */
  venueConfirmed: boolean;
}

// --- admin 側 DTO（role=admin のみ。会場は段階に関わらず返す＝運営は手配主体） ---

/** admin 成立一覧の各項目（/api/admin/matches）。 */
export interface AdminMatchSummaryDTO {
  id: string;
  slotId: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  matchedAt: string; // ISO
  filled: { male: number; female: number };
  venue: VenueDTO | null;
}

/** admin 成立詳細（/api/admin/matches/[id]）。6名要約 + 枠情報 + 会場。 */
export interface AdminMatchDetailDTO {
  id: string;
  slotId: string;
  slot: {
    datetimeStart: string;
    area: Area;
    capacityPerGender: number;
  };
  status: MatchStatus;
  matchedAt: string; // ISO
  filled: { male: number; female: number };
  venue: VenueDTO | null;
  members: MatchMemberDTO[];
}

// --- S3 admin venue input request (contract §2) ---
export interface AdminVenueInput {
  venueName: string;
  venueUrl?: string | null;
  reservationName: string;
  meetingPlace?: string | null;
}

// --- error envelope (contract §2) ---
export interface ApiError {
  error: { code: string; message: string };
}

/** 応募不可時のエラー(契約§2: 409 { error:{ code, reasons } })。 */
export interface ApplyConflictError {
  error: { code: string; message: string; reasons: EligibilityReasonCode[] };
}

// --- admin identity queue item (contract §2 admin) ---
export interface AdminIdentityItem {
  id: string;
  userId: string;
  docType: IdDocType;
  blobRef: string | null;
  submittedAt: string; // ISO
}

// --- domain enums as readonly tuples (for zod / runtime validation) ---
// `as const` で要素のリテラル型を保持する。これにより z.enum(...) が
// string ではなく Gender/Area/Role/IdDocType の union を推論する。
export const GENDERS = ["male", "female"] as const;
export const AREAS = ["ebisu", "ikebukuro", "ginza"] as const;
export const ROLES = ["user", "admin"] as const;
export const ID_DOC_TYPES = [
  "drivers_license",
  "passport",
  "my_number_card",
  "health_insurance",
  "residence_card",
] as const;

// コンパイル時整合: 上のタプルが各 union を漏れなくカバーすることを保証する。
// (要素が型から外れると下の代入でコンパイルエラーになる。)
const _assertGenders: readonly Gender[] = GENDERS;
const _assertAreas: readonly Area[] = AREAS;
const _assertRoles: readonly Role[] = ROLES;
const _assertDocTypes: readonly IdDocType[] = ID_DOC_TYPES;
void _assertGenders;
void _assertAreas;
void _assertRoles;
void _assertDocTypes;
