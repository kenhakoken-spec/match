// =============================================================================
// GET /api/slots/[id] — 枠詳細 + 自分の応募可否(eligibility) + 応募状態。
// 契約: docs/backend/api-contract-s2.md §2。Res: { slot: SlotDetailDTO }
// 認証必須。eligibility は **サーバ側で** evaluateEligibility(純関数)で算出。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toSlotDetailDTO } from "@/lib/serializers";
import { buildSlotContext } from "@/lib/slot-service";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    const slot = await repo.slots.findById(params.id);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    const ctx = await buildSlotContext(slot, me.id);
    return jsonOk({
      slot: toSlotDetailDTO(slot, ctx.counts, ctx.myApplication, {
        canApply: ctx.eligibility.canApply,
        reasons: ctx.eligibility.reasons,
      }),
    });
  });
}
