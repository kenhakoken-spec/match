// GET /api/admin/identity?status=pending — 審査キュー一覧。admin のみ(403ガード)。
// 契約§2: Res { items: [{ id, userId, docType, blobRef, submittedAt }] }。
import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import type { IdentityStatus, AdminIdentityItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: IdentityStatus[] = ["pending", "approved", "rejected"];

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(); // role=admin をサーバ側で検証(未認可は403)

    const statusParam = req.nextUrl.searchParams.get("status") ?? "pending";
    const status: IdentityStatus = STATUSES.includes(statusParam as IdentityStatus)
      ? (statusParam as IdentityStatus)
      : "pending";

    const repo = getRepo();
    const rows = await repo.identities.listByStatus(status);
    const items: AdminIdentityItem[] = rows.map((iv) => ({
      id: iv.id,
      userId: iv.userId,
      docType: iv.docType,
      blobRef: iv.blobRef, // approved 済みは null(画像削除済)
      submittedAt: iv.submittedAt.toISOString(),
    }));
    return jsonOk({ items });
  });
}
