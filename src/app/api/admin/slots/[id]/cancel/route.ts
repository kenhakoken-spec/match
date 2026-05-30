// =============================================================================
// POST /api/admin/slots/[id]/cancel — 運営による枠の中止(status=canceled)。
// 契約: docs/backend/api-contract-s2.md §3。role=admin を **サーバ側で** 検証。
// 中止後の決済cancel/返金・通知は S3/S4(本タスク範囲外)。ここでは状態のみ canceled に。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toSlotDTO } from "@/lib/serializers";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();
    const repo = getRepo();

    const slot = await repo.slots.findById(params.id);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }
    if (slot.status === "canceled") {
      return jsonError(409, "already_canceled", "slot is already canceled");
    }
    if (slot.status === "done") {
      return jsonError(409, "not_cancelable", "completed slot cannot be canceled");
    }

    const updated = await repo.slots.setStatus(slot.id, "canceled");
    const counts = await repo.applications.countActiveByGender(slot.id);
    return jsonOk({ slot: toSlotDTO(updated!, counts) });
  });
}
