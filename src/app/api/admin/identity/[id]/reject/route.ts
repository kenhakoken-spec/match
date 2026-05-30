// POST /api/admin/identity/[id]/reject — 却下(理由必須)。admin のみ(403ガード)。
// 契約§2: Req { reason } → { status:"rejected" }。通知はモック記録。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { rejectSchema } from "@/lib/validation";
import { getRepo } from "@/lib/repo";
import { logNotificationMock } from "@/lib/notify-mock";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const input = rejectSchema.parse(body); // reason 必須(空は400)

    const repo = getRepo();
    const iv = await repo.identities.reject(params.id, admin.id, input.reason);
    if (!iv) {
      return jsonError(404, "not_found", "identity verification not found");
    }
    logNotificationMock({ userId: iv.userId, type: "identity_rejected" });
    return jsonOk({ status: iv.status });
  });
}
