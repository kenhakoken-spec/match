// =============================================================================
// matching-app — S5 評価 request スキーマ（contract §2）。
// 共有 validation.ts には追記せず、S5 専用ファイルで完結（並行実装の鉄則）。
// score は 1..5 整数、comment は最大300・サニタイズ（XSS/制御文字対策）。
// =============================================================================

import { z } from "zod";
import { sanitizeText } from "@/lib/validation";

export const submitRatingSchema = z.object({
  slotId: z.string().min(1, "slotId is required").max(64),
  rateeId: z.string().min(1, "rateeId is required").max(64),
  // 1..5 の整数。範囲外・非整数は domain でも再検証する（二重防御）。
  score: z.number().int().min(1, "score must be 1..5").max(5, "score must be 1..5"),
  // 任意コメント。サニタイズ後に最大300（契約§0）。
  comment: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300, "comment too long"))
    .optional()
    .nullable(),
});
export type SubmitRatingRequest = z.infer<typeof submitRatingSchema>;
