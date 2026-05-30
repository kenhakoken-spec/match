// =============================================================================
// POST /api/payments/confirm — （モック）支払い成功化 (S4 契約§3)
// 成立確定後の確定課金（capture→succeeded）に対応。
// IDOR防止: 自分の Payment のみ confirm 可（セッション sub と userId 一致）。
// 正典: docs/backend/api-contract-s4.md §3 / docs/backend/payment.md §1
// =============================================================================

import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { confirmPayment, toPaymentDTO } from "@/lib/payment-service";
import type { PaymentConfirmResponse } from "@/lib/payment-types";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  paymentId: z.string().min(1, "paymentId is required").max(64),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { paymentId } = confirmSchema.parse(body);

    const result = await confirmPayment(user.id, paymentId);
    if (result.error) {
      switch (result.error) {
        case "not_found":
          return jsonError(404, "payment_not_found", "payment not found");
        case "forbidden":
          // 他人の Payment 操作。存在は漏らさず 403。
          return jsonError(403, "forbidden", "not your payment");
        case "not_confirmable":
          return jsonError(409, "not_confirmable", "payment cannot be confirmed");
      }
    }
    const payload: PaymentConfirmResponse = { payment: toPaymentDTO(result.payment!) };
    return jsonOk(payload, 200);
  });
}
