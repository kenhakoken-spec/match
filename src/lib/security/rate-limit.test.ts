// SEC-004 レート制限 純関数 + ストア判定の単体テスト。
import { describe, it, expect, afterEach } from "vitest";
import {
  RATE_LIMITS,
  WINDOW_MS,
  categorize,
  clientIp,
  rateLimitKey,
  decideFixedWindow,
  consume,
  applyRateLimit,
  resetRateLimitForTest,
} from "./rate-limit";

afterEach(() => {
  // globalThis 共有ストアを毎テスト後にクリア（テスト間の独立性）。
  resetRateLimitForTest();
});

describe("categorize", () => {
  it("classifies auth paths", () => {
    expect(categorize("/api/auth")).toBe("auth");
    expect(categorize("/api/auth/line")).toBe("auth");
    expect(categorize("/api/auth/dev-login")).toBe("auth");
  });
  it("classifies identity paths (including upload)", () => {
    expect(categorize("/api/identity")).toBe("identity");
    expect(categorize("/api/identity/upload")).toBe("identity");
  });
  it("classifies venues suggest (specific path wins)", () => {
    expect(categorize("/api/admin/venues/suggest")).toBe("venues_suggest");
  });
  it("classifies slot apply with any id segment", () => {
    expect(categorize("/api/slots/abc123/apply")).toBe("slots_apply");
    expect(categorize("/api/slots/abc123/apply/")).toBe("slots_apply");
  });
  it("does not misclassify slot cancel or base slots as apply", () => {
    expect(categorize("/api/slots/abc/cancel")).toBe("default");
    expect(categorize("/api/slots")).toBe("default");
  });
  it("admin identity review is NOT the identity category (falls to default)", () => {
    // /api/admin/identity は本人確認アップロードとは別系統 → default 上限。
    expect(categorize("/api/admin/identity")).toBe("default");
    expect(categorize("/api/admin/identity/x/approve")).toBe("default");
  });
  it("falls back to default for other api paths", () => {
    expect(categorize("/api/me")).toBe("default");
    expect(categorize("/api/profile")).toBe("default");
  });
});

describe("clientIp", () => {
  it("uses first entry of x-forwarded-for", () => {
    expect(clientIp("1.2.3.4, 5.6.7.8", null)).toBe("1.2.3.4");
    expect(clientIp("  9.9.9.9  ", null)).toBe("9.9.9.9");
  });
  it("falls back to x-real-ip", () => {
    expect(clientIp(null, "10.0.0.1")).toBe("10.0.0.1");
  });
  it("falls back to 'unknown'", () => {
    expect(clientIp(null, null)).toBe("unknown");
    expect(clientIp("", "")).toBe("unknown");
  });
});

describe("rateLimitKey", () => {
  it("combines ip and category", () => {
    expect(rateLimitKey("1.2.3.4", "auth")).toBe("1.2.3.4::auth");
  });
});

