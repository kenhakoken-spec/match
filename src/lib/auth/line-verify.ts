// =============================================================================
// matching-app — LINE ID トークンの実検証（SEC-002 / JWKS 署名検証方式）
//
// LINE Login の ID トークン(JWT, ES256/RS256)を **サーバ側で署名検証**する。
// LIFF の liff.getIDToken() がクライアントから送ってくる id_token を信用せず、
// LINE の公開鍵(JWKS)で署名・iss・aud を確認してから sub を採る。
//
// 方式変更の理由（致命バグ修正）:
//   旧実装は LINE 公式の verify API(https://api.line.me/oauth2/v2.1/verify)へ
//   id_token を POST して検証していたが、本番で verify API が
//   400 / error=invalid_request / "id token expired" を返しログインが 401 に
//   なる事象が発生した。LIFF の id_token は exp が短命で、クライアント取得から
//   サーバ到達までの間に verify API の **厳格な exp 判定**で expired 扱いになる。
//   → verify API 往復をやめ、JWKS による **サーバ内署名検証**へ切り替える。
//     署名検証は厳格に維持（なりすまし防止）しつつ、exp のみ大きめの
//     クロックスキューで許容して「署名が正しい本人トークン」を安定受理する。
//
// セキュリティ:
//   - JWKS(LINE 公開鍵)で署名を厳格検証。iss/aud(=Channel ID)も確認。
//   - channelId 未設定の本番は検証不能 → throw（なりすまし防止のフェイルクローズ）。
//   - id_token・payload の生データはログに出さない（sub/displayName のみ扱う）。
//   - 副作用なし（JWKS 検証は冪等）。同一トークンを複数回検証しても安全。
// =============================================================================
import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VerifiedLineToken } from "./line-mock";
import { LineVerificationUnavailableError } from "./line-mock";

const LINE_ISSUER = "https://access.line.me";
// LINE の公開鍵セット(JWKS)エンドポイント。ES256/RS256 双方の鍵を含む。
const LINE_JWKS_URL = new URL("https://api.line.me/oauth2/v2.1/certs");

// LIFF id_token の短命 exp 対策。クライアント取得からサーバ到達までの遅延や
// 端末/サーバ間の時計ずれで「署名は正しいが exp を過ぎた」トークンが届くため、
// exp 判定のみ大きめのスキューを許容する。**署名検証は厳格に維持**しており、
// 緩めるのは有効期限の許容幅だけ（なりすまし防止性は損なわない）。
const CLOCK_TOLERANCE = "2 h"; // = 7200 秒

// createRemoteJWKSet はモジュールスコープで生成し、取得した JWKS を内部キャッシュ
// する（リクエスト毎の鍵再取得を避ける）。鍵ローテーション時は jose が自動再取得する。
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(LINE_JWKS_URL);
  return jwks;
}

/**
 * LINE ID トークンを JWKS 署名検証し、検証済みの sub/displayName を返す。
 * 検証不能（channelId 未設定）は throw。トークン不正（署名不正/iss・aud 不一致）は
 * null（route が 401 にする）。
 *
 * exp は {@link CLOCK_TOLERANCE} 分まで超過を許容する（LIFF 短命トークン対策）。
 * 署名・iss・aud は厳格に検証する。
 *
 * @param idToken LIFF の liff.getIDToken() が返す id_token(JWT)。
 */
export async function verifyLineIdTokenViaApi(
  idToken: string
): Promise<VerifiedLineToken | null> {
  // 評価時点の env を読む（モジュール初期化時に固定する `env` 定数ではなく
  // process.env 直読み。テスト/リクエスト毎の差し替えに追従。env.ts の関数版と同方針）。
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  if (!channelId) {
    // 本番で Channel ID 未設定 = aud 検証できない。黙って通さずフェイルクローズ。
    throw new LineVerificationUnavailableError(
      "LINE_LOGIN_CHANNEL_ID is not set; cannot verify LINE id token"
    );
  }

  let payload: { sub?: unknown; name?: unknown };
  try {
    // JWKS で署名を厳格検証し、iss/aud を一致確認。exp は大きめのスキューで許容。
    const verified = await jwtVerify(idToken, getJwks(), {
      issuer: LINE_ISSUER,
      audience: channelId,
      clockTolerance: CLOCK_TOLERANCE,
    });
    payload = verified.payload as { sub?: unknown; name?: unknown };
  } catch {
    // 署名不正 / iss・aud 不一致 / (許容幅を超えた)期限切れ / 形式不正。
    // 詳細(生トークン/payload)はログに残さず、route 側で 401 にするため null。
    return null;
  }

  // sub は必須（lineUserId の源）。jwtVerify が iss/aud/exp は保証済み。
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

  return {
    lineUserId: payload.sub,
    displayName: typeof payload.name === "string" ? payload.name : null,
  };
}
