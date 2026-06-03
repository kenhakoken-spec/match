// =============================================================================
// matching-app — unit tests for S3 純関数 (isSlotFull / buildVenueMessage)
// 網羅:
//  - isSlotFull: 男3女3→true / 男3女2・男2女3→false / canceled は数えない /
//                空→false / 過充足(4)も true / capacity境界・不正値。
//  - buildVenueMessage: master_plan §3-7 の 6要素（日時/エリア/店名/URL/予約名/集合）
//                を **すべて** 含むこと / URL・集合が null でもラベルが出ること。
// 正典: docs/backend/api-contract-s3.md §5,§7 / docs/backend/notification.md §2.1
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  isSlotFull,
  buildVenueMessage,
  isSlotFullFlex,
  canAcceptGenderFlex,
  isValidFlexCapacity,
  DEFAULT_FLEX_CAPACITY,
} from "./match";
import type { Gender } from "@/lib/types";

// 応募配列を簡潔に作るヘルパ。
function apps(
  male: number,
  female: number,
  status: "applied" | "accepted" | "canceled" = "applied"
): { gender: Gender; status: "applied" | "accepted" | "canceled" }[] {
  const out: { gender: Gender; status: "applied" | "accepted" | "canceled" }[] = [];
  for (let i = 0; i < male; i++) out.push({ gender: "male", status });
  for (let i = 0; i < female; i++) out.push({ gender: "female", status });
  return out;
}

// =============================================================================
// isSlotFull
// =============================================================================
describe("isSlotFull", () => {
  it("男3女3(cap=3) → 成立 → true", () => {
    expect(isSlotFull(apps(3, 3), 3)).toBe(true);
  });

  it("男3女2 → 女が足りない → false", () => {
    expect(isSlotFull(apps(3, 2), 3)).toBe(false);
  });

  it("男2女3 → 男が足りない → false", () => {
    expect(isSlotFull(apps(2, 3), 3)).toBe(false);
  });

  it("空配列 → false", () => {
    expect(isSlotFull([], 3)).toBe(false);
  });

  it("境界: 男2女2(cap=2) → ちょうど充足 → true", () => {
    expect(isSlotFull(apps(2, 2), 2)).toBe(true);
  });

  it("accepted も有効応募として数える(男3女3 accepted) → true", () => {
    expect(isSlotFull(apps(3, 3, "accepted"), 3)).toBe(true);
  });

  it("canceled は数えない: 男3女3が全て canceled → false", () => {
    expect(isSlotFull(apps(3, 3, "canceled"), 3)).toBe(false);
  });

  it("canceled 混在: applied 男3女3 + canceled 多数 → 有効分のみで true", () => {
    const mixed = [...apps(3, 3, "applied"), ...apps(5, 5, "canceled")];
    expect(isSlotFull(mixed, 3)).toBe(true);
  });

  it("過充足(男4女4) も成立条件は満たす → true(過充足の阻止は applyAtomic 側)", () => {
    expect(isSlotFull(apps(4, 4), 3)).toBe(true);
  });

  it("不正 capacity(0) → false", () => {
    expect(isSlotFull(apps(3, 3), 0)).toBe(false);
  });

  it("不正 capacity(NaN) → false", () => {
    expect(isSlotFull(apps(3, 3), Number.NaN)).toBe(false);
  });
});

// =============================================================================
// buildVenueMessage — 6要素の網羅(契約§7 / notification.md §2.1)
// =============================================================================
describe("buildVenueMessage", () => {
  // 2026-06-13T10:00:00Z = JST 2026-06-13(土) 19:00（土曜であることをカレンダーで確認済み）。
  const base = {
    datetimeStart: new Date("2026-06-13T10:00:00.000Z"),
    area: "ebisu" as const,
    venueName: "〇〇ビストロ",
    venueUrl: "https://example.com/reserve",
    reservationName: "マッチングアプリ・タナカ",
    meetingPlace: "店前 18:50",
  };

  it("6要素（日時/エリア/店名/URL/予約名/集合）を全て含む", () => {
    const msg = buildVenueMessage(base);
    // 日時(JST 変換): 年月日・曜日・時刻
    expect(msg).toContain("2026年6月13日");
    expect(msg).toContain("(土)");
    expect(msg).toContain("19:00");
    // エリア(日本語ラベル)
    expect(msg).toContain("恵比寿");
    // 店名
    expect(msg).toContain("〇〇ビストロ");
    // 予約URL
    expect(msg).toContain("https://example.com/reserve");
    // 予約名
    expect(msg).toContain("マッチングアプリ・タナカ");
    // 集合
    expect(msg).toContain("店前 18:50");
  });

  it("ラベル行が 6種すべて存在する(日時/エリア/お店/予約URL/ご予約名/集合)", () => {
    const msg = buildVenueMessage(base);
    expect(msg).toContain("日時:");
    expect(msg).toContain("エリア:");
    expect(msg).toContain("お店:");
    expect(msg).toContain("予約URL:");
    expect(msg).toContain("ご予約名:");
    expect(msg).toContain("集合:");
  });

  it("venueUrl=null でも『予約URL』ラベルは出し、値を（なし）に置換", () => {
    const msg = buildVenueMessage({ ...base, venueUrl: null });
    expect(msg).toContain("予約URL:");
    expect(msg).toContain("（なし）");
    expect(msg).not.toContain("https://example.com/reserve");
  });

  it("meetingPlace=null でも『集合』ラベルは出し、当日案内文言に置換", () => {
    const msg = buildVenueMessage({ ...base, meetingPlace: null });
    expect(msg).toContain("集合:");
    expect(msg).toContain("当日ご案内します");
  });

  it("エリアごとに正しい日本語ラベルを出す", () => {
    expect(buildVenueMessage({ ...base, area: "ikebukuro" })).toContain("池袋");
    expect(buildVenueMessage({ ...base, area: "ginza" })).toContain("銀座");
  });

  it("成立見出しを含む", () => {
    expect(buildVenueMessage(base)).toContain("成立しました");
  });
});

