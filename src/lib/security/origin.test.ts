// SEC-003 CSRF 純関数の単体テスト。
import { describe, it, expect } from "vitest";
import {
  hasBearerToken,
  isWebhookPath,
  originOf,
  parseAllowedOrigins,
  selfOrigin,
  buildAllowedOrigins,
  evaluateCsrf,
  type CsrfRequestInfo,
} from "./origin";

// 標準的な「同一オリジンへの正当な状態変更」リクエストのベース。
function baseMutating(overrides: Partial<CsrfRequestInfo> = {}): CsrfRequestInfo {
  return {
    method: "POST",
    pathname: "/api/slots/abc/apply",
    origin: "https://rendez.example",
    referer: null,
    host: "rendez.example",
    forwardedProto: "https",
    authorization: null,
    ...overrides,
  };
}

describe("hasBearerToken", () => {
  it("detects Bearer token (case-insensitive, with whitespace)", () => {
    expect(hasBearerToken("Bearer abc123")).toBe(true);
    expect(hasBearerToken("bearer   xyz")).toBe(true);
    expect(hasBearerToken("BEARER tok")).toBe(true);
  });
  it("rejects empty / malformed / non-bearer", () => {
    expect(hasBearerToken(null)).toBe(false);
    expect(hasBearerToken("")).toBe(false);
    expect(hasBearerToken("Bearer")).toBe(false); // token 欠如
    expect(hasBearerToken("Bearer ")).toBe(false);
    expect(hasBearerToken("Basic abc")).toBe(false);
  });
});

describe("isWebhookPath", () => {
  it("matches /api/webhooks and subpaths", () => {
    expect(isWebhookPath("/api/webhooks")).toBe(true);
    expect(isWebhookPath("/api/webhooks/stripe")).toBe(true);
  });
  it("does not match unrelated paths", () => {
    expect(isWebhookPath("/api/webhook")).toBe(false);
    expect(isWebhookPath("/api/webhooksX")).toBe(false);
    expect(isWebhookPath("/api/slots")).toBe(false);
  });
});

describe("originOf", () => {
  it("extracts origin from a full URL (Referer)", () => {
    expect(originOf("https://rendez.example/path?q=1")).toBe(
      "https://rendez.example"
    );
    expect(originOf("https://rendez.example:8443/x")).toBe(
      "https://rendez.example:8443"
    );
  });
  it("returns null for null / invalid", () => {
    expect(originOf(null)).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

describe("parseAllowedOrigins", () => {
  it("parses comma-separated and normalizes", () => {
    const out = parseAllowedOrigins(
      "https://a.example, https://b.example/ ,https://c.example:3000"
    );
    expect(out).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example:3000",
    ]);
  });
  it("returns [] for empty/undefined and drops invalid entries", () => {
    expect(parseAllowedOrigins(null)).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins("garbage, https://ok.example")).toEqual([
      "https://ok.example",
    ]);
  });
});

describe("selfOrigin", () => {
  it("builds origin from host + proto", () => {
    expect(selfOrigin("rendez.example", "https")).toBe("https://rendez.example");
    expect(selfOrigin("localhost:3000", "http")).toBe("http://localhost:3000");
  });
  it("defaults to https when proto missing", () => {
    expect(selfOrigin("rendez.example", null)).toBe("https://rendez.example");
  });
  it("takes first proto when forwarded list", () => {
    expect(selfOrigin("rendez.example", "https,http")).toBe(
      "https://rendez.example"
    );
  });
  it("returns null without host", () => {
    expect(selfOrigin(null, "https")).toBeNull();
  });
});

describe("buildAllowedOrigins", () => {
  it("includes self-origin and env origins", () => {
    const set = buildAllowedOrigins(
      "rendez.example",
      "https",
      "https://extra.example"
    );
    expect(set.has("https://rendez.example")).toBe(true);
    expect(set.has("https://extra.example")).toBe(true);
  });
});

describe("evaluateCsrf", () => {
  const prod = { allowedOriginsEnv: null, isProduction: true };
  const dev = { allowedOriginsEnv: null, isProduction: false };

  it("passes non-mutating methods (GET/HEAD/OPTIONS) unconditionally", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const d = evaluateCsrf(
        baseMutating({ method, origin: "https://evil.example" }),
        prod
      );
      expect(d).toEqual({ ok: true, reason: "not_mutating" });
    }
  });

  it("allows same-origin mutating request", () => {
    const d = evaluateCsrf(baseMutating(), prod);
    expect(d).toEqual({ ok: true, reason: "origin_match" });
  });

  it("blocks cross-origin mutating request (403)", () => {
    const d = evaluateCsrf(
      baseMutating({ origin: "https://evil.example" }),
      prod
    );
    expect(d).toEqual({ ok: false, reason: "origin_mismatch" });
  });

  it("falls back to Referer origin when Origin header absent", () => {
    // 同一オリジンの Referer → 通過。
    const ok = evaluateCsrf(
      baseMutating({
        origin: null,
        referer: "https://rendez.example/some/page",
      }),
      prod
    );
    expect(ok).toEqual({ ok: true, reason: "origin_match" });

    // 別オリジンの Referer → 拒否。
    const bad = evaluateCsrf(
      baseMutating({ origin: null, referer: "https://evil.example/x" }),
      prod
    );
    expect(bad).toEqual({ ok: false, reason: "origin_mismatch" });
  });

  it("excludes Bearer-token requests even cross-origin (server-to-server)", () => {
    const d = evaluateCsrf(
      baseMutating({
        pathname: "/api/admin/identity/ai-queue",
        origin: "https://evil.example",
        authorization: "Bearer service-token",
      }),
      prod
    );
    expect(d).toEqual({ ok: true, reason: "bearer_excluded" });
  });

  it("excludes /api/webhooks/ paths (external signed webhooks)", () => {
    const d = evaluateCsrf(
      baseMutating({
        pathname: "/api/webhooks/stripe",
        origin: null,
        referer: null,
      }),
      prod
    );
    expect(d).toEqual({ ok: true, reason: "webhook_excluded" });
  });

  it("blocks missing Origin/Referer in production (non-bearer, non-webhook)", () => {
    const d = evaluateCsrf(
      baseMutating({ origin: null, referer: null }),
      prod
    );
    expect(d).toEqual({ ok: false, reason: "missing_origin_blocked" });
  });

  it("allows missing Origin/Referer in non-production (curl/tests/same-process fetch)", () => {
    const d = evaluateCsrf(baseMutating({ origin: null, referer: null }), dev);
    expect(d).toEqual({ ok: true, reason: "missing_origin_allowed_dev" });
  });

  it("honors ALLOWED_ORIGINS env for additional allowed origins", () => {
    const d = evaluateCsrf(
      baseMutating({ origin: "https://liff.line.me" }),
      { allowedOriginsEnv: "https://liff.line.me", isProduction: true }
    );
    expect(d).toEqual({ ok: true, reason: "origin_match" });
  });

  it("respects port differences as distinct origins", () => {
    const d = evaluateCsrf(
      baseMutating({
        origin: "https://rendez.example:8443",
        host: "rendez.example",
      }),
      prod
    );
    expect(d).toEqual({ ok: false, reason: "origin_mismatch" });
  });
});
