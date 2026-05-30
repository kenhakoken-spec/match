// =============================================================================
// matching-app — pure domain functions (S1 contract §3)
// 副作用なし・DB非依存。vitest で単体テスト必須(正常+境界+異常)。
// 正典: docs/backend/api-contract-s1.md §3 / docs/backend/matching-logic.md
// =============================================================================

import type { IdentityStatus } from "@/lib/types";

/**
 * 満年齢を算出する。誕生日が来ていなければ1歳引く。
 * birthdate / now は UTC基準の Date。境界(誕生日当日)はその日に加齢する。
 * 不正な Date(NaN)や birthdate > now は NaN/負値を返さず、防御的に扱う。
 */
export function calcAge(birthdate: Date, now: Date): number {
  if (
    !(birthdate instanceof Date) ||
    !(now instanceof Date) ||
    Number.isNaN(birthdate.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return NaN;
  }

  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();

  const monthDiff = now.getUTCMonth() - birthdate.getUTCMonth();
  const dayDiff = now.getUTCDate() - birthdate.getUTCDate();

  // 誕生日がまだ来ていない(月が前 / 同月で日が前)なら 1 引く。
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

/** 18歳以上かどうか(年齢確認の根幹)。birthdate 不正時は false。 */
export function isAdult(birthdate: Date, now: Date): boolean {
  const age = calcAge(birthdate, now);
  if (Number.isNaN(age)) return false;
  return age >= 18;
}

/**
 * 年齢が [minAge, maxAge] (両端含む) に入るか。null は無制限。
 * 例: 20代限定 = minAge:20, maxAge:29。
 * birthdate 不正時は false(安全側=応募不可)。
 */
export function ageInBand(
  birthdate: Date,
  minAge: number | null,
  maxAge: number | null,
  now: Date
): boolean {
  const age = calcAge(birthdate, now);
  if (Number.isNaN(age)) return false;
  if (minAge !== null && age < minAge) return false;
  if (maxAge !== null && age > maxAge) return false;
  return true;
}

/**
 * 応募可否(ゲーティング)。本人認証approved かつ プロフィール完成 で ok。
 * reason は false の理由コード。identity を優先して案内する(本人認証が先のステップ)。
 * 契約§1 MeResponse.canApply / canApplyReason の根拠。
 */
export function canApply(input: {
  identityStatus: IdentityStatus | null;
  hasCompleteProfile: boolean;
}): { ok: boolean; reason: string | null } {
  if (input.identityStatus !== "approved") {
    return { ok: false, reason: "identity_required" };
  }
  if (!input.hasCompleteProfile) {
    return { ok: false, reason: "profile_required" };
  }
  return { ok: true, reason: null };
}
