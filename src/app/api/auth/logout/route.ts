// POST /api/auth/logout — セッション破棄。契約§2: Res { ok: true }。
import { handle, jsonOk } from "@/lib/http";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    clearSessionCookie();
    return jsonOk({ ok: true });
  });
}
