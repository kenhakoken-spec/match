// =============================================================================
// matching-app — GET /api/ratings/pending（評価可能イベント + 未評価の同席者）
// 契約: api-contract-s5.md §2。自分が accepted 参加した done Slot の未評価同席者のみ。
// IDOR: 対象ユーザーは常にセッションの sub（requireUser）。
// =============================================================================

import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { listPendingRatings } from "@/lib/rating-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const pending = await listPendingRatings(user.id);
    return jsonOk(pending);
  });
}
