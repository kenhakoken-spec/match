// =============================================================================
// matching-app — session token (S1 contract §4 / auth-flow.md §4)
//
// セッションは httpOnly + secure(prod) + sameSite=lax Cookie。
// **平文セッションID禁止**: トークンは AES-256-GCM で認証付き暗号化(=署名兼暗号化)する。
//   - 鍵は AUTH_JWT_SECRET から SHA-256 で 32byte に導出(.env / git管理外)。
//   - GCM の authTag が改竄検知(署名相当)を兼ねる。平文は復号で初めて読める。
//   - 中身は { sub=userId, role, iat, exp } のみ。**lineUserId / PII は入れない**。
//
// jose(JWE)も検討したが、Node 標準 crypto の AES-256-GCM で
// 「署名/暗号化・平文ID禁止」要件を依存追加なしで満たせるため標準実装を採用。
// 実LINE/実DBは使わず S1 はモックで完結する。
//
// 注意: 本モジュールは "server-only"。Route Handler から呼ぶ。
// =============================================================================

import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";
import { isProduction } from "@/lib/env";

export const SESSION_COOKIE = "mapp_session";
const SESSION_TTL_SEC = 60 * 60; // 1h (auth-flow.md §4: 短命JWT相当)
const ALG = "aes-256-gcm";

export interface SessionPayload {
  sub: string; // アプリ内 userId (cuid)。lineUserId ではない。
  role: Role;
  iat: number; // epoch sec
  exp: number; // epoch sec
}

/**
 * 暗号鍵を AUTH_JWT_SECRET から導出する。
 *
 * SEC-001(フェイルクローズ): 本番(NODE_ENV==="production")で AUTH_JWT_SECRET が
 *   未設定なら、ダミー鍵での起動を **禁止** して使用時に明示エラーを投げる。
 *   (旧実装は MOCK_AUTH 未設定=mock 扱いでダミー鍵にフォールバックし、本番でも
 *    予測可能な鍵でセッションを発行しうるフェイルオープンだった。)
 * 非production(開発/テスト)では秘密無しでも build/test/dev が通るよう
 *   開発専用ダミー鍵を許容する。いずれにせよ秘密はコードに固定せず env 経由。
 */
function getKey(): Buffer {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret && secret.length > 0) {
    return crypto.createHash("sha256").update(secret).digest();
  }
  if (isProduction()) {
    // 本番で秘密未設定: ダミー鍵で続行せず即エラー(フェイルクローズ)。
    throw new Error(
      "AUTH_JWT_SECRET is required in production (refusing to use an insecure dev key)"
    );
  }
  // 非production専用フォールバック。本番では上で例外。
  return crypto
    .createHash("sha256")
    .update("dev-only-insecure-session-key-do-not-use-in-prod")
    .digest();
}

/** payload を AES-256-GCM で暗号化し、base64url の self-contained トークンにする。 */
export function sealSession(input: { sub: string; role: Role }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: input.sub,
    role: input.role,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // token = iv.enc.tag (all base64url)
  return [b64u(iv), b64u(enc), b64u(tag)].join(".");
}

/** トークンを復号・検証する。改竄/期限切れ/不正は null。 */
export function openSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = ub64u(parts[0]);
    const enc = ub64u(parts[1]);
    const tag = ub64u(parts[2]);
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv(ALG, getKey(), iv);
    decipher.setAuthTag(tag); // 改竄なら final() で例外
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    const payload = JSON.parse(dec.toString("utf8")) as SessionPayload;
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== "user" && payload.role !== "admin") ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // 期限切れ
    return payload;
  } catch {
    return null; // 復号失敗 = 改竄 or 鍵不一致
  }
}

/** Cookie にセッションをセット(httpOnly / secure(prod) / sameSite=lax)。 */
export function setSessionCookie(input: { sub: string; role: Role }): void {
  const token = sealSession(input);
  cookies().set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

/** Cookie からセッションを読む。 */
export function readSessionCookie(): SessionPayload | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return openSession(token);
}

/** ログアウト: Cookie 破棄。 */
export function clearSessionCookie(): void {
  cookies().set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// --- base64url helpers ---
function b64u(buf: Buffer): string {
  return buf.toString("base64url");
}
function ub64u(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
