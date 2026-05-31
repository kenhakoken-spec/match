// trigger-auth.test.ts — 本人認証 AI 判定トリガーのトークン認証（フェイルクローズ）。
import { describe, it, expect, afterEach, vi } from "vitest";

// trigger-auth.ts は "server-only" を import するため node 実行用に空モック。
vi.mock("server-only", () => ({}));

import {
  extractBearer,
  requireTriggerToken,
  TriggerAuthError,
} from "@/lib/auth/trigger-auth";

const ENV_SNAPSHOT = { ...process.env };

// NODE_ENV は @types/node で読み取り専用に推論されるため Record キャストで書き換える
// （sibling テスト haiku-verify-flow.test.ts と同じ作法）。
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
});

function reqWith(auth?: string): Request {
  return new Request("http://localhost/api/admin/identity/ai-queue", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("extractBearer", () => {
  it("Bearer トークンを取り出す", () => {
    expect(extractBearer("Bearer abc.def")).toBe("abc.def");
    expect(extractBearer("bearer xyz")).toBe("xyz"); // 大小無視
  });
  it("Bearer でない/空は null", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer("Token abc")).toBeNull();
    expect(extractBearer("")).toBeNull();
  });
});

describe("requireTriggerToken（非production・既定 dev トークン）", () => {
  it("正しいトークンなら通る（例外なし）", () => {
    setEnv("AI_TRIGGER_TOKEN", undefined); // 非production 既定 dev-ai-trigger-token
    setEnv("NODE_ENV", "test");
    expect(() => requireTriggerToken(reqWith("Bearer dev-ai-trigger-token"))).not.toThrow();
  });

  it("env で設定したトークンが優先される", () => {
    setEnv("NODE_ENV", "test");
    setEnv("AI_TRIGGER_TOKEN", "secret-123");
    expect(() => requireTriggerToken(reqWith("Bearer secret-123"))).not.toThrow();
    expect(() => requireTriggerToken(reqWith("Bearer dev-ai-trigger-token"))).toThrow(
      TriggerAuthError
    );
  });

  it("トークン欠如/不一致は 401", () => {
    setEnv("NODE_ENV", "test");
    setEnv("AI_TRIGGER_TOKEN", undefined);
    try {
      requireTriggerToken(reqWith());
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TriggerAuthError);
      expect((e as TriggerAuthError).status).toBe(401);
    }
    expect(() => requireTriggerToken(reqWith("Bearer wrong"))).toThrow(TriggerAuthError);
  });
});

describe("requireTriggerToken（production・フェイルクローズ）", () => {
  it("本番で AI_TRIGGER_TOKEN 未設定なら 503（既定トークンで開かない）", () => {
    setEnv("NODE_ENV", "production");
    setEnv("AI_TRIGGER_TOKEN", undefined);
    try {
      requireTriggerToken(reqWith("Bearer dev-ai-trigger-token"));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TriggerAuthError);
      expect((e as TriggerAuthError).status).toBe(503);
    }
  });

  it("本番でトークン設定済みなら一致検証", () => {
    setEnv("NODE_ENV", "production");
    setEnv("AI_TRIGGER_TOKEN", "prod-secret");
    expect(() => requireTriggerToken(reqWith("Bearer prod-secret"))).not.toThrow();
    expect(() => requireTriggerToken(reqWith("Bearer nope"))).toThrow(TriggerAuthError);
  });
});
