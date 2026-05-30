// =============================================================================
// GET /api/matches/mine — 自分が参加する成立の一覧。
// 契約: docs/backend/api-contract-s3.md §3。Res: { items: MatchSummaryDTO[] }
// 認証必須。**自分が参加者の成立のみ**（セッションの sub で解決 = IDOR防止）。
// 会場の中身は一覧では返さない（確定有無のみ）。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toMatchSummaryDTO } from "@/lib/serializers";
import type { MatchSummaryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    // 自分の有効応募（applied/accepted）が属する枠の成立だけを集める。
    const myApps = await repo.applications.listByUser(me.id);
    const items: MatchSummaryDTO[] = [];
    const seen = new Set<string>();
    for (const app of myApps) {
      if (app.status !== "applied" && app.status !== "accepted") continue;
      const match = await repo.matches.findBySlotId(app.slotId);
      if (!match) continue; // まだ成立していない応募はスキップ。
      if (match.status === "canceled") continue; // 中止は出さない。
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      const slot = await repo.slots.findById(match.slotId);
      if (!slot) continue;
      items.push(toMatchSummaryDTO(match, slot));
    }

    return jsonOk({ items });
  });
}
