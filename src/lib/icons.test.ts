// =============================================================================
// matching-app — unit tests for プリセットアイコン (S12 #8)
//  - ICON_IDS は重複なし・一定数(8〜12)・全idにラベルがある。
//  - isValidIconKey: 既知idのみ true / 未知・null・非文字列は false。
// 正典: docs/05_s12_feedback.md #8
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  ICON_IDS,
  ICON_LABELS,
  DEFAULT_ICON_KEY,
  isValidIconKey,
} from "./icons";

describe("ICON_IDS / ICON_LABELS", () => {
  it("8〜12個のアイコンを定義している", () => {
    expect(ICON_IDS.length).toBeGreaterThanOrEqual(8);
    expect(ICON_IDS.length).toBeLessThanOrEqual(12);
  });

  it("id に重複が無い", () => {
    expect(new Set(ICON_IDS).size).toBe(ICON_IDS.length);
  });

  it("全 id にラベルがある", () => {
    for (const id of ICON_IDS) {
      expect(typeof ICON_LABELS[id]).toBe("string");
      expect(ICON_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_ICON_KEY は有効な id", () => {
    expect(ICON_IDS).toContain(DEFAULT_ICON_KEY);
  });
});

describe("isValidIconKey", () => {
  it("既知の id は true", () => {
    expect(isValidIconKey("fox")).toBe(true);
    expect(isValidIconKey(ICON_IDS[0])).toBe(true);
  });

  it("未知の id は false", () => {
    expect(isValidIconKey("dragon")).toBe(false);
    expect(isValidIconKey("")).toBe(false);
  });

  it("非文字列・null・undefined は false", () => {
    expect(isValidIconKey(null)).toBe(false);
    expect(isValidIconKey(undefined)).toBe(false);
    expect(isValidIconKey(123)).toBe(false);
    expect(isValidIconKey({})).toBe(false);
  });
});
