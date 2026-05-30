// =============================================================================
// S6 純関数テスト — qualifiesForPremium / badgeCriteriaSnapshot / premiumRemaining
// 正典: docs/backend/api-contract-s6.md §1 / docs/backend/badge.md §5
// 境界網羅: avg 3.9/4.0/4.1, count 4/5, attended 1/2, 全充足/1つ欠ける, 冪等観点。
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  qualifiesForPremium,
  badgeCriteriaSnapshot,
  premiumRemaining,
  PREMIUM_CRITERIA,
  type BadgeInput,
} from "./badge";

/** 全条件をギリギリ満たす基準点(avg=4.0, count=5, attended=2)。 */
const PASS: BadgeInput = { ratingAvg: 4.0, ratingCount: 5, attendedCount: 2 };

describe("PREMIUM_CRITERIA (固定基準)", () => {
  it("MVP初期値が契約通り(avg>=4.0, count>=5, attended>=2)", () => {
    expect(PREMIUM_CRITERIA.minRatingAvg).toBe(4.0);
    expect(PREMIUM_CRITERIA.minRatingCount).toBe(5);
    expect(PREMIUM_CRITERIA.minAttended).toBe(2);
  });
});

describe("qualifiesForPremium — 全条件充足", () => {
  it("avg4.0 count5 attended2 → true(全境界ちょうど)", () => {
    expect(qualifiesForPremium(PASS)).toBe(true);
  });

  it("十分に上回る値 → true", () => {
    expect(
      qualifiesForPremium({ ratingAvg: 5.0, ratingCount: 20, attendedCount: 10 })
    ).toBe(true);
  });
});

describe("qualifiesForPremium — ratingAvg 境界 (3.9 / 4.0 / 4.1)", () => {
  it("avg 3.9 (<4.0) → false", () => {
    expect(qualifiesForPremium({ ...PASS, ratingAvg: 3.9 })).toBe(false);
  });

  it("avg 4.0 (==4.0, 境界含む) → true", () => {
    expect(qualifiesForPremium({ ...PASS, ratingAvg: 4.0 })).toBe(true);
  });

  it("avg 4.1 (>4.0) → true", () => {
    expect(qualifiesForPremium({ ...PASS, ratingAvg: 4.1 })).toBe(true);
  });
});

describe("qualifiesForPremium — ratingCount 境界 (4 / 5)", () => {
  it("count 4 (<5) → false", () => {
    expect(qualifiesForPremium({ ...PASS, ratingCount: 4 })).toBe(false);
  });

  it("count 5 (==5, 境界含む) → true", () => {
    expect(qualifiesForPremium({ ...PASS, ratingCount: 5 })).toBe(true);
  });

  it("count 6 (>5) → true", () => {
    expect(qualifiesForPremium({ ...PASS, ratingCount: 6 })).toBe(true);
  });
});

describe("qualifiesForPremium — attendedCount 境界 (1 / 2)", () => {
  it("attended 1 (<2) → false", () => {
    expect(qualifiesForPremium({ ...PASS, attendedCount: 1 })).toBe(false);
  });

  it("attended 2 (==2, 境界含む) → true", () => {
    expect(qualifiesForPremium({ ...PASS, attendedCount: 2 })).toBe(true);
  });

  it("attended 3 (>2) → true", () => {
    expect(qualifiesForPremium({ ...PASS, attendedCount: 3 })).toBe(true);
  });
});

describe("qualifiesForPremium — 1つだけ欠ける(AND条件の検証)", () => {
  it("avg だけ不足 → false", () => {
    expect(
      qualifiesForPremium({ ratingAvg: 3.99, ratingCount: 5, attendedCount: 2 })
    ).toBe(false);
  });

  it("count だけ不足 → false", () => {
    expect(
      qualifiesForPremium({ ratingAvg: 4.0, ratingCount: 4, attendedCount: 2 })
    ).toBe(false);
  });

  it("attended だけ不足 → false", () => {
    expect(
      qualifiesForPremium({ ratingAvg: 4.0, ratingCount: 5, attendedCount: 1 })
    ).toBe(false);
  });

  it("全て不足 → false", () => {
    expect(
      qualifiesForPremium({ ratingAvg: 0, ratingCount: 0, attendedCount: 0 })
    ).toBe(false);
  });
});

describe("qualifiesForPremium — 不正値は安全側(false)", () => {
  it("NaN の avg → false", () => {
    expect(qualifiesForPremium({ ...PASS, ratingAvg: NaN })).toBe(false);
  });

  it("Infinity の count → false（壊れ値は安全側に倒す）", () => {
    // safeNumber は Number.isFinite で判定するため Infinity も非有限として弾く。
    // DB由来の壊れた数値(Infinity)で誤って付与しないことを保証する(安全側)。
    expect(qualifiesForPremium({ ...PASS, ratingCount: Infinity })).toBe(false);
  });

  it("-Infinity の attended → false", () => {
    expect(
      qualifiesForPremium({ ...PASS, attendedCount: -Infinity })
    ).toBe(false);
  });
});

describe("badgeCriteriaSnapshot — 付与根拠の固定", () => {
  it("入力値 + 適用基準を記録する", () => {
    const snap = badgeCriteriaSnapshot({
      ratingAvg: 4.33,
      ratingCount: 7,
      attendedCount: 3,
    });
    expect(snap).toEqual({
      ratingAvg: 4.33,
      ratingCount: 7,
      attendedCount: 3,
      minRatingAvg: 4.0,
      minRatingCount: 5,
      minAttended: 2,
    });
  });

  it("入力値はそのまま(監査目的・正規化しない)", () => {
    const snap = badgeCriteriaSnapshot({
      ratingAvg: 3.9,
      ratingCount: 4,
      attendedCount: 1,
    });
    expect(snap.ratingAvg).toBe(3.9);
    expect(snap.ratingCount).toBe(4);
    expect(snap.attendedCount).toBe(1);
  });

  it("返却値は全て number(Record<string, number>)", () => {
    const snap = badgeCriteriaSnapshot(PASS);
    for (const v of Object.values(snap)) {
      expect(typeof v).toBe("number");
    }
  });
});

describe("premiumRemaining — 進捗表示の不足分", () => {
  it("全条件満たす → 全て0", () => {
    expect(premiumRemaining(PASS)).toEqual({
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
    });
  });

  it("新規ユーザー(0/0/0) → 満額不足", () => {
    expect(
      premiumRemaining({ ratingAvg: 0, ratingCount: 0, attendedCount: 0 })
    ).toEqual({ ratingAvg: 4.0, ratingCount: 5, attendedCount: 2 });
  });

  it("一部不足(avg3.9 count4 attended1)→ 不足分のみ正・浮動小数誤差なし", () => {
    const r = premiumRemaining({
      ratingAvg: 3.9,
      ratingCount: 4,
      attendedCount: 1,
    });
    expect(r.ratingAvg).toBe(0.1); // 4.0 - 3.9, 誤差丸め済み
    expect(r.ratingCount).toBe(1);
    expect(r.attendedCount).toBe(1);
  });

  it("超過していても負にならない(0 でクランプ)", () => {
    expect(
      premiumRemaining({ ratingAvg: 5.0, ratingCount: 99, attendedCount: 99 })
    ).toEqual({ ratingAvg: 0, ratingCount: 0, attendedCount: 0 });
  });
});
