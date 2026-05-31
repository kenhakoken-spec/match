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
 * 本番 LINE ID トークン検証（SEC-002: 実装済み）。
 *
 * 実モード(モック無効=本番)で呼ばれる検証本体。LINE の verify API で署名・iss・
 * aud(=Channel ID)・exp を検証し、検証済みの sub を返す（実装は line-verify.ts）。
 * Channel ID 未設定など検証不能時は {@link LineVerificationUnavailableError} を
 * throw（なりすまし防止のフェイルクローズ。モック検証へはフォールバックしない）。
 *
 * verify API 呼び出しのため async。動的 import で本ファイルの同期 import 連鎖
 * （テストの server-only モック等）に影響を与えない。
 */
export async function verifyLineIdTokenReal(
  idToken: string
): Promise<VerifiedLineToken | null> {
  const { verifyLineIdTokenViaApi } = await import("./line-verify");
  return verifyLineIdTokenViaApi(idToken);
}

/**
 * モード別ディスパッチャ。モック有効(非production既定)はモック検証(同期)、
 * モック無効(本番)は実検証(verify API・async)。Route Handler はこれを await する。
 */
export async function verifyLineIdToken(
  idToken: string
): Promise<VerifiedLineToken | null> {
  if (isMockAuthEnabled()) {
    return verifyLineIdTokenMock(idToken);
  }
  // SEC-002: 本番実モードでは LINE verify API で検証（line-verify.ts）。
  // 検証不能(Channel ID 未設定/通信失敗)は throw され、route 側で 503 になる。
  return verifyLineIdTokenReal(idToken);
}

/**
 * モック認証が有効か。SEC-001: 判定は env.ts に集約(本番フェイルクローズ)。
 * 旧実装の `process.env.MOCK_AUTH !== "0"`(本番でも未設定なら mock ON)を廃止。
 */
export function isMockAuth(): boolean {
  return isMockAuthEnabled();
}
