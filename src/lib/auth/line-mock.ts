// =============================================================================
// matching-app — LINE ID Token verification (S1 = MOCK / SEC-001・SEC-002)
// 契約§0/§2: モック有効(非production既定)のとき LIFF トークン検証を省略し、
//   idToken 内の sub を **そのまま信頼** して lineUserId とする。
// 本番(モック無効)は LINE verify エンドポイントで署名/aud/iss/exp を検証する
//   実装に差し替える(auth-flow.md §1)。
//
// SEC-001: モック判定は env.ts の集約フラグ(フェイルクローズ)に統一。
//   本番では MOCK_AUTH の値に関わらずモック無効。
// SEC-002: 本番(モック無効)で実トークン検証が未実装の場合、黙ってモック検証へ
//   フォールバックさせず **明示的に throw** してなりすましを防ぐ(下記参照)。
// =============================================================================

import "server-only";
import { isMockAuthEnabled } from "@/lib/env";

export interface VerifiedLineToken {
  lineUserId: string; // sub
  displayName?: string | null;
}

/** トークン検証が安全に行えない(実検証未実装の本番など)ことを表す明示エラー。 */
export class LineVerificationUnavailableError extends Error {
  status = 503;
  code = "line_verification_unavailable";
  constructor(message = "LINE ID token verification is not configured") {
    super(message);
    this.name = "LineVerificationUnavailableError";
  }
}

/**
 * MOCK 検証。idToken は以下のいずれかを受け付ける(開発利便):
 *  - JWT 風 "header.payload.signature" の payload に { sub, name? } がある
 *  - 生の文字列 (=その文字列を sub として扱う)
 * いずれも **署名検証はしない**(MOCKのため)。本番では使われない。
 */
export function verifyLineIdTokenMock(idToken: string): VerifiedLineToken | null {
  if (!idToken) return null;

  // JWT 形式なら payload を読む(検証はしない)。
  const parts = idToken.split(".");
  if (parts.length === 3) {
    try {
      const json = Buffer.from(parts[1], "base64url").toString("utf8");
      const payload = JSON.parse(json) as { sub?: unknown; name?: unknown };
      if (typeof payload.sub === "string" && payload.sub.length > 0) {
        return {
          lineUserId: payload.sub,
          displayName: typeof payload.name === "string" ? payload.name : null,
        };
      }
    } catch {
      // fallthrough: 生文字列として扱う
    }
  }

  // 生文字列 fallback: idToken 自体を sub とみなす(MOCKのみ)。
  return { lineUserId: idToken, displayName: null };
}

/**
 * 本番 LINE ID トークン検証(未実装)。
 *
 * SEC-002: 実モード(モック無効=本番)で呼ばれる検証本体。LINE チャネル接続時に
 * 以下を **必ず** 実装する。それまでは、なりすまし(任意の sub を信頼)を防ぐため
 * 黙ってモックへフォールバックせず {@link LineVerificationUnavailableError} を throw する。
 *
 * TODO(SEC-002 / LINEチャネル接続時に実装):
 *   1. LINE JWKS (https://api.line.me/oauth2/v2.1/certs) から公開鍵を取得し署名検証。
 *      （または verify エンドポイント https://api.line.me/oauth2/v2.1/verify を使用）
 *   2. aud === env.lineLoginChannelId (LINE Login Channel ID) を検証。
 *   3. iss === "https://access.line.me" を検証。
 *   4. exp 失効チェック(現在時刻 < exp)。
 *   5. 検証 OK の payload.sub を lineUserId として返す(payload.name を displayName に)。
 */
export function verifyLineIdTokenReal(_idToken: string): VerifiedLineToken | null {
  // 実検証は未実装。なりすまし防止のため、モックへフォールバックさせず明示エラー。
  throw new LineVerificationUnavailableError(
    "real LINE ID token verification is not implemented yet (SEC-002); " +
      "connect the LINE channel and implement signature/aud/iss/exp verification"
  );
}

/**
 * モード別ディスパッチャ。モック有効(非production既定)はモック検証、
 * モック無効(本番)は実検証(未実装なら throw)。Route Handler はこれを呼ぶ。
 */
export function verifyLineIdToken(idToken: string): VerifiedLineToken | null {
  if (isMockAuthEnabled()) {
    return verifyLineIdTokenMock(idToken);
  }
  // SEC-002: 本番実モードでは実検証へ。未実装の現状は throw され、
  // route 側で 503 として扱われる(モック検証にはフォールバックしない)。
  return verifyLineIdTokenReal(idToken);
}

/**
 * モック認証が有効か。SEC-001: 判定は env.ts に集約(本番フェイルクローズ)。
 * 旧実装の `process.env.MOCK_AUTH !== "0"`(本番でも未設定なら mock ON)を廃止。
 */
export function isMockAuth(): boolean {
  return isMockAuthEnabled();
}
