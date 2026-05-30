// =============================================================================
// matching-app — S6 route handler 統合テスト(認可 / 本人 / 付与 / 冪等)。
// 検証:
//  - GET /api/badges/mine: 本人のみ(未ログイン 401)。premium 保有者 → badges に premium /
//    基準未満 → 進捗 remaining が正。
//  - admin grant/revoke 200。非admin grant → 403。重複付与は1つ(冪等: outcome=already)。
//  - 自動付与: Profile を基準充足させ evaluateAndGrantOnRating → mine に premium。
//
// server-only + next/headers をモック(cookies はテスト内で差し替え可能に)。
// badge ストア(repo/badge-repo)も毎テスト reset。詳細: feedback-vitest-route-testing。
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// next/headers の cookies() を in-memory に置換(factory 内にストアを閉じ込め globalThis に保持)。
vi.mock("next/headers", () => {
  const g = globalThis as unknown as { __s6TestCookies?: Map<string, string> };
  if (!g.__s6TestCookies) g.__s6TestCookies = new Map<string, string>();
  const store = g.__s6TestCookies;
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

import { __resetMemoryStore } from "@/lib/repo/memory";
import { __resetBadgeStore, getBadgeRepo } from "@/lib/repo/badge-repo";
import { getRepo } from "@/lib/repo";
import { evaluateAndGrantOnRating } from "@/lib/badge-service";
import { sealSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@/lib/types";
import type { ProfileEntity } from "@/lib/repo";

const ORIG = {
  NODE_ENV: process.env.NODE_ENV,
  MOCK_DB: process.env.MOCK_DB,
  MOCK_NOTIFY: process.env.MOCK_NOTIFY,
  MOCK_AUTH: process.env.MOCK_AUTH,
};

function setEnv(key: keyof typeof ORIG, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

function loginAs(sub: string, role: Role): void {
  const g = globalThis as unknown as { __s6TestCookies?: Map<string, string> };
  if (!g.__s6TestCookies) g.__s6TestCookies = new Map<string, string>();
  g.__s6TestCookies.set(SESSION_COOKIE, sealSession({ sub, role }));
}

function logout(): void {
  const g = globalThis as unknown as { __s6TestCookies?: Map<string, string> };
  g.__s6TestCookies?.clear();
}

beforeEach(() => {
  setEnv("NODE_ENV", "test");
  setEnv("MOCK_DB", "1");
  setEnv("MOCK_NOTIFY", "1");
  setEnv("MOCK_AUTH", "1");
  __resetMemoryStore();
  __resetBadgeStore();
  logout();
});

afterEach(() => {
  (Object.keys(ORIG) as (keyof typeof ORIG)[]).forEach((k) => setEnv(k, ORIG[k]));
  logout();
});

// seed: seed-user-male は premium 保有(badge-repo seed)。seed-user-female は未保有。
const PREMIUM_USER = "seed-user-male";
const PLAIN_USER = "seed-user-female";

function jsonReq(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** PLAIN_USER の Profile を取得(必ず存在する seed)。null なら fail。 */
async function plainProfile(): Promise<ProfileEntity> {
  const p = await getRepo().profiles.findByUserId(PLAIN_USER);
  if (!p) throw new Error("seed profile for PLAIN_USER not found");
  return p;
}

// -----------------------------------------------------------------------------
// GET /api/badges/mine — 本人のみ / premium 表示 / 進捗
// -----------------------------------------------------------------------------
describe("GET /api/badges/mine — 本人のみ / premium / 進捗", () => {
  it("未ログイン → 401", async () => {
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("premium 保有者 → badges に premium・progress.hasPremium=true・remaining 全0", async () => {
    loginAs(PREMIUM_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      badges: Array<{ type: string; grantedAt: string }>;
      progress: {
        hasPremium: boolean;
        remaining: { ratingAvg: number; ratingCount: number; attendedCount: number };
      };
    };
    expect(json.badges).toHaveLength(1);
    expect(json.badges[0]?.type).toBe("premium");
    expect(typeof json.badges[0]?.grantedAt).toBe("string");
    expect(json.progress.hasPremium).toBe(true);
    expect(json.progress.remaining).toEqual({
      ratingAvg: 0,
      ratingCount: 0,
      attendedCount: 0,
    });
  });

  it("基準未満ユーザー → badges 空・progress に現状と remaining(不足分)", async () => {
    loginAs(PLAIN_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      badges: unknown[];
      progress: {
        hasPremium: boolean;
        ratingAvg: number;
        ratingCount: number;
        attendedCount: number;
        remaining: { ratingAvg: number; ratingCount: number; attendedCount: number };
      };
    };
    expect(json.badges).toHaveLength(0);
    expect(json.progress.hasPremium).toBe(false);
    // seed-user-female は評価 0/0/0 → 4.0/5/2 不足。
    expect(json.progress.remaining).toEqual({
      ratingAvg: 4.0,
      ratingCount: 5,
      attendedCount: 2,
    });
  });

  it("mine は本人の集計のみ返す(他人の userId を渡す経路が無い=IDOR防止)", async () => {
    loginAs(PLAIN_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    const json = (await res.json()) as { progress: { hasPremium: boolean } };
    // PLAIN_USER 視点では premium 非保有(PREMIUM_USER の状態は混ざらない)。
    expect(json.progress.hasPremium).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// admin grant / revoke + 認可 + 冪等
// -----------------------------------------------------------------------------
describe("admin grant/revoke — 認可 / 冪等", () => {
  it("非admin の grant → 403", async () => {
    loginAs(PLAIN_USER, "user");
    const { POST } = await import("@/app/api/admin/badges/grant/route");
    const res = await POST(
      jsonReq("http://localhost/api/admin/badges/grant", { userId: PLAIN_USER })
    );
    expect(res.status).toBe(403);
  });

  it("未ログインの admin 一覧 → 401", async () => {
    const { GET } = await import("@/app/api/admin/badges/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("admin grant → 200 outcome=granted、再 grant → 200 outcome=already(冪等で1つ)", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/badges/grant/route");

    const res1 = await POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));
    expect(res1.status).toBe(200);
    const j1 = (await res1.json()) as { outcome: string; badge: unknown };
    expect(j1.outcome).toBe("granted");
    expect(j1.badge).not.toBeNull();

    const res2 = await POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));
    expect(res2.status).toBe(200);
    const j2 = (await res2.json()) as { outcome: string };
    expect(j2.outcome).toBe("already"); // 冪等

    // ストアには1件のみ(重複付与しない)。
    const all = await getBadgeRepo().listPremium();
    const forUser = all.filter((b) => b.userId === PLAIN_USER);
    expect(forUser).toHaveLength(1);
  });

  it("admin grant 後に mine で premium が見える(付与の反映)", async () => {
    loginAs("seed-admin", "admin");
    const grant = await import("@/app/api/admin/badges/grant/route");
    await grant.POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));

    loginAs(PLAIN_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    const json = (await res.json()) as {
      badges: unknown[];
      progress: { hasPremium: boolean };
    };
    expect(json.badges).toHaveLength(1);
    expect(json.progress.hasPremium).toBe(true);
  });

  it("admin grant → revoke → mine で消える。再 revoke は outcome=absent(冪等)", async () => {
    loginAs("seed-admin", "admin");
    const grant = await import("@/app/api/admin/badges/grant/route");
    await grant.POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));

    const revoke = await import("@/app/api/admin/badges/revoke/route");
    const r1 = await revoke.POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { outcome: string };
    expect(j1.outcome).toBe("revoked");

    const r2 = await revoke.POST(jsonReq("http://localhost/x", { userId: PLAIN_USER }));
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { outcome: string };
    expect(j2.outcome).toBe("absent"); // 冪等

    // mine で消えている。
    loginAs(PLAIN_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    const json = (await res.json()) as { badges: unknown[] };
    expect(json.badges).toHaveLength(0);
  });

  it("存在しない userId への grant → 404", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/badges/grant/route");
    const res = await POST(jsonReq("http://localhost/x", { userId: "nobody-xyz" }));
    expect(res.status).toBe(404);
  });

  it("userId 欠落の grant → 400(validation_error)", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/badges/grant/route");
    const res = await POST(jsonReq("http://localhost/x", {}));
    expect(res.status).toBe(400);
  });

  it("admin 一覧 GET → seed の premium 保有者を含む", async () => {
    loginAs("seed-admin", "admin");
    const { GET } = await import("@/app/api/admin/badges/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ userId: string; type: string; grantedBy: string | null }>;
    };
    const seedRow = json.items.find((r) => r.userId === PREMIUM_USER);
    expect(seedRow).toBeDefined();
    expect(seedRow?.type).toBe("premium");
  });
});

// -----------------------------------------------------------------------------
// 自動付与(S5 結線点のサービス関数)
// -----------------------------------------------------------------------------
describe("evaluateAndGrantOnRating — 評価確定時の自動付与(冪等)", () => {
  it("Profile が基準充足 → premium 自動付与(granted) → mine に反映", async () => {
    // seed-user-female の評価集計を基準充足へ書き換える(テスト前提のセットアップ)。
    const profile = await plainProfile();
    profile.ratingAvg = 4.2;
    profile.ratingCount = 6;
    profile.attendedCount = 2;

    const r1 = await evaluateAndGrantOnRating(PLAIN_USER);
    expect(r1.granted).toBe(true);
    expect(r1.record).not.toBeNull();

    // 2回目は冪等(既保有 → granted=false)。
    const r2 = await evaluateAndGrantOnRating(PLAIN_USER);
    expect(r2.granted).toBe(false);

    // mine に premium。
    loginAs(PLAIN_USER, "user");
    const { GET } = await import("@/app/api/badges/mine/route");
    const res = await GET();
    const json = (await res.json()) as { progress: { hasPremium: boolean } };
    expect(json.progress.hasPremium).toBe(true);

    // ストアは1件のみ。
    const forUser = (await getBadgeRepo().listPremium()).filter(
      (b) => b.userId === PLAIN_USER
    );
    expect(forUser).toHaveLength(1);
  });

  it("Profile が基準未満 → 付与しない(granted=false / record=null)", async () => {
    const profile = await plainProfile();
    profile.ratingAvg = 3.9; // 4.0 未満
    profile.ratingCount = 6;
    profile.attendedCount = 2;

    const r = await evaluateAndGrantOnRating(PLAIN_USER);
    expect(r.granted).toBe(false);
    expect(r.record).toBeNull();
    expect(await getBadgeRepo().hasPremium(PLAIN_USER)).toBe(false);
  });

  it("自動付与時 badge_granted 通知が記録される(payload に lineUserId を含まない)", async () => {
    const profile = await plainProfile();
    profile.ratingAvg = 4.5;
    profile.ratingCount = 10;
    profile.attendedCount = 4;

    await evaluateAndGrantOnRating(PLAIN_USER);

    // notify-mock は NotificationLog(repo) に記録する。badge_granted を確認。
    const g = globalThis as unknown as {
      __mappStore?: {
        notifications: Array<{ userId: string; type: string; payload: unknown }>;
      };
    };
    const logs = (g.__mappStore?.notifications ?? []).filter(
      (n) => n.type === "badge_granted" && n.userId === PLAIN_USER
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const first = logs[0];
    expect(first).toBeDefined();
    expect(JSON.stringify(first?.payload)).not.toContain("lineUserId");
  });
});
