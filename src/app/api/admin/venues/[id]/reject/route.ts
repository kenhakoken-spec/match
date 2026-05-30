// =============================================================================
// POST /api/admin/venues/[id]/reject — 候補を却下(rejected)する。
//   要望2: 運営が候補を選択肢から外す。suggested のものだけ却下できる。
//   role=admin を **サーバ側で** 検証（requireAdmin）。
//   - 候補が無い → 404。
//   - 候補が suggested 以外（既に chosen/rejected）→ 409 candidate_not_suggestable。
//   Res: { candidate: VenueCandidateDTO }
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { rejectVenueCandidate } from "@/lib/venue-service";
import { toVenueCandidateDTO } from "@/lib/serializers";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();

    const result = await rejectVenueCandidate(params.id);
    if (result.error === "candidate_not_found") {
      return jsonError(404, "not_found", "venue candidate not found");
    }
    if (result.error === "candidate_not_suggestable") {
      return jsonError(
        409,
        "candidate_not_suggestable",
        "candidate is not in suggested state"
      );
    }
    if (!result.candidate) {
      return jsonError(500, "internal_error", "venue reject failed");
    }

    return jsonOk({ candidate: toVenueCandidateDTO(result.candidate) });
  });
}
