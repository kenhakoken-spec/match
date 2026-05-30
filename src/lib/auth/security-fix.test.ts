// =============================================================================
// SEC-001 / SEC-002 単体テスト
// - SEC-001: モック群のフェイルクローズ(本番は MOCK_* を無視して常に無効)
// - SEC-001: 本番 dev-login は 404(MOCK_AUTH=1 でも無視)
// - SEC-001: 本番で AUTH_JWT_SECRET 未設定なら session 鍵導出が throw
// - SEC-002: 実モードで LINE 実検証が未実装なら verifyLineIdToken が throw
//
// server-only / next/headers はサーバ専用のため vitest(node)では import 時に
// 失敗する。factory モックで無害化する(本番ロジックには影響しない)。
// =============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";

// "server-only" は import するだけで throw するスタブ。空モジュールに置換。
vi.mock("server-only", () => ({}));

// next/headers の cookies() を in-memory 実装に置換する。
// vitest(node) には Next のリクエストコンテキストが無く本物の cookies() は
// DynamicServerError を投げるため。factory は巻き上げられるので外部変数を
// 参照せず、ストアを factory 内に閉じ込める(globalThis 経由で保持)。
// これにより session.ts の seal/open(getKey のフェイルクローズ検証)と
// dev-login route の Cookie セットが node 環境でも動く。
vi.mock("next/headers", () => {
  const g = globalThis as unknown as { __secTestCookies?: Map<string, string> };
  if (!g.__secTestCookies) g.__secTestCookies = new Map<string, string>();
  const store = g.__secTestCookies;
  return {
    __esModule: true,
    default: {},
    cookies: () => ({
      get: (name: string) =>
        store.has(name) ? { name, value: store.get(name) } : undefined,
      set: (arg: { name: string; value: string } | string, value?: string) => {
        if (typeof arg === "string") store.set(arg, value ?? "");
        else store.set(arg.name, arg.value);
      },
    }),
  };
});

import {
  isMockAuthEnabled,
  isMockDbEnabled,
  isMockNotifyEnabled,
  isProduction,
} from "@/lib/env";
import {
  isMockAuth,
  verifyLineIdToken,
  verifyLineIdTokenMock,
  LineVerificationUnavailableError,
} from "@/lib/auth/line-mock";
import { sealSession, openSession } from "@/lib/auth/session";

// process.env をテスト毎に復元する。
const ORIG = {
  NODE_ENV: process.env.NODE_ENV,
  MOCK_AUTH: process.env.MOCK_AUTH,
  MOCK_DB: process.env.MOCK_DB,
  MOCK_NOTIFY: process.env.MOCK_NOTIFY,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
};

function setEnv(key: keyof typeof ORIG, value: string | undefined) {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

afterEach(() => {
  (Object.keys(ORIG) as (keyof typeof ORIG)[]).forEach((k) => setEnv(k, ORIG[k]));
});

// -----------------------------------------------------------------------------
// SEC-001: env.ts 集約フラグのフェイルクローズ
// -----------------------------------------------------------------------------
describe("SEC-001 env mock flags (fail-close)", () => {
  it("非production: 未設定なら既定 ON", () => {
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", undefined);
    setEnv("MOCK_DB", undefined);
    setEnv("MOCK_NOTIFY", undefined);
    expect(isMockAuthEnabled()).toBe(true);
    expect(isMockDbEnabled()).toBe(true);
    expect(isMockNotifyEnabled()).toBe(true);
  });

  it("非production: MOCK_*=0 を明示すると OFF", () => {
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", "0");
    setEnv("MOCK_DB", "0");
    setEnv("MOCK_NOTIFY", "0");
    expect(isMockAuthEnabled()).toBe(false);
    expect(isMockDbEnabled()).toBe(false);
    expect(isMockNotifyEnabled()).toBe(false);
  });

  it("非production: MOCK_AUTH=1 は ON", () => {
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", "1");
    expect(isMockAuthEnabled()).toBe(true);
  });

  it("production: 未設定でも常に OFF(フェイルクローズ)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AUTH", undefined);
    setEnv("MOCK_DB", undefined);
    setEnv("MOCK_NOTIFY", undefined);
    expect(isProduction()).toBe(true);
    expect(isMockAuthEnabled()).toBe(false);
    expect(isMockDbEnabled()).toBe(false);
    expect(isMockNotifyEnabled()).toBe(false);
  });

  it("production: MOCK_*=1 を明示しても OFF(値を無視)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AUTH", "1");
    setEnv("MOCK_DB", "1");
    setEnv("MOCK_NOTIFY", "1");
    expect(isMockAuthEnabled()).toBe(false);
    expect(isMockDbEnabled()).toBe(false);
    expect(isMockNotifyEnabled()).toBe(false);
  });

  it("isMockAuth() は env 集約判定に一致(本番 OFF)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AUTH", "1");
    expect(isMockAuth()).toBe(false);
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", undefined);
    expect(isMockAuth()).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// SEC-001: session 鍵フォールバック(本番 secret 未設定は throw)
