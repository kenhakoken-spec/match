// line-verify.test.ts — LINE ID トークン実検証（SEC-002・verify API 方式）。
// fetch をモックして verify API レスポンスに対する判定（iss/aud/exp/sub）を検証する。
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyLineIdTokenViaApi } from "@/lib/auth/line-verify";
import { LineVerificationUnavailableError } from "@/lib/auth/line-mock";

const ENV = { ...process.env };
const CHANNEL = "2010236765";

function setEnv(k: string, v: string | undefined) {
  if (v === undefined) delete (process.env as Record<string, string>)[k];
  else (process.env as Record<string, string>)[k] = v;
}

function mockFetchOnce(status: number, body: unknown) {
  // verify API への1回分の fetch を差し替える。
  (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...ENV };
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 10;

describe("verifyLineIdTokenViaApi（SEC-002）", () => {
  it("Channel ID 未設定 → 検証不能で throw（フェイルクローズ）", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", undefined);
    await expect(verifyLineIdTokenViaApi("tok")).rejects.toBeInstanceOf(
      LineVerificationUnavailableError
    );
  });

  it("正当なトークン（iss/aud/exp/sub 一致）→ sub/displayName を返す", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(200, {
      iss: "https://access.line.me",
      aud: CHANNEL,
      sub: "U_real_123",
      exp: future(),
      name: "ハナ",
    });
    const v = await verifyLineIdTokenViaApi("good");
    expect(v?.lineUserId).toBe("U_real_123");
    expect(v?.displayName).toBe("ハナ");
  });

  it("aud 不一致（別チャネル宛のトークン）→ null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(200, {
      iss: "https://access.line.me",
      aud: "9999999",
      sub: "U_x",
      exp: future(),
    });
    expect(await verifyLineIdTokenViaApi("wrong-aud")).toBeNull();
  });

  it("iss 不正 → null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(200, { iss: "https://evil.example", aud: CHANNEL, sub: "U", exp: future() });
    expect(await verifyLineIdTokenViaApi("bad-iss")).toBeNull();
  });

  it("期限切れ exp → null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(200, { iss: "https://access.line.me", aud: CHANNEL, sub: "U", exp: past() });
    expect(await verifyLineIdTokenViaApi("expired")).toBeNull();
  });

  it("verify API が 400（不正トークン）→ null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(400, { error: "invalid_request" });
    expect(await verifyLineIdTokenViaApi("malformed")).toBeNull();
  });

  it("sub 欠落 → null", async () => {
    setEnv("LINE_LOGIN_CHANNEL_ID", CHANNEL);
    mockFetchOnce(200, { iss: "https://access.line.me", aud: CHANNEL, exp: future() });
    expect(await verifyLineIdTokenViaApi("no-sub")).toBeNull();
  });
});
