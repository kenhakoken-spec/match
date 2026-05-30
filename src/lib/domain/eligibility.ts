// =============================================================================
// matching-app — pure domain functions for S2 応募ゲート (eligibility)
// 副作用なし・DB非依存。vitest で単体テスト必須(各 reason / 境界年齢 19/20/29/30)。
// 正典: docs/backend/api-contract-s2.md §4 / docs/backend/matching-logic.md §2,§6
//
// 設計方針:
//  - 応募の可否は **サーバ側で必ずこの関数で再判定** する(クライアントの
//    canApply を信用しない: api-contract-s2.md §4)。
//  - reasons は **理由の配列**(契約§1 SlotDetailDTO.eligibility.reasons)。
//    複数の不足が同時にあり得るため、満たさない条件を **すべて** 列挙する。
//    これにより詳細画面で「本人認証 + 年齢」等の複合不足を案内できる。
//  - 応募エンドポイントは「最優先の1理由」を返したい場合があるため、
//    primaryReason() で優先順位つき先頭理由も取得できるようにする。
// =============================================================================

import type { Gender } from "@/lib/types";

/** eligibility が返す理由コード(契約§1 の reasons 文字列に一致)。 */
export type EligibilityReason =
  | "identity_required" // 本人認証が approved でない
  | "profile_required" // プロフィール未完成(gender/age が確定しない)
  | "slot_closed" // 枠が open でない(filled/confirmed/done/canceled)
  | "age_out_of_range" // 限定イベントの年齢条件を外れる
  | "badge_required" // 限定イベントの優良バッジ(premium)が無い
  | "gender_full" // 自分の性別の定員が埋まっている
  | "already_applied"; // 既に応募済み(applied/accepted)

/** 応募者側の状態(セッション + プロフィール + 認証 + バッジ から組み立てる)。 */
export interface EligibilityActor {
  /** 本人認証の状態。未提出は null。 */
  identityStatus: "pending" | "approved" | "rejected" | null;
  /** プロフィールが完成しているか(gender/birthdate/areaPref が揃う)。 */
  hasCompleteProfile: boolean;
  /** 応募者の性別(プロフィール未完成なら判定不能 = null)。 */
  gender: Gender | null;
  /** 応募者の満年齢(プロフィール未完成なら判定不能 = null)。 */
  age: number | null;
  /** 優良バッジ(premium)を保有しているか。 */
  hasBadgePremium: boolean;
}

/** 枠側の条件・状態(SlotEntity から組み立てる)。 */
export interface EligibilitySlot {
  /** 参加可能な最低年齢(含む)。null = 制限なし。例: 20代限定 = 20。 */
  minAge: number | null;
  /** 参加可能な最高年齢(含む)。null = 制限なし。例: 20代限定 = 29。 */
  maxAge: number | null;
  /** true の場合、優良バッジ(premium)保有者のみ応募可。 */
  requiresBadge: boolean;
  /** 枠の状態。応募可能なのは "open" のみ。 */
  status: "open" | "filled" | "confirmed" | "done" | "canceled";
  /** 現在の性別ごとの確定/応募数。 */
  filled: { male: number; female: number };
  /** 性別ごとの定員(MVP=3)。 */
  capacityPerGender: number;
}

export interface EligibilityInput {
  actor: EligibilityActor;
  slot: EligibilitySlot;
  /** 既に同枠へ応募済み(applied/accepted)か。 */
  alreadyApplied: boolean;
}

export interface EligibilityResult {
  canApply: boolean;
  reasons: EligibilityReason[];
}

/**
 * その性別の定員が埋まっているか(過充足防止の純関数)。
 * filled[gender] >= capacity のとき true(=これ以上応募できない)。
 * 防御的に: capacity <= 0 や負の filled は満員扱い(安全側)。
 */
export function genderFull(
  filled: { male: number; female: number },
  capacityPerGender: number,
  gender: Gender
): boolean {
  if (!Number.isFinite(capacityPerGender) || capacityPerGender <= 0) return true;
  const count = gender === "male" ? filled.male : filled.female;
  if (!Number.isFinite(count)) return true;
  return count >= capacityPerGender;
}

/**
 * 応募可否を判定し、満たさない理由を **すべて** 列挙する純関数。
 *
 * 評価順(reasons への push 順):
 *   1. identity_required  本人認証 approved でない
 *   2. profile_required   プロフィール未完成(gender/age 不明)
 *   3. slot_closed        枠が open でない
 *   4. already_applied    既に応募済み
 *   5. age_out_of_range   年齢条件外(プロフィール完成時のみ判定可)
 *   6. badge_required     バッジ条件未充足
 *   7. gender_full        自分の性別が満員(プロフィール完成時のみ判定可)
 *
 * canApply は reasons が空のときだけ true。
 * gender/age が不明(profile_required)のときは年齢/定員の真偽を確定できないため、
 * それらの理由は **追加しない**(profile_required の解消後に再評価される)。
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { actor, slot, alreadyApplied } = input;
  const reasons: EligibilityReason[] = [];

  // 1. 本人認証
  if (actor.identityStatus !== "approved") {
    reasons.push("identity_required");
  }

  // 2. プロフィール完成(gender/age が確定しているか)
  const profileComplete =
    actor.hasCompleteProfile &&
    actor.gender !== null &&
    actor.age !== null &&
    Number.isFinite(actor.age);
  if (!profileComplete) {
    reasons.push("profile_required");
  }

  // 3. 枠が open か
  if (slot.status !== "open") {
    reasons.push("slot_closed");
  }

  // 4. 二重応募
  if (alreadyApplied) {
    reasons.push("already_applied");
  }

  // 5. 年齢条件(プロフィール完成時のみ判定可)
  if (profileComplete) {
    const age = actor.age as number;
    const tooYoung = slot.minAge !== null && age < slot.minAge;
    const tooOld = slot.maxAge !== null && age > slot.maxAge;
    if (tooYoung || tooOld) {
      reasons.push("age_out_of_range");
    }
  }

  // 6. バッジ条件
  if (slot.requiresBadge && !actor.hasBadgePremium) {
    reasons.push("badge_required");
  }

  // 7. 定員(プロフィール完成 = gender 確定時のみ判定可)
  if (profileComplete) {
    const gender = actor.gender as Gender;
    if (genderFull(slot.filled, slot.capacityPerGender, gender)) {
      reasons.push("gender_full");
    }
  }

  return { canApply: reasons.length === 0, reasons };
}

/**
 * 応募エンドポイントで「最優先の1理由」を返したいとき用。
 * matching-logic.md §6 の案内順に合わせ、最初に当たる理由を返す。
 * reasons が空(=応募可)なら null。
 */
const REASON_PRIORITY: EligibilityReason[] = [
  "identity_required",
  "profile_required",
  "slot_closed",
  "already_applied",
  "age_out_of_range",
  "badge_required",
  "gender_full",
];

export function primaryReason(
  reasons: EligibilityReason[]
): EligibilityReason | null {
  for (const r of REASON_PRIORITY) {
    if (reasons.includes(r)) return r;
  }
  return null;
}
