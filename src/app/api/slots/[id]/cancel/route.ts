// =============================================================================
// POST /api/slots/[id]/cancel — 自分の応募を取消(締切前/未成立=open かつ applied のみ)。
// 契約: docs/backend/api-contract-s2.md §2。Res: { application: { status: "canceled" } }
//
// セキュリティ: IDOR防止のため取消対象は **セッションの sub** で所有者解決。
// 他人の応募は取消不可(repo.cancelOwn が forbidden を返す)。締切後/成立後は不可。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    // この枠における「自分の応募」を解決(URL の slot id + セッション user)。
    const myApp = await repo.applications.findBySlotAndUser(params.id, me.id);
    if (!myApp) {
      return jsonError(404, "not_found", "application not found");
    }

    // 所有者解決済みの application id で取消(cancelOwn が再度所有者一致を保証)。
    const result = await repo.applications.cancelOwn(myApp.id, me.id);
    if (result.error === "not_found") {
      return jsonError(404, "not_found", "application not found");
    }
    if (result.error === "forbidden") {
      // 他人の応募(IDOR)。
      return jsonError(403, "forbidden", "cannot cancel others' application");
    }
    if (result.error === "not_cancelable") {
      return jsonError(409, "not_cancelable", "application can no longer be canceled");
    }

    return jsonOk({ application: { status: result.application!.status } });
  });
}
