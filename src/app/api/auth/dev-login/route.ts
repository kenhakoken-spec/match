// POST /api/auth/dev-login — MOCK専用 開発ログイン。
// SEC-001: 本番(NODE_ENV==="production")では MOCK_AUTH の値に関わらず物理的に 404。
//   さらにモック無効(実モード)でも 404(本番で開発ログインを露出しない)。
// 契約§2: Req { lineUserId?, role? } → Res { user } + セッションCookie。
import { NextRequest, NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { devLoginSchema } from "@/lib/validation";
import { isMockAuth } from "@/lib/auth/line-mock";
import { setSessionCookie } from "@/lib/auth/session";
import { getRepo } from "@/lib/repo";
import { toMeUser } from "@/lib/serializers";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // SEC-001: 本番では dev-login を物理的に無効化(MOCK_AUTH=1 でも無視して 404)。
  // handle() より前にガードし、env の取り違えで本番に開発ログインが出ないようにする。
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: { code: "not_found", message: "not found" } },
      { status: 404 }
    );
  }
  return handle(async () => {
    // 非productionでもモック無効(MOCK_AUTH=0)なら 404。
    if (!isMockAuth()) {
      return jsonError(404, "not_found", "not found");
    }
    const body = await req.json().catch(() => ({}));
    const parsed = devLoginSchema.parse(body);

    // 既定の開発用 lineUserId。role 指定で admin 開発ログインも可(MOCK専用)。
    const lineUserId = parsed.lineUserId ?? "Udev-default-user";
    const role: Role = parsed.role ?? "user";

    const repo = getRepo();
    const user = await repo.users.upsertByLineUserId({ lineUserId, role });

    // 既存ユーザーに role 指定が来た場合の昇格は upsert では行わない(権限昇格防止)。
    // dev-login の admin 化は「新規作成時のみ」。seed の admin を使うのが既定運用。
    setSessionCookie({ sub: user.id, role: user.role });
    return jsonOk({ user: toMeUser(user) });
  });
}
