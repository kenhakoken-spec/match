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
import { isSlotFull, buildVenueMessage } from "./match";
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