// =============================================================================
// S12 #10 — 定員柔軟化（合計6人で 2:4〜4:2 を許容）
//   既定 DEFAULT_FLEX_CAPACITY = 合計6 / 各性別 min2 max4。
//   成立: 3:3 / 2:4 / 4:2 → ○。 5:1 / 6:0 / 1:5 / 2:3(=5人) → ×。
//   既存の厳密 3:3 (isSlotFull) は別関数で温存（上の isSlotFull suite が担保）。
// =============================================================================
describe("isSlotFullFlex — 合計6で柔軟成立", () => {
  it("3:3 → 成立 → true（従来の比率も引き続き成立）", () => {
    expect(isSlotFullFlex(apps(3, 3))).toBe(true);
  });
  it("2:4 → 成立 → true", () => {
    expect(isSlotFullFlex(apps(2, 4))).toBe(true);
  });
  it("4:2 → 成立 → true", () => {
    expect(isSlotFullFlex(apps(4, 2))).toBe(true);
  });
  it("5:1 → 偏りすぎ(min2未満) → false", () => {
    expect(isSlotFullFlex(apps(5, 1))).toBe(false);
  });
  it("1:5 → 偏りすぎ(min2未満) → false", () => {
    expect(isSlotFullFlex(apps(1, 5))).toBe(false);
  });
  it("6:0 → 片方ゼロ → false", () => {
    expect(isSlotFullFlex(apps(6, 0))).toBe(false);
  });
  it("0:6 → 片方ゼロ → false", () => {
    expect(isSlotFullFlex(apps(0, 6))).toBe(false);
  });
  it("合計5(2:3) → 定員未満 → false", () => {
    expect(isSlotFullFlex(apps(2, 3))).toBe(false);
  });
  it("合計7(3:4) → 定員超過 → false（合計一致が必要）", () => {
    expect(isSlotFullFlex(apps(3, 4))).toBe(false);
  });
  it("canceled は数えない: 2:4 applied + canceled 多数 → true", () => {
    const mixed = [...apps(2, 4, "applied"), ...apps(3, 3, "canceled")];
    expect(isSlotFullFlex(mixed)).toBe(true);
  });
  it("空配列 → false", () => {
    expect(isSlotFullFlex([])).toBe(false);
  });
  it("不正な定員(min>max) → false", () => {
    expect(
      isSlotFullFlex(apps(3, 3), { capacityTotal: 6, minPerGender: 4, maxPerGender: 2 })
    ).toBe(false);
  });
});

describe("canAcceptGenderFlex — 応募ゲート（過充足・合計超過の防止）", () => {
  it("空(0:0)に male を受け入れ → true（最初の1人を弾かない）", () => {
    expect(canAcceptGenderFlex({ male: 0, female: 0 }, "male")).toBe(true);
  });
  it("男4女1 に さらに male → max4 超過 → false", () => {
    expect(canAcceptGenderFlex({ male: 4, female: 1 }, "male")).toBe(false);
  });
  it("男4女1 に female → 受け入れ後5:... ではなく 4:2=合計6 → true", () => {
    expect(canAcceptGenderFlex({ male: 4, female: 1 }, "female")).toBe(true);
  });
  it("合計5(3:2) に male → 4:2=合計6 → true", () => {
    expect(canAcceptGenderFlex({ male: 3, female: 2 }, "male")).toBe(true);
  });
  it("合計6(3:3) にさらに → 合計超過 → false", () => {
    expect(canAcceptGenderFlex({ male: 3, female: 3 }, "male")).toBe(false);
    expect(canAcceptGenderFlex({ male: 3, female: 3 }, "female")).toBe(false);
  });
  it("男2女3(=5) に male → 3:3 → true", () => {
    expect(canAcceptGenderFlex({ male: 2, female: 3 }, "male")).toBe(true);
  });
});

describe("isValidFlexCapacity — 定員整合の防御", () => {
  it("既定(6/2/4) は妥当", () => {
    expect(isValidFlexCapacity(DEFAULT_FLEX_CAPACITY)).toBe(true);
  });
  it("min>max は不正", () => {
    expect(isValidFlexCapacity({ capacityTotal: 6, minPerGender: 4, maxPerGender: 2 })).toBe(
      false
    );
  });
  it("min*2 > total（成立解なし）は不正", () => {
    expect(isValidFlexCapacity({ capacityTotal: 6, minPerGender: 4, maxPerGender: 6 })).toBe(
      false
    );
  });
  it("max*2 < total（成立解なし）は不正", () => {
    expect(isValidFlexCapacity({ capacityTotal: 10, minPerGender: 2, maxPerGender: 4 })).toBe(
      false
    );
  });
  it("非有限値は不正", () => {
    expect(
      isValidFlexCapacity({ capacityTotal: Number.NaN, minPerGender: 2, maxPerGender: 4 })
    ).toBe(false);
  });
  it("厳密3:3を柔軟定員で表現(6/3/3)も妥当（3:3のみ成立）", () => {
    const strict = { capacityTotal: 6, minPerGender: 3, maxPerGender: 3 };
    expect(isValidFlexCapacity(strict)).toBe(true);
    expect(isSlotFullFlex(apps(3, 3), strict)).toBe(true);
    expect(isSlotFullFlex(apps(2, 4), strict)).toBe(false); // 厳密枠では 2:4 不成立
  });
});
