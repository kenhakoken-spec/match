// /api/identity — 本人認証
//   POST: 認証申請(status=pending化、却下後の再申請も)。Req { docType, blobRef }
//         → AI(Haiku)一次判定を実行し、明白OKは自動承認。{ status, aiVerdict }
//   GET : 自分の認証状態。{ status, rejectReason } | null
// 本人のみ(IDOR防止: userId はセッション由来)。契約§2 / S8 要望2。
import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { identitySubmitSchema } from "@/lib/validation";
import { getRepo } from "@/lib/repo";
import { sendNotification } from "@/lib/notify-mock";
import { verifyIdentityImage } from "@/lib/haiku-verify";
import { isAdult } from "@/lib/domain/age";
import type { IdentityAiVerdict } from "@/lib/types";

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

    // --- S8 要望2: AI(Haiku)一次判定 → 明白OKは自動承認 ---
    // 18+ 判定には生年月日(=Profile)が要る。プロフィール未作成や AI 不可時でも
    // 安全側(pending 据え置き=自動承認しない)に倒す。
    const profile = await repo.profiles.findByUserId(authed.id);

    let aiVerdict: IdentityAiVerdict | null = null;
    let finalStatus = iv.status; // 既定は pending(自動承認しない限りこのまま)。

    if (profile) {
      // 判定(構造化データのみ。blobRef/秘密値はログ・レスポンスに出さない)。
      const ai = await verifyIdentityImage({
        docType: input.docType,
        blobRef: input.blobRef,
        birthdate: profile.birthdate,
      });
      aiVerdict = ai.verdict;

      // 判定根拠を必ず記録(監査)。status はここでは変えない=判定と承認を分離。
      await repo.identities.setAiVerdict(iv.id, ai.verdict, ai.reason);

      // 明白OK のみ自動承認。ただし **年齢の安全弁**: AI が ok でも
      // サーバ側で 18+ を二重チェックし、18未満なら絶対に承認しない。
      if (ai.verdict === "ok" && isAdult(profile.birthdate, new Date())) {
        const approved = await repo.identities.approve(iv.id, "ai");
        if (approved) {
          finalStatus = approved.status; // "approved"
          // 自動承認も申請者へ通知(運営承認時と同じ identity_approved)。
          // payload は運用情報のみ(PII/画像/秘密値は入れない)。
          await sendNotification({
            userId: approved.userId,
            type: "identity_approved",
            slotId: null,
            matchId: null,
            payload: { reviewedBy: "ai" },
          });
        }
      }
      // review / ng は pending のまま運営確認(ng は運営が reject 操作で却下)。
    }
    // プロフィール未作成(birthdate 不明)は AI 判定せず pending 据え置き。

    return jsonOk({ status: finalStatus, aiVerdict });
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
