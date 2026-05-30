// =============================================================================
// matching-app — S5/S8 評価 request スキーマ（contract §2 / s8_spec 要望4-5）。
// 共有 validation.ts には追記せず、評価専用ファイルで完結（並行実装の鉄則）。
//
// S5: 単一 score(1..5) + comment(最大300・サニタイズ)。
// S8: 多軸 3軸（また会いたい/会話/マナー 各1..5）+ noShowReport(来なかった報告)。
//     score は廃止せず、後方互換のため 3軸の総合(overall)の丸めで route 側が埋める。
// =============================================================================

import { z } from "zod";
import { sanitizeText } from "@/lib/validation";

/** 1..5 整数の評価軸スコア（範囲外・非整数は domain でも再検証＝二重防御）。 */
const axisScoreSchema = z
  .number()
  .int()
  .min(1, "score must be 1..5")
  .max(5, "score must be 1..5");

/** 任意コメント（サニタイズ後に最大300・契約§0）。 */
const commentSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(300, "comment too long"))
  .optional()
  .nullable();

/**
 * S8 多軸評価の送信スキーマ（POST /api/ratings）。
 * body: { slotId, rateeId, scoreAgain, scoreTalk, scoreManner, comment?, noShowReport? }。
 * - 各軸 1..5 整数。
 * - noShowReport: この rater が ratee を「来なかった」と報告するか（既定 false）。
 * - 旧 score は受け取らない（総合は 3軸から算出して保存時に埋める＝後方互換）。
 */
export const submitRatingSchema = z.object({
  slotId: z.string().min(1, "slotId is required").max(64),
  rateeId: z.string().min(1, "rateeId is required").max(64),
  scoreAgain: axisScoreSchema,
  scoreTalk: axisScoreSchema,
  scoreManner: axisScoreSchema,
  comment: commentSchema,
  // ドタキャン（当日キャンセル/無断欠席）報告。2人以上で no-show 確定（誤報防止）。
  noShowReport: z.boolean().optional().default(false),
});
export type SubmitRatingRequest = z.infer<typeof submitRatingSchema>;
