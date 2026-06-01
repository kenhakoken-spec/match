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
//
// 既知のハマり所（LINE同意→戻った後の400対策）:
//   - liff.login() は **redirectUri を明示**しないと、戻り先が現在URL（クエリ付き）に
//     なり再初期化で崩れることがある。明示的に画面の origin へ戻す。
//   - liff.getIDToken() は openid 同意済みでも、login() で `scope` を渡していないと
//     稀に空/旧トークンになる。login({ scope }) で openid profile を要求する。
//   - getIDToken() が falsy のときは **サーバへ送らない**（送ると 400 idToken Required）。
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

/** id_token をサーバへ送ってセッションを発行する（/api/auth/line）。失敗時は status を返す。 */
async function exchangeIdToken(
  idToken: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("/api/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status };
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

    if (!liff.isLoggedIn()) {
      // 未ログイン → LINE ログインへ。戻り先を origin に固定（クエリ汚染で再初期化が
      // 崩れるのを防ぐ）。openid/profile を明示要求し id_token を確実に得る。
      const redirectUri =
        typeof window !== "undefined"
          ? window.location.origin + "/"
          : undefined;
      liff.login({ redirectUri });
      // login() はリダイレクトするため、ここには通常戻らない。
      return { ok: false, method: "liff", error: "redirecting_to_line_login" };
    }

    // ログイン済み。id_token を取得（openid 同意済み前提）。
    let idToken = liff.getIDToken();

    // 同意直後で id_token がまだ無い/期限切れのことがある。取れなければ
    // 一度だけログインを取り直してから再取得する（無限ループ防止に query で制御）。
    if (!idToken) {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("liffRetry")) {
        url.searchParams.set("liffRetry", "1");
        liff.login({ redirectUri: url.toString() });
        return { ok: false, method: "liff", error: "relogin_for_id_token" };
      }
      // 既にリトライ済みでも取れない → スコープ/設定の問題。送らず明示失敗。
      return { ok: false, method: "liff", error: "no_id_token" };
    }

    const { ok, status } = await exchangeIdToken(idToken);
    if (ok) return { ok: true, method: "liff" };
    return {
      ok: false,
      method: "liff",
      error: `token_exchange_failed_${status}`,
    };
  } catch (e) {
    // SDK 初期化失敗（LIFF_ID 不正・ネットワーク等）→ 開発用 dev-login へ退避。
    const msg = e instanceof Error ? e.message : "unknown";
    const r = await devLogin();
    return {
      ok: r.ok,
      method: "dev",
      error: `liff_init_failed:${msg.slice(0, 80)}`,
    };
  }
}
