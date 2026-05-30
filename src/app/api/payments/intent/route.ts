// =============================================================================
// POST /api/payments/intent — 自分の成立枠への決済 intent 作成 (S4 契約§3)
// - computeFee で非課金（女性/男性初回）なら即「確定」レスポンス（clientSecret=null）。
// - 課金（男性2回目+）のみ PaymentIntent を発行し client_secret を返す。
// - IDOR防止: 参加者本人のみ（セッション sub）。他人/枠の Payment は作れない。
// 正典: docs/backend/api-contract-s4.md §3 / docs/backend/payment.md §1
// =============================================================================

import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { createIntentForSlot } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

const intentSchema = z.object({
  slotId: z.string().min(1, "slotId is required").max(64),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { slotId } = intentSchema.parse(body);

    // 課金/参加者解決はセッションの sub で行う（body の userId は受け取らない＝IDOR防止）。
    const result = await createIntentForSlot(user.id, slotId);
    if (result.error) {
      switch (result.error) {
        case "slot_not_found":
          return jsonError(404, "slot_not_found", "slot not found");
        case "not_participant":
          // 参加者でない=他人の枠への課金試行。存在は漏らさず 403。
          return jsonError(403, "forbidden", "not a participant of this slot");
        case "no_profile":
          return jsonError(409, "profile_required", "profile is required");
        default: {
          // 網羅性チェック（未知 error が増えたらコンパイルエラーで気付く）。
          const _exhaustive: never = result.error;
          void _exhaustive;
          return jsonError(500, "internal_error", "internal server error");
        }
      }
    }
    return jsonOk(result.response, 200);
  });
}
