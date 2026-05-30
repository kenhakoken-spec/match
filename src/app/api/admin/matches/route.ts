// =============================================================================
// GET /api/admin/matches — 成立一覧（pending_venue / venue_set / notified）。
// 契約: docs/backend/api-contract-s3.md §2。role=admin を **サーバ側で** 検証。
//   Res: { items: AdminMatchSummaryDTO[] }（matchedAt 降順）
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toAdminMatchSummaryDTO } from "@/lib/serializers";
import type { AdminMatchSummaryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin(); // admin 必須（role をDBで再検証）

    const repo = getRepo();
    // 既定: pending_venue / venue_set / notified（canceled 除外）。
    const matches = await repo.matches.list();

    const items: AdminMatchSummaryDTO[] = [];
    for (const m of matches) {
      const slot = await repo.slots.findById(m.slotId);
      if (!slot) continue; // 枠が消えた成立はスキップ（整合防御）。
      const counts = await repo.applications.countActiveByGender(m.slotId);
      items.push(toAdminMatchSummaryDTO(m, slot, counts));
    }

    return jsonOk({ items });
  });
}
