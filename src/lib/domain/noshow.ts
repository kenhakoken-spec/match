// =============================================================================
// matching-app — S8 純関数: ドタキャン(no-show)確定判定。spec 要望5。
// 副作用なし・DB非依存。vitest で単体テスト必須(境界網羅)。
// 正典: docs/01_s8_spec.md 要望5 / docs/backend/api-contract-s8-foundation.md §2。
//
// ルール:
//  - イベント後の評価で、同席者が対象者を「来なかった(noShowReport=true)」と報告できる。
//  - **2人以上** が報告したら no-show 確定 → Stripe で ¥5,000 を自動課金。
//  - 誤報防止のため 1人の報告では確定しない（しきい値=2）。
//
// 設計方針:
//  - 「いくつの報告で確定か」を入力(reportCount)としきい値だけで決まる純関数に閉じ、
//    境界(1=未確定 / 2=確定)を単体テストできる形にする。
//  - 罰金額は domain/payment.ts の penaltyAmountJpy() を正本とする(ここでは判定のみ)。
// =============================================================================

/** no-show 確定のしきい値(報告人数)。誤報防止のため既定 2(=2人以上で確定)。 */
export const NO_SHOW_THRESHOLD = 2;

/**
 * 対象者(ratee)への「来なかった」報告数から no-show 確定かを判定する（純関数）。
 *
 * @param reportCount 同席者からの noShowReport=true の件数（呼び出し側が集計して渡す）。
 * @param threshold   確定に必要な報告人数（既定 2）。
 * @returns reportCount >= threshold なら true（確定）。
 *
 * 境界(契約§2のテスト観点):
 *  - 0 → false / 1 → false / 2 → true / 3+ → true。
 * 防御: reportCount が非整数/非有限/負値は安全側(false=確定しない=誤課金しない)に倒す。
 * threshold は 1 未満なら 1 に補正（0以下だと0件で確定してしまう事故を防ぐ）。
 */
export function isNoShowConfirmed(
  reportCount: number,
  threshold: number = NO_SHOW_THRESHOLD
): boolean {
  // 罰金課金に直結するため、壊れた入力では絶対に確定しない(安全側)。
  if (!Number.isFinite(reportCount) || !Number.isInteger(reportCount)) return false;
  if (reportCount < 0) return false;
  const t = Number.isFinite(threshold) && threshold >= 1 ? Math.floor(threshold) : 1;
  return reportCount >= t;
}
