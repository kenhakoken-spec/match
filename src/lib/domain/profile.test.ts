// =============================================================================
// matching-app — unit tests for プロフィール純関数 (S12 #6/#14)
//  - sanitizeOccupationText: トリム/空白圧縮/制御・ゼロ幅除去/最大長/空→null。
//  - occupationLabel: enum → 日本語ラベル / 未設定→null。
//  - resolveOccupationDisplay: 自由入力優先 → 無ければ enum → 無ければ null。
// 正典: docs/05_s12_feedback.md #6,#14
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  sanitizeOccupationText,
  occupationLabel,
  resolveOccupationDisplay,
  OCCUPATION_TEXT_MAX,
} from "./profile";

describe("sanitizeOccupationText", () => {
  it("前後の空白をトリムする", () => {
    expect(sanitizeOccupationText("  会社員  ")).toBe("会社員");
  });

  it("連続する空白を1つに圧縮する", () => {
    expect(sanitizeOccupationText("外資  系   コンサル")).toBe("外資 系 コンサル");
  });

  it("改行・タブ(制御文字)を除去（空白化→トリム）する", () => {
    expect(sanitizeOccupationText("エンジニア\n\t")).toBe("エンジニア");
    expect(sanitizeOccupationText("a\nb")).toBe("a b");
  });

  it("ゼロ幅スペース等の不可視文字を除去する（なりすまし対策）", () => {
    // U+200B(ZWSP) を挟んでも結合されず、空白化→圧縮される。
    expect(sanitizeOccupationText("医​師")).toBe("医 師");
    // BOM(U+FEFF) も除去。
    expect(sanitizeOccupationText("﻿教員")).toBe("教員");
  });

  it("最大長(OCCUPATION_TEXT_MAX)で切り詰める", () => {
    const long = "あ".repeat(OCCUPATION_TEXT_MAX + 10);
    const out = sanitizeOccupationText(long);
    expect(Array.from(out ?? "")).toHaveLength(OCCUPATION_TEXT_MAX);
  });

  it("空文字・空白のみ → null（未入力扱い）", () => {
    expect(sanitizeOccupationText("")).toBeNull();
    expect(sanitizeOccupationText("   ")).toBeNull();
    expect(sanitizeOccupationText("\n\t")).toBeNull();
  });

  it("null/undefined/非文字列 → null", () => {
    expect(sanitizeOccupationText(null)).toBeNull();
    expect(sanitizeOccupationText(undefined)).toBeNull();
    // @ts-expect-error 非文字列も防御的に null。
    expect(sanitizeOccupationText(12345)).toBeNull();
  });

  it("通常の日本語/英数字はそのまま保持する", () => {
    expect(sanitizeOccupationText("Webエンジニア(SaaS)")).toBe("Webエンジニア(SaaS)");
  });
});

describe("occupationLabel", () => {
  it("enum を日本語ラベルに変換する", () => {
    expect(occupationLabel("company_employee")).toBe("会社員");
    expect(occupationLabel("it")).toBe("IT・エンジニア");
    expect(occupationLabel("student")).toBe("学生");
    expect(occupationLabel("other")).toBe("その他");
  });

  it("null/undefined → null", () => {
    expect(occupationLabel(null)).toBeNull();
    expect(occupationLabel(undefined)).toBeNull();
  });
});

describe("resolveOccupationDisplay — 成立詳細の職業表示(#14)", () => {
  it("自由入力(occupationText)があればそれを優先する(#6)", () => {
    expect(
      resolveOccupationDisplay({ occupationText: "スタートアップCEO", occupation: "it" })
    ).toBe("スタートアップCEO");
  });

  it("自由入力が無ければ enum を日本語化する（後方互換）", () => {
    expect(
      resolveOccupationDisplay({ occupationText: null, occupation: "finance" })
    ).toBe("金融");
  });

  it("自由入力が空白のみ → enum にフォールバックする", () => {
    expect(
      resolveOccupationDisplay({ occupationText: "   ", occupation: "medical" })
    ).toBe("医療系");
  });

  it("どちらも無ければ null", () => {
    expect(
      resolveOccupationDisplay({ occupationText: null, occupation: null })
    ).toBeNull();
  });

  it("自由入力もサニタイズされる（制御文字除去）", () => {
    expect(
      resolveOccupationDisplay({ occupationText: "デザイナー\n", occupation: null })
    ).toBe("デザイナー");
  });
});
