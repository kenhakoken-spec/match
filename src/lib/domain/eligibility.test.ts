// =============================================================================
// matching-app — unit tests for S2 応募ゲート (evaluateEligibility / genderFull)
// 網羅: 各 reason を個別 + 複合 / 境界年齢 19・20・29・30 / 定員 / 二重応募 / 枠状態。
// 正典: docs/backend/api-contract-s2.md §4,§6 / docs/backend/matching-logic.md
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  evaluateEligibility,
  genderFull,
  primaryReason,
  type EligibilityActor,
  type EligibilitySlot,
} from "./eligibility";

// --- fixtures ---------------------------------------------------------------

// 「すべての条件を満たす」応募者(approved / profile完成 / 25歳 / male / badge無し)。
function okActor(over: Partial<EligibilityActor> = {}): EligibilityActor {
  return {
    identityStatus: "approved",
    hasCompleteProfile: true,
    gender: "male",
    age: 25,
    hasBadgePremium: false,
    ...over,
  };
}

// 「制限なし・空きあり・open」の通常枠。
function openSlot(over: Partial<EligibilitySlot> = {}): EligibilitySlot {
  return {
    minAge: null,
    maxAge: null,
    requiresBadge: false,
    status: "open",
    filled: { male: 0, female: 0 },
    capacityPerGender: 3,
    ...over,
  };
}

// 20代限定(20-29)の枠。
function twentiesSlot(over: Partial<EligibilitySlot> = {}): EligibilitySlot {
  return openSlot({ minAge: 20, maxAge: 29, ...over });
}

// =============================================================================
// genderFull
// =============================================================================
describe("genderFull", () => {
  it("空き(0/3) → false", () => {
    expect(genderFull({ male: 0, female: 0 }, 3, "male")).toBe(false);
  });
  it("2/3 → まだ空き → false", () => {
    expect(genderFull({ male: 2, female: 3 }, 3, "male")).toBe(false);
  });
  it("境界: ちょうど定員(3/3) → 満員 → true", () => {
    expect(genderFull({ male: 3, female: 0 }, 3, "male")).toBe(true);
  });
  it("過充足(4/3) → true", () => {
    expect(genderFull({ male: 4, female: 0 }, 3, "male")).toBe(true);
  });
  it("性別ごとに独立: male満員でも female は空きを見る", () => {
    expect(genderFull({ male: 3, female: 1 }, 3, "female")).toBe(false);
    expect(genderFull({ male: 3, female: 1 }, 3, "male")).toBe(true);
  });
  it("異常: capacity<=0 は満員扱い(安全側)", () => {
    expect(genderFull({ male: 0, female: 0 }, 0, "male")).toBe(true);
    expect(genderFull({ male: 0, female: 0 }, -1, "male")).toBe(true);
  });
});

// =============================================================================
// evaluateEligibility — 正常系
// =============================================================================
describe("evaluateEligibility — 応募可(canApply:true)", () => {
  it("通常枠: 全条件OK → canApply:true / reasons:[]", () => {
    const r = evaluateEligibility({
      actor: okActor(),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r).toEqual({ canApply: true, reasons: [] });
  });

  it("20代限定枠: 25歳 male → 応募可", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 25 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.canApply).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("バッジ限定枠: premium保有 → 応募可", () => {
    const r = evaluateEligibility({
      actor: okActor({ hasBadgePremium: true }),
      slot: openSlot({ requiresBadge: true }),
      alreadyApplied: false,
    });
    expect(r.canApply).toBe(true);
  });

  it("片側のみ年齢制限(min=20,max=null): 40歳でも応募可", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 40 }),
      slot: openSlot({ minAge: 20, maxAge: null }),
      alreadyApplied: false,
    });
    expect(r.canApply).toBe(true);
  });
});

// =============================================================================
// evaluateEligibility — 各 reason 個別
// =============================================================================
describe("evaluateEligibility — identity_required", () => {
  it("未提出(null) → identity_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ identityStatus: null }),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r.canApply).toBe(false);
    expect(r.reasons).toContain("identity_required");
  });
  it("pending → identity_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ identityStatus: "pending" }),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("identity_required");
  });
  it("rejected → identity_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ identityStatus: "rejected" }),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("identity_required");
  });
});

describe("evaluateEligibility — profile_required", () => {
  it("hasCompleteProfile=false → profile_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ hasCompleteProfile: false, gender: null, age: null }),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("profile_required");
  });
  it("gender=null(プロフィール未完成扱い) → profile_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: null }),
      slot: openSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("profile_required");
  });
  it("age=null → profile_required かつ 年齢/定員は判定しない", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: null }),
      slot: twentiesSlot({ filled: { male: 3, female: 3 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("profile_required");
    // gender/age 不明なので age_out_of_range / gender_full は付かない。
    expect(r.reasons).not.toContain("age_out_of_range");
    expect(r.reasons).not.toContain("gender_full");
  });
});

