// =============================================================================
// Next.js middleware — 本番前セキュリティ強化の入口層。
//   SEC-003: CSRF（Origin/Referer 検証） … src/lib/security/origin.ts
//   SEC-004: レート制限（固定窓 in-memory） … src/lib/security/rate-limit.ts
//
// 対象は /api/:path*（下部 config.matcher）。状態変更の不正クロスサイト送信と
// エンドポイント濫用（連打/総当たり）をルートハンドラ手前で遮断する。
//
// ランタイム: middleware は Edge 既定。fs 等の Node API は使わず、
//   Request/Response・Map・Date のみで完結する純ロジックに依存する。
//
// ⚠ CVE-2025-29927（Next.js middleware バイパス）:
//   外部から `x-middleware-subrequest` ヘッダを偽装されると、Next 内部が
//   「これは内部サブリクエストだ」と誤認し middleware を丸ごとスキップし得る。
//   14.2.5 は影響バージョン帯（修正は 14.2.25+ / 15.2.3+）。アップグレード前の
//   緩和として、外部から到達したリクエストにこのヘッダが付いていたら **除去** した
//   うえで処理する（下流が誤認しないように、かつ我々の判定は必ず通す）。
//   恒久対処は Next 本体のアップグレード。
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { evaluateCsrf, hasBearerToken, isWebhookPath } from "@/lib/security/origin";
import { applyRateLimit } from "@/lib/security/rate-limit";

/** 契約のエラー封筒 { error: { code, message } } で JSON レスポンスを返す。 */
function errorResponse(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  const res = NextResponse.json({ error: { code, message } }, { status });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) res.headers.set(k, v);
  }
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const headers = req.headers;

  // --- CVE-2025-29927 緩和: 偽装 x-middleware-subrequest を除去 -------------
  // このヘッダは Next 内部用。外部リクエストに付いていれば剥がし、下流が
  // middleware バイパスと誤認しないようにする。除去のうえで通常処理を続行する。
  // (next() に渡すリクエストヘッダから落とす。)
  const sanitizedHeaders = new Headers(headers);
  let strippedSubrequest = false;
  if (sanitizedHeaders.has("x-middleware-subrequest")) {
    sanitizedHeaders.delete("x-middleware-subrequest");
    strippedSubrequest = true;
  }

  const authorization = headers.get("authorization");
  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");

  const isBearer = hasBearerToken(authorization);
  const isWebhook = isWebhookPath(pathname);

  // --- SEC-004: レート制限（CSRF より先に。安価で DoS 緩和を最優先）-----------
  // Bearer サーバ間トリガー（ai-queue / ai-verdict）と /api/webhooks/ は除外。
  if (!isBearer && !isWebhook) {
    const rl = applyRateLimit({ pathname, forwardedFor, realIp });
    if (!rl.allowed) {
      // 429 + Retry-After（秒）。本文は契約のエラー封筒。
      return errorResponse(
        429,
        "rate_limited",
        "too many requests, please retry later",
        {
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": String(rl.remaining),
        }
      );
    }
  }

  // --- SEC-003: CSRF（Origin/Referer 検証）------------------------------------
  // 状態変更メソッドのみ実質判定。GET/HEAD/OPTIONS と Bearer / webhook は素通り。
  const decision = evaluateCsrf(
    {
      method: req.method,
      pathname,
      origin: headers.get("origin"),
      referer: headers.get("referer"),
      host: headers.get("host"),
      forwardedProto: headers.get("x-forwarded-proto"),
      authorization,
    },
    {
      allowedOriginsEnv: process.env.ALLOWED_ORIGINS ?? null,
      isProduction: process.env.NODE_ENV === "production",
    }
  );
  if (!decision.ok) {
    return errorResponse(
      403,
      "csrf_origin",
      "request origin not allowed"
    );
  }

  // 通過。x-middleware-subrequest を剥がした場合のみ、浄化済みヘッダで下流へ。
  if (strippedSubrequest) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }
  return NextResponse.next();
}

// /api 配下のみを対象にする（静的アセット・ページ遷移には適用しない）。
export const config = {
  matcher: ["/api/:path*"],
};
