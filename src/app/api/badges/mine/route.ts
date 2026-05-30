// =============================================================================
// GET /api/badges/mine — 自分のバッジ一覧 + 未取得時の進捗(契約§2)。
//   Res: { badges: BadgeDTO[], progress: BadgeProgressDTO }
// 認証必須。**本人のみ**(セッションの sub で解決 = IDOR防止。body/URL の userId は信用しない)。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getMyBadges } from "@/lib/badge-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser(); // 本人のみ。
    const data = await getMyBadges(me.id);
    return jsonOk(data);
  });
}