describe("decideFixedWindow (pure)", () => {
  it("starts a new window when none exists", () => {
    const { nextState, result } = decideFixedWindow(undefined, 5, 1000);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.remaining).toBe(4);
    expect(nextState).toEqual({ count: 1, windowStart: 1000 });
  });

  it("increments within the window until the limit", () => {
    let state = decideFixedWindow(undefined, 3, 0).nextState;
    let r = decideFixedWindow(state, 3, 10);
    state = r.nextState;
    expect(r.result.allowed).toBe(true); // 2nd
    r = decideFixedWindow(state, 3, 20);
    state = r.nextState;
    expect(r.result.allowed).toBe(true); // 3rd (== limit)
    expect(r.result.remaining).toBe(0);
  });

  it("rejects once the limit is reached (count not increased beyond limit)", () => {
    const atLimit = { count: 3, windowStart: 0 };
    const r = decideFixedWindow(atLimit, 3, 30);
    expect(r.result.allowed).toBe(false);
    expect(r.result.used).toBe(3);
    expect(r.result.remaining).toBe(0);
    expect(r.nextState).toBe(atLimit); // 拒否時は状態を変えない
    expect(r.result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("resets the window after WINDOW_MS elapsed", () => {
    const old = { count: 99, windowStart: 0 };
    const r = decideFixedWindow(old, 5, WINDOW_MS); // exactly at boundary → reset
    expect(r.result.allowed).toBe(true);
    expect(r.result.used).toBe(1);
    expect(r.nextState).toEqual({ count: 1, windowStart: WINDOW_MS });
  });

  it("computes Retry-After from remaining window time", () => {
    const state = { count: 5, windowStart: 0 };
    // 10s 経過 → 残り 50s。
    const r = decideFixedWindow(state, 5, 10_000);
    expect(r.result.allowed).toBe(false);
    expect(r.result.retryAfterSec).toBe(50);
  });
});

describe("consume (store-backed)", () => {
  it("allows up to the limit then rejects within the same window", () => {
    const now = 1_000_000;
    const limit = 3;
    const key = "ip::default";
    expect(consume(key, limit, now).allowed).toBe(true); // 1
    expect(consume(key, limit, now + 1).allowed).toBe(true); // 2
    expect(consume(key, limit, now + 2).allowed).toBe(true); // 3
    const rejected = consume(key, limit, now + 3);
    expect(rejected.allowed).toBe(false); // 4 → 429
    expect(rejected.remaining).toBe(0);
  });

  it("allows again after the window resets", () => {
    const now = 2_000_000;
    const key = "ip::auth";
    consume(key, 1, now); // fills window
    expect(consume(key, 1, now + 1).allowed).toBe(false);
    expect(consume(key, 1, now + WINDOW_MS).allowed).toBe(true); // new window
  });

  it("keeps separate counters per key (category isolation)", () => {
    const now = 3_000_000;
    consume("ip::auth", 1, now);
    // 別カテゴリ（別キー）は独立に許可される。
    expect(consume("ip::identity", 1, now).allowed).toBe(true);
    // 同キーは拒否。
    expect(consume("ip::auth", 1, now).allowed).toBe(false);
  });
});

describe("applyRateLimit (end-to-end of categorize + consume)", () => {
  it("applies the auth limit (20/min)", () => {
    const now = 5_000_000;
    let last = { allowed: true } as { allowed: boolean };
    for (let i = 0; i < RATE_LIMITS.auth; i++) {
      last = applyRateLimit({
        pathname: "/api/auth/line",
        forwardedFor: "8.8.8.8",
        realIp: null,
        now: now + i,
      });
      expect(last.allowed).toBe(true);
    }
    const over = applyRateLimit({
      pathname: "/api/auth/line",
      forwardedFor: "8.8.8.8",
      realIp: null,
      now: now + RATE_LIMITS.auth,
    });
    expect(over.allowed).toBe(false);
    expect(over.category).toBe("auth");
    expect(over.limit).toBe(20);
  });

  it("applies the identity limit (10/min)", () => {
    const now = 6_000_000;
    for (let i = 0; i < RATE_LIMITS.identity; i++) {
      const r = applyRateLimit({
        pathname: "/api/identity/upload",
        forwardedFor: "7.7.7.7",
        realIp: null,
        now: now + i,
      });
      expect(r.allowed).toBe(true);
    }
    const over = applyRateLimit({
      pathname: "/api/identity/upload",
      forwardedFor: "7.7.7.7",
      realIp: null,
      now: now + RATE_LIMITS.identity,
    });
    expect(over.allowed).toBe(false);
    expect(over.limit).toBe(10);
  });

  it("applies the slots_apply limit (30/min) and isolates by IP", () => {
    const now = 7_000_000;
    // IP A fills its apply window.
    for (let i = 0; i < RATE_LIMITS.slots_apply; i++) {
      expect(
        applyRateLimit({
          pathname: "/api/slots/s1/apply",
          forwardedFor: "1.1.1.1",
          realIp: null,
          now: now + i,
        }).allowed
      ).toBe(true);
    }
    expect(
      applyRateLimit({
        pathname: "/api/slots/s1/apply",
        forwardedFor: "1.1.1.1",
        realIp: null,
        now: now + RATE_LIMITS.slots_apply,
      }).allowed
    ).toBe(false);
    // 別 IP は影響を受けない。
    expect(
      applyRateLimit({
        pathname: "/api/slots/s1/apply",
        forwardedFor: "2.2.2.2",
        realIp: null,
        now: now + RATE_LIMITS.slots_apply,
      }).allowed
    ).toBe(true);
  });

  it("default category allows 120/min", () => {
    const now = 8_000_000;
    const r = applyRateLimit({
      pathname: "/api/me",
      forwardedFor: "3.3.3.3",
      realIp: null,
      now,
    });
    expect(r.category).toBe("default");
    expect(r.limit).toBe(RATE_LIMITS.default);
    expect(r.limit).toBe(120);
  });
});
