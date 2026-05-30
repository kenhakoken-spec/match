// =============================================================================
// matching-app — pure domain function for S4 決済 課金判定 (payment)
// 副作用なし・DB非依存・Stripe非依存。vitest で単体テスト必須。
// 正典: docs/backend/api-contract-s4.md §0,§1 / docs/backend/payment.md §0,§4
//        / docs/00_master_plan.md §2（課金ルール）
//
// 課金ルール（master_plan §2 / 確定事項）:
//  - 女性          : 常に無料（chargeable=false, amount=0, reason=female_free）
//  - 男性・初回参加 : 無料（chargeable=false, amount=0, reason=male_first_free）
//  - 男性・2回目以降: feeMaleJpy 円課金（chargeable=true, reason=male_paid）
//  「初回」= そのユーザーの過去の成立参加(accepted/done)が 0 回（pastAcceptedCount===0）。
//
// 設計方針:
//  - 課金可否は「いつ」「どこで」ではなく入力 (gender / pastAcceptedCount / feeMaleJpy)
//    だけで決まる純関数に閉じ、境界（初回↔2回目, 男↔女）を単体テストできる形にする。
//  - 「不成立時は課金しない」は別レイヤ（route/service が成立確定後にのみ confirm/capture
//    する）で担保する。本関数は "この参加が課金対象か & いくらか" の判定のみを担う。
// =============================================================================

import type { Gender } from "@/lib/types";

/** computeFee の入力。pastAcceptedCount は「過去の成立参加回数」(初回判定に使う)。 */
export interface FeeInput {
  gender: Gender;
  /**
   * そのユーザーの過去の成立参加(accepted/done)の回数。
   * 0 のとき男性は「初回無料」。負値/非整数/非有限は防御的に「初回ではない」(安全側=課金)
   * とはせず、0 未満は 0 とみなして初回扱いにはしない（下記参照）。
   */
  pastAcceptedCount: number;
  /** 男性課金額(円)。Slot.feeMale 由来。既定2000。 */
  feeMaleJpy: number;
}

/** 課金判定の理由コード（FeeQuote.reason と一致）。 */
export type FeeReason = "female_free" | "male_first_free" | "male_paid";

/** computeFee の結果。amountJpy は実課金額（非課金は 0）。 */
export interface FeeResult {
  amountJpy: number;
  chargeable: boolean;
  reason: FeeReason;
}

/**
 * 既定の男性参加費(円)。env / Slot.feeMale が無いときのフォールバック。
 * 値の正典は Slot.feeMale（枠ごと）。ここは純関数の防御的デフォルト。
 */
export const DEFAULT_FEE_MALE_JPY = 2000;

/**
 * 「過去の成立参加が 0 回か」= 初回参加か を判定する。
 * 防御的に: 非整数/非有限/負値は「0回ではない」とは断定できないため、
 * 「初回ではない(=過去参加あり)」側に倒すと初回無料を誤って奪う事故になる。
 * 一方で過大なマイナスを初回にすると二重に無料を与えうる。
 * ここでは「pastAcceptedCount を 0 以上の整数に正規化し、それが 0 なら初回」とする:
 *   - NaN/Infinity → 0 とはせず「初回ではない」(安全側: 無料を乱発しない)。
 *   - 負値 → 0 とみなさず「初回ではない」(同上)。
 *   - 0 → 初回。1 以上 → 初回ではない。
 */
function isFirstParticipation(pastAcceptedCount: number): boolean {
  if (!Number.isFinite(pastAcceptedCount)) return false;
  if (!Number.isInteger(pastAcceptedCount)) return false;
  if (pastAcceptedCount < 0) return false;
  return pastAcceptedCount === 0;
}

/** 課金額を 0 以上の整数に正規化（不正値は既定額にフォールバック）。 */
function normalizeFee(feeMaleJpy: number): number {
  if (!Number.isFinite(feeMaleJpy) || feeMaleJpy < 0) return DEFAULT_FEE_MALE_JPY;
  return Math.floor(feeMaleJpy);
}

/**
 * 参加に対する課金額・課金可否・理由を判定する純関数。
 *
 * - 女性          → { amountJpy:0, chargeable:false, reason:"female_free" }
 * - 男性 & 初回   → { amountJpy:0, chargeable:false, reason:"male_first_free" }
 * - 男性 & 2回目+ → { amountJpy:feeMaleJpy, chargeable:true, reason:"male_paid" }
 */
export function computeFee(input: FeeInput): FeeResult {
  if (input.gender === "female") {
    return { amountJpy: 0, chargeable: false, reason: "female_free" };
  }
  // male
  if (isFirstParticipation(input.pastAcceptedCount)) {
    return { amountJpy: 0, chargeable: false, reason: "male_first_free" };
  }
  return {
    amountJpy: normalizeFee(input.feeMaleJpy),
    chargeable: true,
    reason: "male_paid",
  };
}
