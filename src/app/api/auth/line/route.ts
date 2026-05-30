// POST /api/auth/line — LIFF IDトークン検証→User upsert→セッション。
// 契約§2: MOCK時は idToken 内の sub をそのまま信頼。Req { idToken } → Res { user } + Cookie。
// SEC-002: 実モード(本番)で実検証が未実装なら verifyLineIdToken が throw し、
//   黙ってモック検証にフォールバックしない(なりすまし防止)→ handle が 503 に変換。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { lineLoginSchema } from "@/lib/validation";
import { verifyLineIdToken } from "@/lib/auth/line-mock";
import { setSessionCookie } from "@/lib/auth/session";
import { getRepo } from "@/lib/repo";
import { toMeUser } from "@/lib/serializers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = lineLoginSchema.parse(body);

    // モード別検証。モック有効(非production既定)=sub信頼 / モック無効(本番)=実検証。
    // 本番で実検証未実装の場合は LineVerificationUnavailableError が投げられる。
    const verified = verifyLineIdToken(parsed.idToken);
    if (!verified) {
      return jsonError(401, "invalid_token", "invalid id token");
    }

    const repo = getRepo();
    const user = await repo.users.upsertByLineUserId({
      lineUserId: verified.lineUserId,
      displayName: verified.displayName ?? undefined,
      // role はここで付与しない(常に既定user。admin昇格はseed/DB直のみ)。
    });

    setSessionCookie({ sub: user.id, role: user.role });
    // lineUserId はレスポンスに出さない(toMeUser が保証)。
    return jsonOk({ user: toMeUser(user) });
  });
}
