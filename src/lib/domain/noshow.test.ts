// =============================================================================
// matching-app — S8 純関数テスト: isNoShowConfirmed (ドタキャン確定判定)。vitest。
// 境界網羅(spec 要望5): 0/1=未確定, 2=確定, 3+=確定。誤報防止のしきい値=2。
// 防御: 非整数/NaN/Infinity/負値 → 確定しない(誤課金防止・安全側)。
// =============================================================================

import { describe, it, expect } from "vitest";
import { isNoShowConfirmed, NO_SHOW_THRESHOLD } from "./noshow";

describe("NO_SHOW_THRESHOLD", () => {
  it("既定しきい値は 2（2人以上で確定）", () => {
    expect(NO_SHOW_THRESHOLD).toBe(2);
  });
});

describe("isNoShowConfirmed — 既定しきい値(2)の境界", () => {
  it("0件 → false", () => {
    expect(isNoShowConfirmed(0)).toBe(false);
  });

  it("1件 → false（1人の報告では確定しない＝誤報防止）", () => {
    expect(isNoShowConfirmed(1)).toBe(false);
  });

  it("2件 → true（2人以上で確定）", () => {
    expect(isNoShowConfirmed(2)).toBe(true);
  });

  it("3件以上 → true", () => {
    expect(isNoShowConfirmed(3)).toBe(true);
    expect(isNoShowConfirmed(6)).toBe(true);
  });
});

describe("isNoShowConfirmed — しきい値を明示指定", () => {
  it("threshold=1 なら1件で確定", () => {
    expect(isNoShowConfirmed(1, 1)).toBe(true);
    expect(isNoShowConfirmed(0, 1)).toBe(false);
  });

  it("threshold=3 なら2件では未確定・3件で確定", () => {
    expect(isNoShowConfirmed(2, 3)).toBe(false);
    expect(isNoShowConfirmed(3, 3)).toBe(true);
  });

  it("threshold が 0/負 は 1 に補正（0件で確定する事故を防ぐ）", () => {
    expect(isNoShowConfirmed(0, 0)).toBe(false);
    expect(isNoShowConfirmed(1, 0)).toBe(true);
    expect(isNoShowConfirmed(0, -5)).toBe(false);
    expect(isNoShowConfirmed(1, -5)).toBe(true);
  });
});

describe("isNoShowConfirmed — 防御的入力（罰金課金に直結するため安全側）", () => {
  it("負の reportCount → false", () => {
    expect(isNoShowConfirmed(-1)).toBe(false);
  });

  it("非整数 reportCount → false", () => {
    expect(isNoShowConfirmed(2.5)).toBe(false);
    expect(isNoShowConfirmed(1.9)).toBe(false);
  });

  it("NaN / Infinity の reportCount → false", () => {
    expect(isNoShowConfirmed(Number.NaN)).toBe(false);
    expect(isNoShowConfirmed(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
