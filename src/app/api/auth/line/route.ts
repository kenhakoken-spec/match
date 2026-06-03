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
import { isAdminLineUserId } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = lineLoginSchema.parse(body);

    // モード別検証。モック有効(非production既定)=sub信頼 / モック無効(本番)=LINE verify API。
    // 検証不能(Channel ID 未設定/通信失敗)は LineVerificationUnavailableError → 503。
    const verified = await verifyLineIdToken(parsed.idToken);
    if (!verified) {
      return jsonError(401, "invalid_token", "invalid id token");
    }

    const repo = getRepo();
    const user = await repo.users.upsertByLineUserId({
      lineUserId: verified.lineUserId,
      displayName: verified.displayName ?? undefined,
      // role はDBでは昇格させない(権限昇格防止)。admin はenv許可リストで判定する。
    });

    // S12 #17: ADMIN_LINE_USER_IDS に含まれる運営は admin セッションにする。
    // DB role は user のまま・許可リスト外は絶対 admin にならない(フェイルクローズ)。
    const sessionRole =
      user.role === "admin" || isAdminLineUserId(verified.lineUserId) ? "admin" : user.role;

    setSessionCookie({ sub: user.id, role: sessionRole });
    // lineUserId はレスポンスに出さない(toMeUser が保証)。
    return jsonOk({ user: toMeUser(user) });
  });
}
