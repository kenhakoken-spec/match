// =============================================================================
// GET /api/matches/[id] — 成立詳細（会場情報）。
// 契約: docs/backend/api-contract-s3.md §3。Res: { match: MatchDetailDTO }
//
// セキュリティ（IDOR防止の要 / 契約§3）:
//  - **参加者のときのみ** 返す。非参加者には存在も漏らさないため 404 を返す
//    （列挙攻撃で他人の成立の有無を観測されないようにする）。
//  - 会場(venue)は **notified 後のみ** 返す（notified 前は null = 会場手配中）。
//  - members は displayName/gender のみ（lineUserId は **絶対に** 出さない）。
//  - 参加判定はセッションの sub で解決し、URL の id を信用しない。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toMatchDetailDTO } from "@/lib/serializers";
import { getMatchMembers, isMatchParticipant } from "@/lib/match-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    const match = await repo.matches.findById(params.id);
    if (!match) {
      return jsonError(404, "not_found", "match not found");
    }

    // IDOR防止: 参加者でなければ存在を漏らさず 404。
    const participant = await isMatchParticipant(match.slotId, me.id);
    if (!participant) {
      return jsonError(404, "not_found", "match not found");
    }

    const slot = await repo.slots.findById(match.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    const members = await getMatchMembers(match.slotId);
    // toMatchDetailDTO が notified 後のみ venue を入れる（段階制御）。
    return jsonOk({ match: toMatchDetailDTO(match, slot, members) });
  });
}
