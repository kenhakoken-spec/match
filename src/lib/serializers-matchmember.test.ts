// =============================================================================
// matching-app — unit tests for toMatchMemberDTO (S12 #7/#4/#14)
// 成立詳細メンバーDTO: age(誕生日→算出)・occupation(自由入力優先)・bio を開示する。
// **PII最小**: lineUserId/userId/正確な生年月日(birthdate) は出さない。
// 正典: docs/05_s12_feedback.md #7,#4,#14
// =============================================================================

import { describe, it, expect } from "vitest";
import { toMatchMemberDTO } from "./serializers";
import type { MatchMemberRow } from "@/lib/repo";

const NOW = new Date("2026-06-03T00:00:00.000Z");

function row(over: Partial<MatchMemberRow> = {}): MatchMemberRow {
  return {
    userId: "u_secret_internal",
    displayName: "テスト太郎",
    gender: "male",
    birthdate: new Date(Date.UTC(1994, 4, 15)), // 1994-05-15 → 2026-06-03 で32歳
    occupationText: "ITエンジニア",
    occupation: "it",
    bio: "よろしくお願いします",
    ...over,
  };
}

describe("toMatchMemberDTO — 成立詳細の開示(#7/#4/#14)", () => {
  it("age を誕生日から算出して入れる(#7)", () => {
    const dto = toMatchMemberDTO(row(), NOW);
    expect(dto.age).toBe(32);
  });

  it("誕生日前日なら1歳若く算出する（境界）", () => {
    const dto = toMatchMemberDTO(
      row({ birthdate: new Date(Date.UTC(1994, 5, 4)) }), // 6/4 生まれ・基準6/3 → 31
      NOW
    );
    expect(dto.age).toBe(31);
  });

  it("occupation は自由入力(occupationText)を優先(#6/#14)", () => {
    const dto = toMatchMemberDTO(
      row({ occupationText: "外資コンサル", occupation: "company_employee" }),
      NOW
    );
    expect(dto.occupation).toBe("外資コンサル");
  });

  it("自由入力が無ければ enum を日本語化（後方互換）", () => {
    const dto = toMatchMemberDTO(row({ occupationText: null, occupation: "finance" }), NOW);
    expect(dto.occupation).toBe("金融");
  });

  it("bio を開示する(#4)", () => {
    const dto = toMatchMemberDTO(row({ bio: "お酒が好きです" }), NOW);
    expect(dto.bio).toBe("お酒が好きです");
  });

  it("birthdate=null なら age=null（防御）", () => {
    const dto = toMatchMemberDTO(row({ birthdate: null }), NOW);
    expect(dto.age).toBeNull();
  });

  it("displayName が null なら空文字に正規化（既存挙動の維持）", () => {
    const dto = toMatchMemberDTO(row({ displayName: null }), NOW);
    expect(dto.displayName).toBe("");
  });

  it("PII最小: userId/lineUserId/birthdate を **出さない**", () => {
    const dto = toMatchMemberDTO(row(), NOW);
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("lineUserId");
    expect(dto).not.toHaveProperty("birthdate");
    // キーは displayName/gender/age/occupation/bio のちょうど5つ。
    expect(Object.keys(dto).sort()).toEqual([
      "age",
      "bio",
      "displayName",
      "gender",
      "occupation",
    ]);
    // 内部 userId が値としても混入しない。
    expect(JSON.stringify(dto)).not.toContain("u_secret_internal");
  });
});
