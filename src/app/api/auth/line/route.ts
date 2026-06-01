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

    // --- 一時デバッグ（値・PIIは出さない。長さ/有無/先頭種別のみ）。原因切り分け用。 ---
    // LINE同意→戻り後の 400/401 が「idToken未達」か「検証失敗」かを Vercel logs で判別する。
    const rawToken =
      body && typeof body === "object" && typeof (body as { idToken?: unknown }).idToken === "string"
        ? ((body as { idToken: string }).idToken)
        : "";
    const dots = rawToken.split(".").length; // JWTなら3
    console.log(
      `[auth/line] idToken present=${rawToken.length > 0} len=${rawToken.length} segs=${dots} mockAuth=${process.env.MOCK_AUTH ?? "unset"} channelIdSet=${(process.env.LINE_LOGIN_CHANNEL_ID ?? "").length > 0}`,
    );

    const parsed = lineLoginSchema.parse(body);

    // モード別検証。モック有効(非production既定)=sub信頼 / モック無効(本番)=LINE verify API。
    // 検証不能(Channel ID 未設定/通信失敗)は LineVerificationUnavailableError → 503。
    let verified;
    try {
      verified = await verifyLineIdToken(parsed.idToken);
    } catch (e) {
      // 検証経路の例外を可視化（メッセージのみ・トークン値は出さない）。
      console.log(
        `[auth/line] verify threw: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`,
      );
      throw e;
    }
    if (!verified) {
      console.log("[auth/line] verify returned null -> 401 invalid_token");
      return jsonError(401, "invalid_token", "invalid id token");
    }
    console.log("[auth/line] verify OK -> issuing session");

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
