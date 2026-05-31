"use client";

// =============================================================================
// matching-app — LIFF ログイン（クライアント）。LINE(LIFF) アプリ起動時の本人ログイン。
//
// フロー（U-00「LINEではじめる」→ /onboarding）:
//   1. NEXT_PUBLIC_LIFF_ID があり LIFF SDK が初期化できる → LIFF ログイン:
//        liff.init() → 未ログインなら liff.login() → liff.getIDToken()
//        → POST /api/auth/line { idToken } でサーバがトークン検証＆セッション発行。
//   2. LIFF が使えない（LIFF_ID 未設定 / LINE 外のPCブラウザ / SDK 失敗）→
//        従来の dev-login にフォールバック（開発・レビュー用。本番は dev-login が 404）。
//
// 設計:
//   - @line/liff は動的 import（クライアントのみ。SSR バンドルに載せない・初期表示を軽く）。
//   - id_token はサーバへ渡すだけ。クライアントで sub を信頼しない（検証はサーバ）。
//   - 失敗は握りつぶさず呼び出し側へ返し、UI が文言を出せるようにする。
// =============================================================================

import { devLogin } from "./api";

/** ログイン結果。method は実際に通った経路（UI のデバッグ・文言に使える）。 */
export interface LineLoginResult {
  ok: boolean;
  method: "liff" | "dev";
  error?: string;
}

const LIFF_ID =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LIFF_ID ?? "" : "";

/** id_token をサーバへ送ってセッションを発行する（/api/auth/line）。 */
async function exchangeIdToken(idToken: string): Promise<boolean> {
  const res = await fetch("/api/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  return res.ok;
}

/**
 * LINE(LIFF) ログインを試みる。LIFF が使えなければ dev-login にフォールバック。
 * 成功時はサーバ側セッション Cookie が張られ、以降の API が本人として通る。
 */
export async function lineLogin(): Promise<LineLoginResult> {
  // LIFF_ID 未設定 = LIFF 連携前。開発用 dev-login へ。
  if (!LIFF_ID) {
    const r = await devLogin();
    return { ok: r.ok, method: "dev" };
  }

  try {
    // クライアントでのみ LIFF SDK を読み込む（動的 import）。
    const liffModule = await import("@line/liff");
    const liff = liffModule.default;

    await liff.init({ liffId: LIFF_ID });

    // LINE 外ブラウザ等で LIFF が「ログインできない」環境なら dev へ退避。
    if (!liff.isInClient() && !liff.isLoggedIn()) {
      // PC ブラウザでも liff.login() でLINEログイン画面へ送れるが、
      // レビュー利便のため LIFF 外では dev-login を許容する（本番は 404 で無効）。
      // LINE アプリ内(isInClient)なら下の getIDToken まで進む。
    }

    if (!liff.isLoggedIn()) {
      // 未ログイン → LINE ログインへリダイレクト（戻ってきたら再度この関数が走る）。
      liff.login();
      // login() はリダイレクトするため、ここには通常戻らない。
      return { ok: false, method: "liff", error: "redirecting_to_line_login" };
    }

    const idToken = liff.getIDToken();
    if (!idToken) {
      // ID トークンが取れない（scope 不足等）→ dev へフォールバックせず明示失敗。
      return { ok: false, method: "liff", error: "no_id_token" };
    }

    const ok = await exchangeIdToken(idToken);
    return ok
      ? { ok: true, method: "liff" }
      : { ok: false, method: "liff", error: "token_exchange_failed" };
  } catch {
    // SDK 初期化失敗（LIFF_ID 不正・ネットワーク等）→ 開発用 dev-login へ退避。
    const r = await devLogin();
    return { ok: r.ok, method: "dev", error: "liff_init_failed" };
  }
}
