// =============================================================================
// POST /api/admin/venues/suggest — 成立枠の会場候補を生成し運営へ通知する。
//   要望2: エリア×人数(6名)で合コン向きの店候補をリストアップ → 食べログ/Google点
//   併記 → 合コン向き度(fitScore)でソート → 運営へ通知（殿が選んで予約）。
//   role=admin を **サーバ側で** 検証（requireAdmin）。
//
//   実食べログ/Google API は未接続のため **モックrecommender**（決定的）で生成する。
//   実API接続時は venue-service.recommendVenues の中身のみ差し替える（署名不変）。
//
//   冪等: 既にその枠へ候補があれば再生成・再通知しない（created/notified=0）。
//   - slotId 必須（無 → 400）。
//   - 枠が存在しない → 404。
//   Req: { slotId: string }
//   Res: { items: VenueCandidateDTO[], created: number, notified: number }
//
// 注: 通常は **成立検知時に自動 suggest** される（finalize 経路）。本エンドポイントは
//     運営が手動で（再）生成したいときの入口。自動・手動とも同じ service 関数を通す。
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { suggestVenuesForSlot } from "@/lib/venue-service";
import { toVenueCandidateDTO } from "@/lib/serializers";
import type { VenueCandidateDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const suggestSchema = z.object({
  slotId: z.string().min(1, "slotId is required").max(64),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(async () => {
    const admin = await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const { slotId } = suggestSchema.parse(body); // 不正は handle が 400 に変換。

    const result = await suggestVenuesForSlot(slotId, admin.id);
    // service は枠が無いと candidates 空・created 0 を返す → route で 404 に正規化。
    if (result.candidates.length === 0 && result.created === 0) {
      return jsonError(404, "not_found", "slot not found or no candidates");
    }

    const items: VenueCandidateDTO[] = result.candidates.map(toVenueCandidateDTO);
    return jsonOk({
      items,
      created: result.created,
      notified: result.notified,
    });
  });
}
