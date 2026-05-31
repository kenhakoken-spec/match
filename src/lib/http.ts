// =============================================================================
// matching-app — HTTP helpers for Route Handlers (contract §2 error envelope)
// すべて JSON。エラーは { error: { code, message } } + 適切な status。
// =============================================================================

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/guard";
import { TriggerAuthError } from "@/lib/auth/trigger-auth";
import { LineVerificationUnavailableError } from "@/lib/auth/line-mock";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Route Handler の共通 try/catch。AuthError と ZodError を契約準拠の
 * status/コードに変換する。想定外は 500(詳細は漏らさない)。
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(err.status, err.code, err.message);
    }
    // 本人認証 AI 判定のトリガージョブ認証（Bearer トークン）の失敗。
    if (err instanceof TriggerAuthError) {
      return jsonError(err.status, err.code, err.message);
    }
    // SEC-002: 実トークン検証が未構成のとき。詳細はログのみ、レスポンスは汎用文言。
    if (err instanceof LineVerificationUnavailableError) {
      return jsonError(err.status, err.code, "login is temporarily unavailable");
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const path = first?.path?.join(".") ?? "";
      return jsonError(
        400,
        "validation_error",
        path ? `${path}: ${first?.message}` : (first?.message ?? "invalid input")
      );
    }
    // PII/内部詳細をレスポンスに出さない。
    return jsonError(500, "internal_error", "internal server error");
  }
}

/** multipart/form-data から単一 file を取り出す(dev: 実体は使わずメタのみ)。 */
export async function readUploadedFile(
  req: Request
): Promise<{ name: string; type: string; size: number } | null> {
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const file = form.get("file");
  if (!file || typeof file === "string") return null;
  // File 互換(name/type/size)。dev では中身を保存しない。
  const f = file as unknown as { name?: string; type?: string; size?: number };
  return {
    name: typeof f.name === "string" ? f.name : "upload",
    type: typeof f.type === "string" ? f.type : "application/octet-stream",
    size: typeof f.size === "number" ? f.size : 0,
  };
}
