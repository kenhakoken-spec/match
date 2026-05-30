// =============================================================================
// POST /api/admin/matches/[id]/venue — 会場入力 → Match.status=venue_set。
// 契約: docs/backend/api-contract-s3.md §2。role=admin を **サーバ側で** 検証。
//   Req: { venueName, venueUrl?, reservationName, meetingPlace? }（venueName/reservationName 必須）
//   Res: { match: AdminMatchDetailDTO }
// 入力は zod 検証＋サニタイズ。venueUrl は http(s) のみ許可（XSS スキーム対策）。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { setVenueSchema } from "@/lib/validation";
import { toAdminMatchDetailDTO } from "@/lib/serializers";
import { getMatchMembers } from "@/lib/match-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();

    const repo = getRepo();
    const match = await repo.matches.findById(params.id);
    if (!match) {
      return jsonError(404, "not_found", "match not found");
    }
    if (match.status === "notified") {
      // 通知後の会場変更はこのエンドポイントでは扱わない（運用上の事故防止）。
      return jsonError(409, "already_notified", "match already notified");
    }
    if (match.status === "canceled") {
      return jsonError(409, "match_canceled", "match is canceled");
    }

    const body = await req.json().catch(() => ({}));
    const input = setVenueSchema.parse(body); // 不正は handle が 400 に変換

    const updated = await repo.matches.setVenue(match.id, {
      venueName: input.venueName,
      venueUrl: input.venueUrl ?? null,
      reservationName: input.reservationName,
      meetingPlace: input.meetingPlace ?? null,
    });
    if (!updated) {
      return jsonError(404, "not_found", "match not found");
    }

    const slot = await repo.slots.findById(updated.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }
    const [counts, members] = await Promise.all([
      repo.applications.countActiveByGender(updated.slotId),
      getMatchMembers(updated.slotId),
    ]);

    return jsonOk({
      match: toAdminMatchDetailDTO(updated, slot, counts, members),
    });
  });
}
