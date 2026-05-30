// =============================================================================
// GET /api/applications — 自分の応募一覧(U-07)。
// 契約: docs/backend/api-contract-s2.md §2。
//   Res: { items: Array<{ slot: SlotDTO; status }> }
// 認証必須。**自分の応募のみ**(セッションの sub で解決, IDOR防止)。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toSlotDTO } from "@/lib/serializers";
import type { ApplicationListItem } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    const apps = await repo.applications.listByUser(me.id);
    const items: ApplicationListItem[] = [];
    for (const app of apps) {
      const slot = await repo.slots.findById(app.slotId);
      if (!slot) continue; // 枠が消えた応募はスキップ(整合防御)。
      const counts = await repo.applications.countActiveByGender(slot.id);
      items.push({ slot: toSlotDTO(slot, counts), status: app.status });
    }
    return jsonOk({ items });
  });
}
