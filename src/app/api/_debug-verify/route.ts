// POST /api/_debug-verify — 一時診断専用。LINE verify API の **生の応答**を返す。
// 通常の /api/auth/line は invalid_token としか返さないため、401の真因
// (verify APIが何を返しているか: status / error / error_description / aud)を確定する。
// セキュリティ: id_token値・sub の生値は返さない。verify APIの status と error 系、
// aud/iss/exp(=機微でない)のみ返す。原因確定後にこのファイルは削除する。
import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/http";

export const dynamic = "force-dynamic";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const idToken =
      body && typeof body === "object" && typeof (body as { idToken?: unknown }).idToken === "string"
        ? (body as { idToken: string }).idToken
        : "";
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";

    const out: Record<string, unknown> = {
      channelIdSet: channelId.length > 0,
      channelIdValue: channelId, // Channel IDは公開情報（secretではない）
      idTokenLen: idToken.length,
    };

    if (!idToken || !channelId) {
      out.note = "idToken or channelId missing";
      return jsonOk(out);
    }

    try {
      const res = await fetch(LINE_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
        cache: "no-store",
      });
      out.verifyStatus = res.status;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // 機微でないフィールドのみ抜粋（sub等の生PIIは出さない）。
      out.verify_error = data.error ?? null;
      out.verify_error_description = data.error_description ?? null;
      out.verify_aud = data.aud ?? null;
      out.verify_iss = data.iss ?? null;
      out.verify_exp = typeof data.exp === "number" ? new Date(data.exp * 1000).toISOString() : null;
      out.verify_has_sub = typeof data.sub === "string";
      out.audMatchesChannel = data.aud === channelId;
    } catch (e) {
      out.fetchError = e instanceof Error ? e.message : "unknown";
    }

    return jsonOk(out);
  });
}