// -----------------------------------------------------------------------------
describe("SEC-001 session key fallback", () => {
  it("production + AUTH_JWT_SECRET 未設定 → sealSession が throw", () => {
    setEnv("NODE_ENV", "production");
    setEnv("AUTH_JWT_SECRET", undefined);
    expect(() => sealSession({ sub: "u1", role: "user" })).toThrowError(
      /AUTH_JWT_SECRET is required in production/
    );
  });

  it("production + AUTH_JWT_SECRET 設定 → seal/open が成立", () => {
    setEnv("NODE_ENV", "production");
    setEnv("AUTH_JWT_SECRET", "a-strong-prod-secret-value-1234567890");
    const token = sealSession({ sub: "u1", role: "admin" });
    const opened = openSession(token);
    expect(opened?.sub).toBe("u1");
    expect(opened?.role).toBe("admin");
  });

  it("非production + secret 未設定 → dev ダミー鍵で成立(開発体験維持)", () => {
    setEnv("NODE_ENV", "development");
    setEnv("AUTH_JWT_SECRET", undefined);
    const token = sealSession({ sub: "u2", role: "user" });
    expect(openSession(token)?.sub).toBe("u2");
  });
});

// -----------------------------------------------------------------------------
// SEC-002: 実モードの LINE 検証ガード
// -----------------------------------------------------------------------------
describe("SEC-002 LINE verification guard", () => {
  it("モック有効(非production): verifyLineIdToken は sub を信頼", () => {
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", undefined);
    const v = verifyLineIdToken("Ualice");
    expect(v?.lineUserId).toBe("Ualice");
  });

  it("実モード(production): verifyLineIdToken は throw(モックへ非フォールバック)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AUTH", "1"); // 本番は無視されモック無効
    expect(() => verifyLineIdToken("Umallory")).toThrowError(
      LineVerificationUnavailableError
    );
  });

  it("verifyLineIdTokenMock 単体は従来通り sub を返す", () => {
    expect(verifyLineIdTokenMock("Ubob")?.lineUserId).toBe("Ubob");
    expect(verifyLineIdTokenMock("")).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// SEC-001: dev-login route の本番 404
// -----------------------------------------------------------------------------
describe("SEC-001 dev-login route prod guard", () => {
  it("production → 404(MOCK_AUTH=1 でも)", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AUTH", "1");
    setEnv("MOCK_DB", "1");
    const { POST } = await import("@/app/api/auth/dev-login/route");
    const req = new Request("http://localhost/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("not_found");
  });

  it("非production + MOCK_DB=1 → 200(開発動作維持)", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MOCK_AUTH", "1");
    setEnv("MOCK_DB", "1");
    const { POST } = await import("@/app/api/auth/dev-login/route");
    const req = new Request("http://localhost/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { user?: { role?: string } };
    expect(json.user?.role).toBe("admin");
  });
});
