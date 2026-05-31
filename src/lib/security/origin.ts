// =============================================================================
// SEC-003 CSRF: Origin/Referer 検証の純関数群。
//
// middleware から呼ばれるが、Edge ランタイム API には依存しない純ロジックとして
// 分離する（vitest で単体検証可能にするため）。fs/process 以外の Node API は使わない。
//
// 方針:
//  - 状態変更メソッド(POST/PUT/PATCH/DELETE)のみ CSRF 検証対象。
//  - リクエストの Origin（無ければ Referer のオリジン部）が許可オリジンに一致しなければ拒否。
//  - 許可オリジン = 同一オリジン(host ヘッダから組み立て) + env ALLOWED_ORIGINS(任意)。
//  - 除外: Authorization: Bearer を持つサーバ間トリガー / /api/webhooks/ 配下。
//  - 非production で Origin/Referer がそもそも無い(curl/テスト/同一プロセス fetch)は通す。
//    production で Origin/Referer 欠如かつ Bearer/webhook でないなら拒否。
// =============================================================================

/** CSRF 検証対象（状態変更）メソッド。これ以外(GET/HEAD/OPTIONS)は素通り。 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 検証に必要な最小限のリクエスト情報（Request 全体に依存しないテスト容易な形）。 */
export interface CsrfRequestInfo {
  method: string;
  /** URL の pathname（例: "/api/webhooks/stripe"）。 */
  pathname: string;
  /** Origin ヘッダ（無ければ null）。 */
  origin: string | null;
  /** Referer ヘッダ（無ければ null）。 */
  referer: string | null;
  /** Host ヘッダ（同一オリジン算出に使用。無ければ null）。 */
  host: string | null;
  /** プロトコル（"https" / "http"）。x-forwarded-proto 由来。無ければ null。 */
  forwardedProto: string | null;
  /** Authorization ヘッダ（"Bearer ..." なら CSRF 除外）。 */
  authorization: string | null;
}

export interface CsrfDecision {
  /** true なら通過、false なら 403 を返すべき。 */
  ok: boolean;
  /** 拒否/通過の理由（ログ・テスト用。レスポンスには出さない）。 */
  reason:
    | "not_mutating"
    | "bearer_excluded"
    | "webhook_excluded"
    | "origin_match"
    | "missing_origin_allowed_dev"
    | "missing_origin_blocked"
    | "origin_mismatch";
}

/** Authorization が "Bearer xxx" 形式か（サーバ間トリガー判定）。大文字小文字は許容。 */
export function hasBearerToken(authorization: string | null): boolean {
  if (!authorization) return false;
  return /^bearer\s+\S/i.test(authorization.trim());
}

/** /api/webhooks/ 配下か（外部 webhook は署名検証が別途あり Origin を持たない）。 */
export function isWebhookPath(pathname: string): boolean {
  return pathname === "/api/webhooks" || pathname.startsWith("/api/webhooks/");
}

/**
 * URL 文字列からオリジン("scheme://host[:port]")を抽出する。
 * パースできなければ null。Referer はフルURLなのでオリジン部のみ取り出す用途。
 */
export function originOf(urlString: string | null): string | null {
  if (!urlString) return null;
  try {
    const u = new URL(urlString);
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * env ALLOWED_ORIGINS（カンマ区切り）をパースし正規化したオリジン配列を返す。
 * 各要素は new URL で正規化（末尾スラッシュ除去・ポート整形）。不正値は捨てる。
 */
export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => originOf(s))
    .filter((o): o is string => o !== null);
}

/**
 * 同一オリジンを host ヘッダ + proto から組み立てる。
 * host が無ければ null。proto 未指定時は https を既定（本番想定で安全側）。
 */
export function selfOrigin(
  host: string | null,
  forwardedProto: string | null
): string | null {
  if (!host) return null;
  const proto = forwardedProto && forwardedProto.length > 0
    ? forwardedProto.split(",")[0]!.trim()
    : "https";
  return originOf(`${proto}://${host}`);
}

/** 許可オリジン集合（同一オリジン + ALLOWED_ORIGINS）を構築。 */
export function buildAllowedOrigins(
  host: string | null,
  forwardedProto: string | null,
  allowedOriginsEnv: string | null | undefined
): Set<string> {
  const set = new Set<string>();
  const self = selfOrigin(host, forwardedProto);
  if (self) set.add(self);
  for (const o of parseAllowedOrigins(allowedOriginsEnv)) set.add(o);
  return set;
}

/**
 * CSRF 判定の中核。純関数。
 *
 * @param info  リクエストから抽出した最小情報
 * @param opts  env 由来の設定（allowedOriginsEnv: ALLOWED_ORIGINS, isProduction: NODE_ENV）
 */
export function evaluateCsrf(
  info: CsrfRequestInfo,
  opts: { allowedOriginsEnv: string | null | undefined; isProduction: boolean }
): CsrfDecision {
  // 1) 状態変更でないメソッドは素通り（GET/HEAD/OPTIONS）。
  if (!MUTATING_METHODS.has(info.method.toUpperCase())) {
    return { ok: true, reason: "not_mutating" };
  }

  // 2) サーバ間トリガー(Bearer)は除外。/api/admin/identity/ai-queue,
  //    /api/admin/identity/[id]/ai-verdict など Origin を持たない正当呼び出し。
  if (hasBearerToken(info.authorization)) {
    return { ok: true, reason: "bearer_excluded" };
  }

  // 3) /api/webhooks/ は除外（Stripe 等は署名検証が別途あり Origin を持たない）。
  if (isWebhookPath(info.pathname)) {
    return { ok: true, reason: "webhook_excluded" };
  }

  // 4) Origin（無ければ Referer のオリジン部）を解決。
  const requestOrigin = info.origin ?? originOf(info.referer);

  // 5) Origin/Referer がそもそも無い場合。
  if (!requestOrigin) {
    // 非production は通す（curl/テスト/同一プロセス fetch を壊さない）。
    // production は拒否（ブラウザの正当な状態変更は必ず Origin を送るため）。
    return opts.isProduction
      ? { ok: false, reason: "missing_origin_blocked" }
      : { ok: true, reason: "missing_origin_allowed_dev" };
  }

  // 6) 許可オリジンに一致するか。
  const allowed = buildAllowedOrigins(
    info.host,
    info.forwardedProto,
    opts.allowedOriginsEnv
  );
  if (allowed.has(requestOrigin)) {
    return { ok: true, reason: "origin_match" };
  }
  return { ok: false, reason: "origin_mismatch" };
}
