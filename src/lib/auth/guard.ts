// =============================================================================
// matching-app — auth/authorization guards (contract §4 / auth-flow.md §5)
//
// - requireUser(): 有効セッション必須。未認証は AuthError(401)。
// - requireAdmin(): role=admin をサーバ側で二重チェック。不足は AuthError(403)。
// IDOR防止の要: リソース所有者の解決は **常にセッションの sub** を使い、
//   リクエストの body / URL に含まれる userId は信用しない。
// =============================================================================

import "server-only";
import { readSessionCookie } from "./session";
import { getRepo } from "@/lib/repo";
import type { Role } from "@/lib/types";

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface AuthedUser {
  id: string;
  role: Role;
  status: "active" | "suspended" | "withdrawn";
  displayName: string | null;
}

/**
 * 現在のユーザーをセッションから解決する。
 * セッションが無効 / ユーザー不在 / withdrawn は 401。
 * suspended も操作不可(401扱い)。
 */
export async function requireUser(): Promise<AuthedUser> {
  const session = readSessionCookie();
  if (!session) {
    throw new AuthError(401, "unauthorized", "authentication required");
  }
  const repo = getRepo();
  const user = await repo.users.findById(session.sub);
  if (!user || user.status === "withdrawn") {
    throw new AuthError(401, "unauthorized", "session user not found");
  }
  if (user.status === "suspended") {
    throw new AuthError(403, "account_suspended", "account is suspended");
  }
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
  };
}

/** admin 必須。role を **サーバ側で** 再検証(セッションのrole申告だけに頼らずDBで確認)。 */
export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthError(403, "forbidden", "admin role required");
  }
  return user;
}

/** 任意セッション(未ログインは null)。/api/me の入口などで使用。 */
export async function optionalUser(): Promise<AuthedUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
