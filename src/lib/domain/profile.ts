// =============================================================================
// matching-app — pure domain functions for プロフィール (S12 #6 職業フリー入力)
// 副作用なし・DB非依存。vitest で単体テスト必須。
//
// 正典: docs/05_s12_feedback.md #6(職業フリー入力) / #14(成立詳細で職業表示)
//        docs/06_s12_strategy.md §4(プロフィール軽量化)
//
// 方針:
//  - 職業は enum(Occupation) を廃して **自由入力(occupationText)** を主にする(#6)。
//  - 自由入力はサニタイズ必須(制御文字除去・トリム・最大長)。XSS/インジェクションの
//    一次防御をドメインで担保し、保存値を正規化する(SQLi はパラメータ化で別途防御)。
//  - 成立詳細(#14)の職業表示は「自由入力があればそれ、無ければ enum を日本語化」する。
// =============================================================================

import type { Occupation } from "@/lib/types";

/** 職業自由入力の最大文字数(schema occupationText VarChar(40) と一致)。 */
export const OCCUPATION_TEXT_MAX = 40;

/**
 * 除去対象の危険な不可視文字の正規表現。
 * ソースに不可視文字を直書きしない(可読・検証可能)ため **コードポイントから生成** する:
 *  - U+0000–U+001F: C0 制御文字(改行/タブ/NUL 等)
 *  - U+007F:        DEL
 *  - U+200B–U+200F: ゼロ幅スペース/接合子/LRM/RLM 等(なりすまし・不可視挿入対策)
 *  - U+FEFF:        ゼロ幅 NBSP / BOM
 * これらは空白へ置換し、後段の空白圧縮で吸収する。
 */
const DANGEROUS_CHARS = new RegExp(
  "[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\uFEFF]",
  "g"
);

/**
 * 短い1行ラベルの保存前サニタイズ(共通)。
 *  - 危険な不可視文字(DANGEROUS_CHARS)を空白へ置換。
 *  - 連続空白を1つに圧縮しトリム。
 *  - 空なら null。最後に maxLen でコードポイント単位に切り詰め。
 */
function sanitizeForStorage(input: string, maxLen: number): string | null {
  const stripped = input.replace(DANGEROUS_CHARS, " ");
  const normalized = stripped.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return Array.from(normalized).slice(0, maxLen).join("");
}

/**
 * 職業の自由入力をサニタイズして正規化する(#6)。
 *  - 前後の空白を除去・連続空白を圧縮。
 *  - 制御文字/ゼロ幅文字を除去(1行の短いラベル想定)。
 *  - 最大長(OCCUPATION_TEXT_MAX)で切り詰め。
 * 結果が空文字なら null を返す(未入力扱い)。null/undefined/非文字列も null。
 *
 * 注: HTML エスケープはしない(表示層が React で自動エスケープする前提)。
 *     ここは「保存前の正規化と危険文字の除去」に責務を限定する。
 */
export function sanitizeOccupationText(
  input: string | null | undefined
): string | null {
  if (typeof input !== "string") return null;
  return sanitizeForStorage(input, OCCUPATION_TEXT_MAX);
}

/** enum 職種 → 日本語表示ラベル(成立詳細で enum しか無い旧データを表示する用)。 */
const OCCUPATION_LABEL: Record<Occupation, string> = {
  company_employee: "会社員",
  executive: "経営者・役員",
  public_servant: "公務員",
  medical: "医療系",
  it: "IT・エンジニア",
  creative: "クリエイティブ",
  finance: "金融",
  student: "学生",
  other: "その他",
};

/** enum 職種を日本語ラベルにする。未知/未設定は null。 */
export function occupationLabel(
  occupation: Occupation | null | undefined
): string | null {
  if (!occupation) return null;
  return OCCUPATION_LABEL[occupation] ?? null;
}

/**
 * 成立詳細(#14)に出す「職業表示文字列」を解決する。
 *  - 自由入力(occupationText)があればそれを優先(#6 の方針: 新規は自由入力)。
 *  - 無ければ enum occupation を日本語化(後方互換: 旧データ)。
 *  - どちらも無ければ null。
 */
export function resolveOccupationDisplay(input: {
  occupationText: string | null | undefined;
  occupation: Occupation | null | undefined;
}): string | null {
  const text = sanitizeOccupationText(input.occupationText ?? null);
  if (text) return text;
  return occupationLabel(input.occupation ?? null);
}
