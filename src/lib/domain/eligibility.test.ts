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
// genderFull — S12 #10 で柔軟定員(合計6・各性別2〜4)基準に変更。
//   応募可否ヒント = 応募ゲート canAcceptGenderFlex の否定。
//   その性別が max(4) 到達、または 合計 6 到達のとき満員(=これ以上応募不可)。
//   注: 3人目では満員にならない（厳密3:3時代との違い。4人目まで同性別を受け入れる）。
// =============================================================================
const FLEX = { capacityTotal: 6, minPerGender: 2, maxPerGender: 4 };

describe("genderFull (柔軟定員 6/2/4)", () => {
  it("空き(0:0) → false", () => {
    expect(genderFull({ male: 0, female: 0 }, FLEX, "male")).toBe(false);
  });
  it("男3 はまだ受け入れ可(max4未満・合計未満) → false（旧3:3なら満員だった点が変わった）", () => {
    expect(genderFull({ male: 3, female: 0 }, FLEX, "male")).toBe(false);
  });
  it("境界: 男4(max到達) → これ以上 male 不可 → true", () => {
    expect(genderFull({ male: 4, female: 0 }, FLEX, "male")).toBe(true);
  });
  it("合計が満杯(3:3=6) → どの性別も不可 → true", () => {
    expect(genderFull({ male: 3, female: 3 }, FLEX, "male")).toBe(true);
    expect(genderFull({ male: 3, female: 3 }, FLEX, "female")).toBe(true);
  });
  it("男4女1(合計5) → male は max到達で不可、female は 4:2=合計6 で可", () => {
    expect(genderFull({ male: 4, female: 1 }, FLEX, "male")).toBe(true);
    expect(genderFull({ male: 4, female: 1 }, FLEX, "female")).toBe(false);
  });
  it("異常: 不正な定員(min>max) は満員扱い(安全側)", () => {
    expect(
      genderFull({ male: 0, female: 0 }, { capacityTotal: 6, minPerGender: 4, maxPerGender: 2 }, "male")
    ).toBe(true);
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

describe("evaluateEligibility — gender_full (柔軟定員 6/2/4)", () => {
  it("自分の性別(male)が上限(4)到達 → gender_full", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 4, female: 0 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("gender_full");
  });
  it("男3(まだ4人目を受け入れ可) → gender_full にならない（旧3:3との違い）", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 3, female: 0 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).not.toContain("gender_full");
    expect(r.canApply).toBe(true);
  });
  it("合計が満杯(3:3=6) → 自分(male)も gender_full", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 3, female: 3 } }),
      alreadyApplied: false,
    });
    expect(r.reasons).toContain("gender_full");
  });
  it("相手性別(female)が上限でも自分(male)に空きがあれば gender_full にならない", () => {
    const r = evaluateEligibility({
      actor: okActor({ gender: "male" }),
      slot: openSlot({ filled: { male: 0, female: 4 } }),
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

  it("approved + 31歳 + バッジ無し + 満員(男4=上限) の20代バッジ限定枠 → 3理由を列挙", () => {
    const r = evaluateEligibility({
      actor: okActor({ age: 31, hasBadgePremium: false, gender: "male" }),
      slot: twentiesSlot({
        requiresBadge: true,
        filled: { male: 4, female: 0 },
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
