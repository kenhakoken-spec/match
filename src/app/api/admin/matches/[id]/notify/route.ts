// =============================================================================
// POST /api/admin/matches/[id]/notify — 6名へ会場通知 → Match.status=notified,
//   Slot.status=confirmed。契約: docs/backend/api-contract-s3.md §2。
// role=admin を **サーバ側で** 検証。
//   - notify は **会場入力済(venue_set)** のときのみ可。未入力(pending_venue)は 409。
//   - 既に notified なら 409（冪等: 二重送信しない / notification.md §3）。
//   - 発火で **6名分の NotificationLog(type=venue_to_member, status=sent[mock])** を作成。
//   Res: { match: AdminMatchDetailDTO, notified: number }
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toAdminMatchDetailDTO } from "@/lib/serializers";
import { notifyMatchMembers, getMatchMembers } from "@/lib/match-service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();

    const repo = getRepo();
    const match = await repo.matches.findById(params.id);
    if (!match) {
      return jsonError(404, "not_found", "match not found");
    }

    // 会場未入力（pending_venue）では通知不可（契約§2: 未入力なら 409）。
    if (match.status === "pending_venue") {
      return jsonError(409, "venue_not_set", "venue must be set before notifying");
    }
    // 既に通知済みは冪等にエラー（二重送信防止 / notification.md §3）。
    if (match.status === "notified") {
      return jsonError(409, "already_notified", "match already notified");
    }
    if (match.status === "canceled") {
      return jsonError(409, "match_canceled", "match is canceled");
    }
    // 防御: venueName/reservationName が無い venue_set は不整合 → 409。
    if (!match.venueName || !match.reservationName) {
      return jsonError(409, "venue_not_set", "venue is incomplete");
    }

    const slot = await repo.slots.findById(match.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    // 6名へ venue_to_member 送信 + Match=notified + Slot=confirmed。
    const { notified } = await notifyMatchMembers(match, slot);

    // 更新後の状態で詳細を返す。
    const refreshed = await repo.matches.findById(match.id);
    const [counts, members] = await Promise.all([
      repo.applications.countActiveByGender(match.slotId),
      getMatchMembers(match.slotId),
    ]);

    return jsonOk({
      match: toAdminMatchDetailDTO(refreshed ?? match, slot, counts, members),
      notified,
    });
  });
}
