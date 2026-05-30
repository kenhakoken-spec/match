// =============================================================================
// POST /api/admin/badges/grant — (admin) 優良バッジ手動付与(契約§2)。
//   Req: { userId: string }  Res: BadgeMutationResultDTO
// admin 必須。冪等: 既に保有なら outcome=already(再付与しない・200)。
// =============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { adminGrantPremium } from "@/lib/badge-service";

export const dynamic = "force-dynamic";

const grantSchema = z.object({
  userId: z.string().min(1, "userId is required").max(128),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const admin = await requireAdmin(); // admin 必須。
    const body = await req.json().catch(() => ({}));
    const { userId } = grantSchema.parse(body);

    // 対象ユーザーの存在確認(読み取りのみ)。存在しない userId への付与は 404。
    const repo = getRepo();
    const target = await repo.users.findById(userId);
    if (!target) {
      return jsonError(404, "user_not_found", "target user not found");
    }

    const result = await adminGrantPremium(userId, admin.id);
    return jsonOk(result);
  });
}
