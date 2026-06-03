// Frontend-only types for S1.
// Source of truth = docs/backend/api-contract-s1.md §1.
// Per contract §5, backend defines shared types in src/lib/types.ts; frontend
// is permitted to define its own and reconcile at integration. We keep these
// names identical to the contract so the later swap is mechanical.

export type Gender = "male" | "female";
export type Area = "ebisu" | "ikebukuro" | "ginza";
export type Role = "user" | "admin";
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
  age: number; // server-computed
  areaPref: Area[];
  bio: string | null;
  /** 【S12 #8】写真URL(後方互換・将来用)。新規はアイコン(iconKey)を使う。 */
  photoUrl: string | null;
  /** 【S12 #8】選択したプリセットアイコンの識別子（未選択は null）。 */
  iconKey: string | null;
  /** 【S12 #6】職業の自由入力（未入力は null）。enum occupation の後継。 */
  occupationText: string | null;
  ratingAvg: number;
  ratingCount: number;
}

export interface MeResponse {
  user: {
    id: string;
    role: Role;
    status: "active" | "suspended" | "withdrawn";
    displayName: string | null;
  };
  profile: ProfileDTO | null;
  identity: { status: IdentityStatus; rejectReason: string | null } | null;
  canApply: boolean;
  canApplyReason: string | null; // e.g. "identity_required" | "profile_required"
}

export interface ApiError {
  error: { code: string; message: string };
}

// --- UI display constants (frontend concern, not part of the API) ---

export const AREA_LABELS: Record<Area, string> = {
  ebisu: "恵比寿",
  ikebukuro: "池袋",
  ginza: "銀座",
};

export const AREA_ORDER: Area[] = ["ebisu", "ikebukuro", "ginza"];

export const DOC_TYPE_LABELS: Record<IdDocType, string> = {
  drivers_license: "運転免許証",
  my_number_card: "マイナンバーカード",
  passport: "パスポート",
  health_insurance: "健康保険証",
  residence_card: "在留カード",
};

// docType options shown in U-12 (顔写真付き公的書類を上位に)
export const DOC_TYPE_OPTIONS: IdDocType[] = [
  "drivers_license",
  "my_number_card",
  "passport",
];

export const GENDER_LABELS: Record<Gender, string> = {
  female: "女性",
  male: "男性",
};
