// =============================================================================
// matching-app — unit tests for S4 純関数 computeFee (payment)
// 網羅（契約§1 境界）:
//  - 女性: past0 / past3 → 常に非課金 (female_free)
//  - 男性 初回(past0) → 非課金 (male_first_free)
//  - 男性 2回目(past1) / past2+ → 課金 (male_paid, amount=feeMaleJpy)
//  - feeMaleJpy 既定2000 / 枠ごとの別額
//  - 防御: 不正 pastAcceptedCount(負/小数/NaN/Infinity) / 不正 feeMaleJpy
// 正典: docs/backend/api-contract-s4.md §0,§1 / docs/backend/payment.md §0,§4
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  computeFee,
  DEFAULT_FEE_MALE_JPY,
  penaltyAmountJpy,
  NO_SHOW_PENALTY_JPY,
} from "./payment";

const FEE = 2000;

describe("computeFee — 女性は常に無料 (female_free)", () => {
  it("女性 past0 → 非課金", () => {
    expect(computeFee({ gender: "female", pastAcceptedCount: 0, feeMaleJpy: FEE })).toEqual({
      amountJpy: 0,
      chargeable: false,
      reason: "female_free",
    });
  });

  it("女性 past3（参加歴があっても）→ 非課金", () => {
    expect(computeFee({ gender: "female", pastAcceptedCount: 3, feeMaleJpy: FEE })).toEqual({
      amountJpy: 0,
      chargeable: false,
      reason: "female_free",
    });
  });

  it("女性は feeMaleJpy の値に関わらず amount=0", () => {
    expect(
      computeFee({ gender: "female", pastAcceptedCount: 9, feeMaleJpy: 99999 }).amountJpy
    ).toBe(0);
  });
});

describe("computeFee — 男性 初回は無料 (male_first_free)", () => {
  it("男性 past0（初回）→ 非課金", () => {
    expect(computeFee({ gender: "male", pastAcceptedCount: 0, feeMaleJpy: FEE })).toEqual({
      amountJpy: 0,
      chargeable: false,
      reason: "male_first_free",
    });
  });

  it("初回は feeMaleJpy が高額でも amount=0 / chargeable=false", () => {
    const r = computeFee({ gender: "male", pastAcceptedCount: 0, feeMaleJpy: 5000 });
    expect(r.amountJpy).toBe(0);
    expect(r.chargeable).toBe(false);
  });
});

describe("computeFee — 男性 2回目以降は課金 (male_paid)", () => {
  it("男性 past1（2回目）→ ¥2000 課金", () => {
    expect(computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: FEE })).toEqual({
      amountJpy: 2000,
      chargeable: true,
      reason: "male_paid",
    });
  });

  it("男性 past2（3回目）→ 課金継続", () => {
    expect(computeFee({ gender: "male", pastAcceptedCount: 2, feeMaleJpy: FEE })).toEqual({
      amountJpy: 2000,
      chargeable: true,
      reason: "male_paid",
    });
  });

  it("男性 past10 → 課金継続", () => {
    const r = computeFee({ gender: "male", pastAcceptedCount: 10, feeMaleJpy: FEE });
    expect(r.chargeable).toBe(true);
    expect(r.reason).toBe("male_paid");
  });

  it("枠ごとの別額(feeMaleJpy=3500)を反映する", () => {
    expect(
      computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: 3500 }).amountJpy
    ).toBe(3500);
  });

  it("境界: past0→無料, past1→課金 が初回判定の分かれ目", () => {
    expect(computeFee({ gender: "male", pastAcceptedCount: 0, feeMaleJpy: FEE }).chargeable).toBe(
      false
    );
    expect(computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: FEE }).chargeable).toBe(
      true
    );
  });
});

describe("computeFee — 防御的入力（不正値）", () => {
  it("男性課金時 feeMaleJpy=0/負/NaN は既定額(2000)にフォールバック", () => {
    expect(
      computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: -100 }).amountJpy
    ).toBe(DEFAULT_FEE_MALE_JPY);
    expect(
      computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: Number.NaN }).amountJpy
    ).toBe(DEFAULT_FEE_MALE_JPY);
  });

  it("feeMaleJpy が小数 → 切り捨て整数化", () => {
    expect(
      computeFee({ gender: "male", pastAcceptedCount: 1, feeMaleJpy: 2000.9 }).amountJpy
    ).toBe(2000);
  });

  it("男性 pastAcceptedCount が小数/NaN/Infinity/負 → 初回扱いにせず課金（無料乱発を防ぐ）", () => {
    // 初回(=無料)を安全側で乱発しない: 不正値は「過去参加あり」とみなし課金。
    expect(
      computeFee({ gender: "male", pastAcceptedCount: 0.5, feeMaleJpy: FEE }).reason
    ).toBe("male_paid");
    expect(
      computeFee({ gender: "male", pastAcceptedCount: Number.NaN, feeMaleJpy: FEE }).reason
    ).toBe("male_paid");
    expect(
      computeFee({
        gender: "male",
        pastAcceptedCount: Number.POSITIVE_INFINITY,
        feeMaleJpy: FEE,
      }).reason
    ).toBe("male_paid");
    expect(
      computeFee({ gender: "male", pastAcceptedCount: -1, feeMaleJpy: FEE }).reason
    ).toBe("male_paid");
  });
});

describe("penaltyAmountJpy — ドタキャン罰金（S8 spec 要望5）", () => {
  it("定数 NO_SHOW_PENALTY_JPY は ¥5,000", () => {
    expect(NO_SHOW_PENALTY_JPY).toBe(5000);
  });

  it("penaltyAmountJpy() は 5000 を返す", () => {
    expect(penaltyAmountJpy()).toBe(5000);
  });

  it("参加費(computeFee)とは独立＝性別/参加歴に依らず一律", () => {
    // 参加費の既定(2000)とは別額であることを確認（混同防止）。
    expect(penaltyAmountJpy()).not.toBe(DEFAULT_FEE_MALE_JPY);
    expect(penaltyAmountJpy()).toBe(5000);
  });
});
