// GET /api/me — 現在のユーザー + プロフィール + 認証状態 (MeResponse)。
// 未ログインは 401。契約§1/§2。
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { buildMe } from "@/lib/serializers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const authed = await requireUser(); // 未ログインは AuthError(401)
    const repo = getRepo();
    const [user, profile, identity] = await Promise.all([
      repo.users.findById(authed.id),
      repo.profiles.findByUserId(authed.id),
      repo.identities.findByUserId(authed.id),
    ]);
    // requireUser が通っている以上 user は存在する。
    return jsonOk(buildMe(user!, profile, identity));
  });
}
