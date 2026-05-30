// =============================================================================
// matching-app — GET /api/ratings/received/summary（自分の受領評価サマリ）
// 契約: api-contract-s5.md §2。{ avg, count }。IDOR: 自分の集計のみ（セッション sub）。
// =============================================================================

import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getReceivedSummary } from "@/lib/rating-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const summary = await getReceivedSummary(user.id);
    return jsonOk(summary);
  });
}