describe("evaluateEligibility — slot_closed", () => {
  it.each(["filled", "confirmed", "done", "canceled"] as const)(
    "status=%s → slot_closed",
    (status) => {
      const r = evaluateEligibility({
        actor: okActor(),
        slot: openSlot({ status }),
        alreadyApplied: false,
      });
      expect(r.reasons).toContain("slot_closed");
      expect(r.canApply).toBe(false);
    }
  );
});

describe("evaluateEligibility — already_applied", () => {
  it("alreadyApplied=true → already_applied", () => {
    const r = evaluateEligibility({
      actor: okActor(),
      slot: openSlot(),
      alreadyApplied: true,
    });
    expect(r.reasons).toContain("already_applied");
    expect(r.canApply).toBe(false);
  });
});

describe("evaluateEligibility — badge_required", () => {
  it("requiresBadge かつ premium無し → badge_required", () => {
    const r = evaluateEligibility({
      actor: okActor({ hasBadgePremium: false }),
      slot: openSlot({ requiresBadge: true }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("badge_required");
  });
});

describe("evaluateEligibility — gender_full", () => {
  it("自分の性別(male)が満員 → gender_full", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 3, female: 0 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("gender_full");
  });
  it("相手性別(female)が満員でも自分(male)に空きがあれば gender_full にならない", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 0, female: 3 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).not.toContain("gender_full");
    expect(r.canApply).toBe(true);
  });
});

// =============================================================================
// 境界年齢 19 / 20 / 29 / 30 — 20代限定(minAge=20, maxAge=29)
// =============================================================================
describe("evaluateEligibility — 境界年齢(20代限定 20-29)", () => {
  it("19歳 → age_out_of_range(下限未満)", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 19 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("age_out_of_range");
    expect(r.canApply).toBe(false);
  });
  it("境界: 20歳ちょうど → 応募可(下限含む)", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 20 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).not.toContain("age_out_of_range");
    expect(r.canApply).toBe(true);
  });
  it("境界: 29歳ちょうど → 応募可(上限含む)", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 29 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).not.toContain("age_out_of_range");
    expect(r.canApply).toBe(true);
  });
  it("30歳 → age_out_of_range(上限超過)", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 30 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("age_out_of_range");
    expect(r.canApply).toBe(false);
  });
  it("31歳 → age_out_of_range(curl実証と一致)", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 31 }),
      slot: twentiesSlot(),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("age_out_of_range");
  });
});

// =============================================================================
// 複合理由 — 満たさない条件をすべて列挙する
// =============================================================================
describe("evaluateEligibility — 複合理由", () => {
  it("未認証 + プロフィール未完成 → 両方を列挙(年齢/定員は判定不能で付かない)", () => {
    const r = evaluateEligibility({
      actor: {
        identityStatus: null,
        hasCompleteProfile: false,
        gender: null,
        age: null,
        hasBadgePremium: false,
      },
      slot: twentiesSlot({ filled: { male: 3, female: 3 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("identity_required");
    expect(r.reasons).toContain("profile_required");
    expect(r.reasons).not.toContain("age_out_of_range");
    expect(r.reasons).not.toContain("gender_full");
    expect(r.canApply).toBe(false);
  });

  it("approved + 31歳 + バッジ無し + 満員 の20代バッジ限定枠 → 3理由を列挙", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 31, hasBadgePremium: false, gender: "male" }),
      slot: twentiesSlot({
        requiresBadge: true,
        filled: { male: 3, female: 0 },
      }),
      alreadyApplied: false,
    });
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        "age_out_of_range",
        "badge_required",
        "gender_full",
      ])
    );
    expect(r.reasons).not.toContain("identity_required");
    expect(r.reasons).not.toContain("profile_required");
  });

  it("二重応募 + 枠締切 → already_applied と slot_closed の両方", () => {
    const r = evaluateEligibility({
      actor: okActor(),
      slot: openSlot({ status: "filled" }),
      alreadyApplied: true,
    });
    expect(r.reasons).toContain("already_applied");
    expect(r.reasons).toContain("slot_closed");
  });
});

// =============================================================================
// primaryReason — 優先順位つき先頭理由
// =============================================================================
describe("primaryReason", () => {
  it("空 → null", () => {
    expect(primaryReason([])).toBeNull();
  });
  it("identity が最優先", () => {
    expect(
      primaryReason(["gender_full", "identity_required", "age_out_of_range"])
    ).toBe("identity_required");
  });
  it("identity が無ければ profile が先", () => {
    expect(primaryReason(["gender_full", "profile_required"])).toBe(
      "profile_required"
    );
  });
  it("年齢とバッジと定員なら年齢が先", () => {
    expect(
      primaryReason(["gender_full", "badge_required", "age_out_of_range"])
    ).toBe("age_out_of_range");
  });
});
