// =============================================================================
// GET /api/admin/matches/[id] — 成立詳細（6名のプロフィール要約 + 枠情報 + 会場）。
// 契約: docs/backend/api-contract-s3.md §2。role=admin を **サーバ側で** 検証。
//   Res: { match: AdminMatchDetailDTO }
// PII最小: members は displayName/gender のみ（lineUserId は出さない）。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toAdminMatchDetailDTO } from "@/lib/serializers";
import { getMatchMembers } from "@/lib/match-service";

export const dynamic = "force-dynamic";

export async function GET(
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
    const slot = await repo.slots.findById(match.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    const [counts, members] = await Promise.all([
      repo.applications.countActiveByGender(match.slotId),
      getMatchMembers(match.slotId),
    ]);

    return jsonOk({
      match: toAdminMatchDetailDTO(match, slot, counts, members),
    });
  });
}
