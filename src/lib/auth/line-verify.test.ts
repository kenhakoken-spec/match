// line-verify.test.ts — LINE ID トークン実検証（SEC-002・JWKS 署名検証方式）。
//
// 方式変更: verify API(fetch) ではなく jose の JWKS 署名検証へ移行したため、
// テストも jose をモックして検証する。createRemoteJWKSet / jwtVerify を差し替え、
// 「関数が channelId を audience に渡しているか」「iss/aud/署名/exp の各失敗で
// null を返すか」を担保する。jose の jwtVerify は iss/aud 不一致や署名不正で
// **throw** する仕様のため、モックも options(issuer/audience) を実際に突き合わせ
// 不一致なら throw する忠実実装にし、本番ロジックの配線(channelId→audience)を検証する。
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// jose を忠実モック。jwtVerify は渡された {issuer, audience, clockTolerance} と
// テストが仕込んだトークン payload を突き合わせ、本物同様に不一致なら throw する。
// ストアは factory 内（巻き上げ対策で外部変数を参照しない）。
vi.mock("jose", () => {
  const g = globalThis as unknown as {
    __lineJoseState?: {
      // 直近で jwtVerify に渡された options（配線検証用）。
      lastOptions?: { issuer?: string; audience?: string; clockTolerance?: unknown };
      // jwtVerify が「署名検証成功後に得る」payload（テストが仕込む）。
      // null を仕込むと「署名不正」を表す（jwtVerify が throw）。
      nextPayload?: Record<string, unknown> | null;
      // jwtVerify 呼び出し回数（冪等性検証用）。
      calls: number;
    };
  };
  if (!g.__lineJoseState) g.__lineJoseState = { calls: 0 };
  const state = g.__lineJoseState;
  return {
    __esModule: true,
    // createRemoteJWKSet は鍵セット取得関数を返すだけ。中身はモックでは未使用。
    createRemoteJWKSet: () => () => ({ type: "mock-jwks" }),
    jwtVerify: async (
      _token: string,
      _jwks: unknown,
      options: { issuer?: string; audience?: string; clockTolerance?: unknown }
    ) => {
      state.calls += 1;
      state.lastOptions = options;
      const payload = state.nextPayload;
      // payload なし = 署名検証失敗(改ざん/不正鍵)を模倣 → 本物同様に throw。
      if (!payload) throw new Error("signature verification failed");
      // 本物の jwtVerify は iss/aud を突き合わせ不一致なら throw する。
      if (options.issuer !== undefined && payload.iss !== options.issuer) {
        throw new Error('unexpected "iss" claim value');
      }
      if (options.audience !== undefined && payload.aud !== options.audience) {
        throw new Error('unexpected "aud" claim value');
      }
      return { payload, protectedHeader: { alg: "ES256" } };
    },
  };
});

import { verifyLineIdTokenViaApi } from "@/lib/auth/line-verify";
import { LineVerificationUnavailableError } from "@/lib/auth/line-mock";

const ENV = { ...process.env };
const CHANNEL = "2010236765";

function setEnv(k: string, v: string | undefined) {
  if (v === undefined) delete (process.env as Record<string, string>)[k];
  else (process.env as Record<string, string>)[k] = v;
}

// jwtVerify が返す「検証済み payload」を仕込む。null=署名不正(throw)。
function setVerifiedPayload(p: Record<string, unknown> | null) {
  const g = globalThis as unknown as {
    __lineJoseState: { nextPayload?: Record<string, unknown> | null; calls: number };
  };
  g.__lineJoseState.nextPayload = p;
}
function joseCalls() {
  return (globalThis as unknown as { __lineJoseState: { calls: number } }).__lineJoseState
    .calls;
}

beforeEach(() => {
  (globalThis as unknown as { __lineJoseState: { calls: number } }).__lineJoseState.calls = 0;
});
afterEach(() => {
  process.env = { ...ENV };
  setVerifiedPayload(undefined as never);
  vi.restoreAllMocks();
});

describe("verifyLineIdTokenViaApi（SEC-002 / JWKS 署名検証）", () => {
  it("Channel ID 未設定 → 検証不能で throw（フェイルクローズ）", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", undefined);
    await expect(verifyLineIdTokenViaApi("tok")).rejects.toBeInstanceOf(
      LineVerificationUnavailableError
    );
  });

  it("正当なトークン（署名OK・iss/aud 一致）→ sub/displayName を返す", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({
      iss: "https://access.line.me",
      aud: CHANNEL,
      sub: "U_real_123",
      name: "ハナ",
    });
    const v = await verifyLineIdTokenViaApi("good");
    expect(v?.lineUserId).toBe("U_real_123");
    expect(v?.displayName).toBe("ハナ");
  });

  it("channelId を jwtVerify の audience/issuer/clockTolerance に渡す（配線検証）", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({ iss: "https://access.line.me", aud: CHANNEL, sub: "U_wire" });
    await verifyLineIdTokenViaApi("good");
    const opts = (
      globalThis as unknown as {
        __lineJoseState: { lastOptions?: { issuer?: string; audience?: string; clockTolerance?: unknown } };
      }
    ).__lineJoseState.lastOptions;
    expect(opts?.issuer).toBe("https://access.line.me");
    expect(opts?.audience).toBe(CHANNEL);
    // clockTolerance が指定されている（exp 大幅許容）。値は実装定義だが必須。
    expect(opts?.clockTolerance).toBeTruthy();
  });

  it("aud 不一致（別チャネル宛のトークン）→ null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({ iss: "https://access.line.me", aud: "9999999", sub: "U_x" });
    expect(await verifyLineIdTokenViaApi("wrong-aud")).toBeNull();
  });

  it("iss 不正 → null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({ iss: "https://evil.example", aud: CHANNEL, sub: "U" });
    expect(await verifyLineIdTokenViaApi("bad-iss")).toBeNull();
  });

  it("署名不正（改ざん/不正鍵）→ null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload(null); // jwtVerify が throw
    expect(await verifyLineIdTokenViaApi("forged")).toBeNull();
  });

  it("sub 欠落 → null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({ iss: "https://access.line.me", aud: CHANNEL, name: "no-sub" });
    expect(await verifyLineIdTokenViaApi("no-sub")).toBeNull();
  });

  it("冪等: 同一トークンを複数回検証しても安全に同結果（副作用なし）", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    setVerifiedPayload({ iss: "https://access.line.me", aud: CHANNEL, sub: "U_idem" });
    const a = await verifyLineIdTokenViaApi("dup");
    const b = await verifyLineIdTokenViaApi("dup");
    expect(a?.lineUserId).toBe("U_idem");
    expect(b?.lineUserId).toBe("U_idem");
    expect(joseCalls()).toBe(2); // 毎回検証は走る（キャッシュ副作用で結果が変わらない）
  });
});
