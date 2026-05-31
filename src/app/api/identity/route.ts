// /api/identity — 本人認証
//   POST: 認証申請(status=pending化、却下後の再申請も)。Req { docType, blobRef }
//         → **AI(Haiku)一次判定は同期で呼ばない**（トリガー駆動へ再設計・spec 要望2）。
//           提出は pending・aiVerdict=null で受けるだけ。判定は外部トリガージョブ
//           （tools/ai-identity-trigger.mjs）が「判定待ちキュー」を取得→判定→
//           /api/admin/identity/[id]/ai-verdict へ書き戻し、サーバ側で18+安全弁付き自動承認。
//         Res { status, aiVerdict }
//   GET : 自分の認証状態。{ status, rejectReason } | null
// 本人のみ(IDOR防止: userId はセッション由来)。契約§2 / S8 要望2。
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
    // 提出のみ（status=pending）。AI 一次判定はここでは行わない＝トリガー駆動。
    // 却下後の再申請も同じ行を上書きし、aiVerdict は submit 側で null にリセットされる
    // （再提出は新たに判定待ちキューへ載る）。
    const iv = await repo.identities.submit({
      userId: authed.id,
      docType: input.docType,
      blobRef: input.blobRef,
    });

    // この時点では未判定（トリガーが後で書き戻す）。
    return jsonOk({ status: iv.status, aiVerdict: iv.aiVerdict ?? null });
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
