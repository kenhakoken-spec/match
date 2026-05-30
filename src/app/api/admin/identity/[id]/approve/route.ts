// POST /api/admin/identity/[id]/approve — 承認。admin のみ(403ガード)。
// **承認時に画像削除: blobRef=null, imageDeletedAt=now**(PII最小保持 / master_plan §8,§9)。
// 通知は MOCK_NOTIFY=1 のとき NotificationLog 相当を記録(実送信しない)。契約§2。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { logNotificationMock } from "@/lib/notify-mock";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    const admin = await requireAdmin();
    const repo = getRepo();

    const iv = await repo.identities.approve(params.id, admin.id);
    if (!iv) {
      return jsonError(404, "not_found", "identity verification not found");
    }
    // 通知(モック): 承認お知らせ。実送信しない。
    logNotificationMock({ userId: iv.userId, type: "identity_approved" });
    // blobRef は repo.approve 内で null 化済み(画像削除)。
    return jsonOk({ status: iv.status });
  });
}
