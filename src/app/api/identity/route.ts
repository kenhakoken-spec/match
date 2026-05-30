// /api/identity — 本人認証
//   POST: 認証申請(status=pending化、却下後の再申請も)。Req { docType, blobRef } → { status:"pending" }
//   GET : 自分の認証状態。{ status, rejectReason } | null
// 本人のみ(IDOR防止: userId はセッション由来)。契約§2。
import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { identitySubmitSchema } from "@/lib/validation";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const authed = await requireUser();
    const body = await req.json().catch(() => ({}));
    const input = identitySubmitSchema.parse(body);

    const repo = getRepo();
    // userId はセッション由来。申請者本人以外の identity は作れない。
    const iv = await repo.identities.submit({
      userId: authed.id,
      docType: input.docType,
      blobRef: input.blobRef,
    });
    return jsonOk({ status: iv.status });
  });
}

export async function GET() {
  return handle(async () => {
    const authed = await requireUser();
    const repo = getRepo();
    const iv = await repo.identities.findByUserId(authed.id);
    if (!iv) return jsonOk(null);
    return jsonOk({ status: iv.status, rejectReason: iv.reviewNote });
  });
}
