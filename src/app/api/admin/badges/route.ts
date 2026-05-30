// =============================================================================
// GET /api/admin/badges — (admin) バッジ付与状況一覧(契約§2 A-10)。
//   Res: { items: AdminBadgeRowDTO[] }(grantedAt 降順)
// admin 必須(requireAdmin で role をサーバ側再検証)。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { listAdminBadges } from "@/lib/badge-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin(); // admin 必須。
    const items = await listAdminBadges();
    return jsonOk({ items });
  });
}
