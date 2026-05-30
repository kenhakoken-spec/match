// src/app/_lib/public-ui.ts — S8 公開(プレビュー)画面の表示ヘルパ。
// 職種(Occupation)の日本語ラベルと、多軸評価の軸定義。事実情報のみ(PIIなし)。
import type { Occupation } from "@/lib/types";

export const OCCUPATION_LABELS: Record<Occupation, string> = {
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

export function occupationLabel(occupation: Occupation | null): string {
  return occupation ? OCCUPATION_LABELS[occupation] : "職種非公開";
}
