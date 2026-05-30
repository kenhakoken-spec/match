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

// =============================================================================
// S8 — 追加要望の共有型 (api-contract-s8-foundation.md §3 / 01_s8_spec.md)
//   多軸評価 / 職種 / 決済種別 / AI判定 / 会場候補 / 公開(プレビュー)DTO。
// PII方針(要望1): プレビューDTO(Public*)には 氏名/displayName/photoUrl/lineUserId/
//   正確な生年月日を **含めない**。年代バンド(ageBand)・職種・多軸評価・優良バッジのみ。
// =============================================================================

/** 職種（schema Occupation と一致）。表示・プレビュー用途のみ（マッチングには使わない）。 */
export type Occupation =
  | "company_employee"
  | "executive"
  | "public_servant"
  | "medical"
  | "it"
  | "creative"
  | "finance"
  | "student"
  | "other";

/** 決済種別（schema PaymentKind と一致）。参加費 / ドタキャン罰金。 */
export type PaymentKind = "participation" | "no_show_penalty";

/** 本人認証のAI一次判定（schema IdentityAiVerdict と一致）。 */
export type IdentityAiVerdict = "ok" | "review" | "ng";

/** 会場候補の状態（schema VenueCandidateStatus と一致）。 */
export type VenueCandidateStatus = "suggested" | "chosen" | "rejected";

/** 多軸評価の集計（domain/rating の MultiAxisAggregate と一致）。プレビュー/詳細で使う。 */
export interface MultiAxisRatings {
  again: number;
  talk: number;
  manner: number;
  overall: number;
  count: number;
}

/** 会場候補DTO（要望2: 運営が選んで予約する候補リスト）。 */
export interface VenueCandidateDTO {
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
}

// --- 公開（プレビュー）DTO（要望1: 未認証/未登録でも枠一覧＋詳細が見える） ---

/**
 * 公開 枠DTO（未認証に返す）。SlotDTO のサブセット + 公開可能な条件のみ。
 * 個人を特定しうる情報は持たない（枠の属性のみ）。
 */
export interface PublicSlotDTO {
  id: string;
  datetimeStart: string; // ISO8601
  area: Area;
  capacityPerGender: number;
  /** 現在の充足数（あと何名で成立かの表示に使う）。 */
  filled: { male: number; female: number };
  conditions: SlotConditions;
  feeMale: number;
  status: SlotStatus;
}

/**
 * 公開 メンバーDTO（未認証に返す＝参加者の「すごさ」を匿名サマリで見せる）。
 * **PII除去の要**: 氏名/displayName/photoUrl/lineUserId/正確な生年月日は含めない。
 * 年代バンド(ageBand 例 "20代後半")・職種・多軸評価・優良バッジ のみ。
 */
export interface PublicMemberDTO {
  /** 年代バンド（例 "20代前半" / "30代後半"）。正確な生年月日は出さない。 */
  ageBand: string;
  gender: Gender;
  /** 職種。未設定は null。 */
  occupation: Occupation | null;
  /** 多軸評価の集計（件数0なら各値0）。 */
  ratings: MultiAxisRatings;
  /** 優良バッジ保有か。 */
  hasPremiumBadge: boolean;
}

/** 公開 枠詳細DTO（枠 + 参加者の匿名サマリ）。応募ボタンは未登録だと登録導線へ。 */
export interface PublicSlotDetailDTO extends PublicSlotDTO {
  members: PublicMemberDTO[];
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

// S8 enums as readonly tuples（zod / runtime validation 用）。
export const OCCUPATIONS = [
  "company_employee",
  "executive",
  "public_servant",
  "medical",
  "it",
  "creative",
  "finance",
  "student",
  "other",
] as const;
export const PAYMENT_KINDS = ["participation", "no_show_penalty"] as const;
export const IDENTITY_AI_VERDICTS = ["ok", "review", "ng"] as const;
export const VENUE_CANDIDATE_STATUSES = [
  "suggested",
  "chosen",
  "rejected",
] as const;

// コンパイル時整合: 上のタプルが各 union を漏れなくカバーすることを保証する。
// (要素が型から外れると下の代入でコンパイルエラーになる。)
const _assertGenders: readonly Gender[] = GENDERS;
const _assertAreas: readonly Area[] = AREAS;
const _assertRoles: readonly Role[] = ROLES;
const _assertDocTypes: readonly IdDocType[] = ID_DOC_TYPES;
const _assertOccupations: readonly Occupation[] = OCCUPATIONS;
const _assertPaymentKinds: readonly PaymentKind[] = PAYMENT_KINDS;
const _assertAiVerdicts: readonly IdentityAiVerdict[] = IDENTITY_AI_VERDICTS;
const _assertVenueStatuses: readonly VenueCandidateStatus[] =
  VENUE_CANDIDATE_STATUSES;
void _assertGenders;
void _assertAreas;
void _assertRoles;
void _assertDocTypes;
void _assertOccupations;
void _assertPaymentKinds;
void _assertAiVerdicts;
void _assertVenueStatuses;
