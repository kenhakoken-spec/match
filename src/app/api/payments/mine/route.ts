// =============================================================================
// GET /api/payments/mine — 自分の決済履歴 (S4 契約§3)
// IDOR防止: セッション sub の決済のみ返す。他人の履歴は返さない。
// PII: client_secret/カード情報は含めない（PaymentDTO は機微情報を落とす）。
// 正典: docs/backend/api-contract-s4.md §3 / docs/backend/payment.md §6
// =============================================================================

import { requireUser } from "@/lib/auth/guard";
import { handle, jsonOk } from "@/lib/http";
import { listMyPayments, toPaymentDTO } from "@/lib/payment-service";
import type { PaymentListResponse } from "@/lib/payment-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await listMyPayments(user.id);
    const payload: PaymentListResponse = { payments: rows.map(toPaymentDTO) };
    return jsonOk(payload, 200);
  });
}
