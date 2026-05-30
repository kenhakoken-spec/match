// =============================================================================
// POST /api/admin/badges/revoke — (admin) 優良バッジ取消(契約§2)。
//   Req: { userId: string }  Res: BadgeMutationResultDTO
// admin 必須。冪等: 元々未保有なら outcome=absent(200)。
// =============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { adminRevokePremium } from "@/lib/badge-service";

export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  userId: z.string().min(1, "userId is required").max(128),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin(); // admin 必須。
    const body = await req.json().catch(() => ({}));
    const { userId } = revokeSchema.parse(body);
    const result = await adminRevokePremium(userId);
    return jsonOk(result);
  });
}
