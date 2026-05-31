// =============================================================================
// matching-app — LINE ID トークンの実検証（SEC-002）
//
// LINE Login の ID トークン(JWT)を **サーバ側で検証**する。LIFF の
// liff.getIDToken() がクライアントから送ってくる id_token を信用せず、
// LINE の verify エンドポイントで署名・aud・iss・exp を確認してから sub を採る。
//
// 方式: LINE 公式の verify API（https://api.line.me/oauth2/v2.1/verify）を使う。
//   - JWKS を自前で取得して RS256 検証する手もあるが、verify API は署名・iss・exp・
//     aud(client_id) をまとめて検証してくれるため、依存追加なし(fetch のみ)で堅牢。
//   - aud には LINE Login Channel ID を渡す（env.lineLoginChannelId）。
//   - nonce はここでは検証しない（LIFF 経由は nonce 無し運用。必要時に拡張）。
//
// セキュリティ:
//   - channelId 未設定の本番は検証不能 → throw（なりすまし防止のフェイルクローズ）。
//   - id_token・レスポンスの生データはログに出さない（sub/displayName のみ扱う）。
// =============================================================================
import "server-only";
import type { VerifiedLineToken } from "./line-mock";
import { LineVerificationUnavailableError } from "./line-mock";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";

/** verify API のレスポンス（必要フィールドのみ）。 */
interface LineVerifyResponse {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  name?: string;
  picture?: string;
  error?: string;
  error_description?: string;
}

/**
 * LINE ID トークンを verify API で検証し、検証済みの sub/displayName を返す。
 * 検証不能（channelId 未設定）は throw。トークン不正は null（route が 401 にする）。
 *
 * @param idToken LIFF の liff.getIDToken() が返す id_token。
 */
export async function verifyLineIdTokenViaApi(
  idToken: string
): Promise<VerifiedLineToken | null> {
  // 評価時点の env を読む（モジュール初期化時に固定する `env` 定数ではなく
  // process.env 直読み。テスト/リクエスト毎の差し替えに追従。env.ts の関数版と同方針）。
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  if (!channelId) {
    // 本番で Channel ID 未設定 = 検証できない。黙って通さずフェイルクローズ。
    throw new LineVerificationUnavailableError(
      "LINE_LOGIN_CHANNEL_ID is not set; cannot verify LINE id token"
    );
  }

  let data: LineVerifyResponse;
  try {
    const res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
      cache: "no-store",
    });
    data = (await res.json().catch(() => ({}))) as LineVerifyResponse;
    if (!res.ok) {
      // 400 等: トークン不正/期限切れ/aud不一致。詳細はログに残さずユーザーには汎用。
      return null;
    }
  } catch {
    // ネットワーク等で検証できない → なりすまし防止のため通さない。
    throw new LineVerificationUnavailableError(
      "LINE id token verification request failed"
    );
  }

  // 二重チェック（verify API も検証するが、サーバ側でも不変条件を確認）。
  if (data.iss !== LINE_ISSUER) return null;
  if (data.aud !== channelId) return null;
  if (typeof data.exp !== "number" || data.exp * 1000 <= Date.now()) return null;
  if (typeof data.sub !== "string" || data.sub.length === 0) return null;

  return {
    lineUserId: data.sub,
    displayName: typeof data.name === "string" ? data.name : null,
  };
}
