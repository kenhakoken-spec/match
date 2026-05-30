// =============================================================================
// matching-app — unit tests for pure domain functions (S1 contract §3)
// 各関数に 正常 + 境界(誕生日当日 / 18歳ちょうど) + 異常 を含める。
// =============================================================================

import { describe, it, expect } from "vitest";
import { calcAge, isAdult, ageInBand, canApply } from "./age";

// 固定の "now" を使い、テストを決定的にする(UTC)。
const NOW = new Date("2026-05-30T00:00:00.000Z");

// UTC で誕生日 Date を作るヘルパ。
function dob(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

describe("calcAge", () => {
  it("正常: 誕生日が既に過ぎている年", () => {
    // 2000-01-15 生まれ → 2026-05-30 時点で 26 歳
    expect(calcAge(dob(2000, 1, 15), NOW)).toBe(26);
  });

  it("正常: 誕生日がまだ来ていない(月が後)→ 1引く", () => {
    // 2000-12-31 生まれ → 2026-05-30 時点ではまだ誕生日前 → 25 歳
    expect(calcAge(dob(2000, 12, 31), NOW)).toBe(25);
  });

  it("境界: 誕生日当日 → その日に加齢する", () => {
    // 2000-05-30 生まれ → 2026-05-30 ちょうど誕生日 → 26 歳
    expect(calcAge(dob(2000, 5, 30), NOW)).toBe(26);
  });

  it("境界: 誕生日の前日 → まだ加齢しない", () => {
    // 2000-05-31 生まれ → 2026-05-30 は誕生日前日 → 25 歳
    expect(calcAge(dob(2000, 5, 31), NOW)).toBe(25);
  });

  it("境界: 同月で誕生日翌日 → 既に加齢済み", () => {
    // 2000-05-29 生まれ → 2026-05-30 は誕生日翌日 → 26 歳
    expect(calcAge(dob(2000, 5, 29), NOW)).toBe(26);
  });

  it("異常: 不正な birthdate(Invalid Date)→ NaN", () => {
    expect(calcAge(new Date("not-a-date"), NOW)).toBeNaN();
  });

  it("異常: 不正な now → NaN", () => {
    expect(calcAge(dob(2000, 1, 1), new Date("nope"))).toBeNaN();
  });
});

describe("isAdult (>= 18)", () => {
  it("正常: 26歳 → true", () => {
    expect(isAdult(dob(2000, 1, 1), NOW)).toBe(true);
  });

  it("境界: 18歳ちょうど(誕生日当日)→ true", () => {
    // 2008-05-30 生まれ → 2026-05-30 にちょうど 18 歳
    expect(isAdult(dob(2008, 5, 30), NOW)).toBe(true);
  });

  it("境界: 18歳の誕生日前日(=まだ17歳)→ false", () => {
    // 2008-05-31 生まれ → 2026-05-30 時点で 17 歳
    expect(isAdult(dob(2008, 5, 31), NOW)).toBe(false);
  });

  it("異常: 17歳 → false", () => {
    expect(isAdult(dob(2009, 1, 1), NOW)).toBe(false);
  });

  it("異常: 不正な birthdate → false(安全側)", () => {
    expect(isAdult(new Date("invalid"), NOW)).toBe(false);
  });
});

describe("ageInBand", () => {
  it("正常: 26歳が [20,29] に入る → true", () => {
    expect(ageInBand(dob(2000, 1, 1), 20, 29, NOW)).toBe(true);
  });

  it("正常: 制限なし(null,null)→ 常に true", () => {
    expect(ageInBand(dob(1980, 1, 1), null, null, NOW)).toBe(true);
  });

  it("境界: minAge ちょうど → true(両端含む)", () => {
    // 2006-05-30 生まれ → ちょうど 20 歳。min=20 を含む。
    expect(ageInBand(dob(2006, 5, 30), 20, 29, NOW)).toBe(true);
  });

  it("境界: maxAge ちょうど → true(両端含む)", () => {
    // 1996-05-30 生まれ → ちょうど 30 歳。max=30 を含む。
    expect(ageInBand(dob(1996, 5, 30), 20, 30, NOW)).toBe(true);
  });

  it("境界: maxAge を1歳超過 → false", () => {
    // 1996-05-30 生まれ → 30 歳。max=29 を超える。
    expect(ageInBand(dob(1996, 5, 30), 20, 29, NOW)).toBe(false);
  });

  it("異常: minAge 未満 → false", () => {
    // 2010-01-01 生まれ → 16 歳。min=20 未満。
    expect(ageInBand(dob(2010, 1, 1), 20, 29, NOW)).toBe(false);
  });

  it("片側のみ: minのみ指定(maxはnull)", () => {
    expect(ageInBand(dob(1980, 1, 1), 20, null, NOW)).toBe(true);
    expect(ageInBand(dob(2010, 1, 1), 20, null, NOW)).toBe(false);
  });

  it("片側のみ: maxのみ指定(minはnull)", () => {
    expect(ageInBand(dob(2010, 1, 1), null, 29, NOW)).toBe(true);
    expect(ageInBand(dob(1980, 1, 1), null, 29, NOW)).toBe(false);
  });

  it("異常: 不正な birthdate → false(安全側=応募不可)", () => {
    expect(ageInBand(new Date("invalid"), 20, 29, NOW)).toBe(false);
  });
});

describe("canApply", () => {
  it("正常: approved かつ profile完成 → ok", () => {
    expect(
      canApply({ identityStatus: "approved", hasCompleteProfile: true })
    ).toEqual({ ok: true, reason: null });
  });

  it("異常: identity未提出(null)→ identity_required", () => {
    expect(
      canApply({ identityStatus: null, hasCompleteProfile: true })
    ).toEqual({ ok: false, reason: "identity_required" });
  });

  it("異常: identity=pending → identity_required", () => {
    expect(
      canApply({ identityStatus: "pending", hasCompleteProfile: true })
    ).toEqual({ ok: false, reason: "identity_required" });
  });

  it("異常: identity=rejected → identity_required", () => {
    expect(
      canApply({ identityStatus: "rejected", hasCompleteProfile: true })
    ).toEqual({ ok: false, reason: "identity_required" });
  });

  it("境界: approved だが profile未完成 → profile_required", () => {
    expect(
      canApply({ identityStatus: "approved", hasCompleteProfile: false })
    ).toEqual({ ok: false, reason: "profile_required" });
  });

  it("優先順: identity未承認 かつ profile未完成 → identityを優先", () => {
    expect(
      canApply({ identityStatus: null, hasCompleteProfile: false })
    ).toEqual({ ok: false, reason: "identity_required" });
  });
});
