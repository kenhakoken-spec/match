// =============================================================================
// GET /api/admin/venues?slotId=... — 成立枠の会場候補一覧（fitScore 降順）。
//   要望2: 各候補に 食べログ点数・Google点数 を併記し、合コン向き度でソート。
//   role=admin を **サーバ側で** 検証（requireAdmin）。
//   - slotId 必須（無 → 400）。
//   - 枠が存在しない → 404。
//   Res: { items: VenueCandidateDTO[] }（fitScore 降順、null は末尾）
// PII方針: 会場候補は店舗の運用情報のみ（個人情報を含まない）。
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { listVenueCandidatesForSlot } from "@/lib/venue-service";
import { toVenueCandidateDTO } from "@/lib/serializers";
import type { VenueCandidateDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();

    const slotId = new URL(req.url).searchParams.get("slotId");
    if (!slotId) {
      return jsonError(400, "validation_error", "slotId is required");
    }

    const candidates = await listVenueCandidatesForSlot(slotId);
    if (candidates === null) {
      return jsonError(404, "not_found", "slot not found");
    }

    const items: VenueCandidateDTO[] = candidates.map(toVenueCandidateDTO);
    return jsonOk({ items });
  });
}
