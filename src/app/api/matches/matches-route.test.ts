// =============================================================================
// matching-app — S3 route handler 統合テスト（認可 / IDOR / 段階制御）
// 検証:
//  - 非admin が admin venue/notify → 403
//  - notify は venue 未入力(pending_venue) → 409 / venue 入力後 → 200（6件 venue_to_member）
//  - ユーザー GET /api/matches/[id]: 参加者 → 200（notified 後のみ venue）/ 非参加者 → 404（IDOR）
//  - members に lineUserId を出さない
//
// server-only + next/headers をモック（cookies はテスト内で差し替え可能に）。
// 詳細: feedback-vitest-route-testing。
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// next/headers の cookies() を in-memory に置換（factory 内にストアを閉じ込め globalThis に保持）。
vi.mock("next/headers", () => {
  const g = globalThis as unknown as { __s3TestCookies?: Map<string, string> };
  if (!g.__s3TestCookies) g.__s3TestCookies = new Map<string, string>();
  const store = g.__s3TestCookies;
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
import { getRepo } from "@/lib/repo";
import { sealSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@/lib/types";

const ORIG = {
  NODE_ENV: process.env.NODE_ENV,
  MOCK_DB: process.env.MOCK_DB,
  MOCK_NOTIFY: process.env.MOCK_NOTIFY,
  MOCK_AUTH: process.env.MOCK_AUTH,
};

// NODE_ENV は @types/node で読み取り専用に推論されるため Record キャストで書き込む。
function setEnv(key: keyof typeof ORIG, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

// テスト用: 指定ユーザーでログイン状態にする（セッション Cookie を差し込む）。
function loginAs(sub: string, role: Role): void {
  const g = globalThis as unknown as { __s3TestCookies?: Map<string, string> };
  if (!g.__s3TestCookies) g.__s3TestCookies = new Map<string, string>();
  g.__s3TestCookies.set(SESSION_COOKIE, sealSession({ sub, role }));
}

function logout(): void {
  const g = globalThis as unknown as { __s3TestCookies?: Map<string, string> };
  g.__s3TestCookies?.clear();
}

beforeEach(() => {
  setEnv("NODE_ENV", "test");
  setEnv("MOCK_DB", "1");
  setEnv("MOCK_NOTIFY", "1");
  setEnv("MOCK_AUTH", "1");
  __resetMemoryStore();
  logout();
});

afterEach(() => {
  (Object.keys(ORIG) as (keyof typeof ORIG)[]).forEach((k) => setEnv(k, ORIG[k]));
  logout();
});

const PENDING_MATCH = "seed-match-pending"; // 成立済(pending_venue) on seed-slot-matched
const MEMBER = "seed-m1"; // 成立メンバー
const NON_MEMBER = "seed-user-female"; // 非参加者

function jsonReq(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// -----------------------------------------------------------------------------
// admin 認可
// -----------------------------------------------------------------------------
describe("admin authz — 非admin は venue/notify 不可（403）", () => {
  it("非admin（一般ユーザー）の venue → 403", async () => {
    loginAs(MEMBER, "user");
    const { POST } = await import("@/app/api/admin/matches/[id]/venue/route");
    const res = await POST(
      jsonReq("http://localhost/api/admin/matches/x/venue", {
        venueName: "X",
        reservationName: "Y",
      }) as never,
      { params: { id: PENDING_MATCH } }
    );
    expect(res.status).toBe(403);
  });

  it("非admin（一般ユーザー）の notify → 403", async () => {
    loginAs(MEMBER, "user");
    const { POST } = await import("@/app/api/admin/matches/[id]/notify/route");
    const res = await POST(jsonReq("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(res.status).toBe(403);
  });

  it("未ログインの admin 一覧 → 401", async () => {
    const { GET } = await import("@/app/api/admin/matches/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// -----------------------------------------------------------------------------
// notify の段階制御（venue 未入力 → 409 / 入力後 → 200 + 6件）
// -----------------------------------------------------------------------------
describe("admin notify — 段階制御", () => {
  it("venue 未入力(pending_venue)で notify → 409", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/matches/[id]/notify/route");
    const res = await POST(jsonReq("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("venue_not_set");
  });

  it("venue 入力 → venue_set → notify 200 で venue_to_member 6件 + notified + confirmed", async () => {
    loginAs("seed-admin", "admin");
    const venue = await import("@/app/api/admin/matches/[id]/venue/route");
    const venueRes = await venue.POST(
      jsonReq("http://localhost/api/admin/matches/x/venue", {
        venueName: "成立酒場",
        venueUrl: "https://example.com/r",
        reservationName: "マッチング・サトウ",
        meetingPlace: "改札前 18:45",
      }) as never,
      { params: { id: PENDING_MATCH } }
    );
    expect(venueRes.status).toBe(200);
    const venueJson = (await venueRes.json()) as { match?: { status?: string } };
    expect(venueJson.match?.status).toBe("venue_set");

    const notify = await import("@/app/api/admin/matches/[id]/notify/route");
    const notifyRes = await notify.POST(jsonReq("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(notifyRes.status).toBe(200);
    const notifyJson = (await notifyRes.json()) as {
      notified?: number;
      match?: { status?: string };
    };
    expect(notifyJson.notified).toBe(6);
    expect(notifyJson.match?.status).toBe("notified");

    const repo = getRepo();
    const logs = await repo.notifications.listByMatch(PENDING_MATCH, "venue_to_member");
    expect(logs).toHaveLength(6);
    expect((await repo.slots.findById("seed-slot-matched"))?.status).toBe("confirmed");
  });
});

// -----------------------------------------------------------------------------
// ユーザー GET /api/matches/[id] — IDOR + notified 前非露出 + PII
// -----------------------------------------------------------------------------
describe("GET /api/matches/[id] — IDOR / 段階 / PII", () => {
  it("非参加者 → 404（存在を漏らさない / IDOR）", async () => {
    loginAs(NON_MEMBER, "user");
    const { GET } = await import("@/app/api/matches/[id]/route");
    const res = await GET(new Request("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(res.status).toBe(404);
  });

  it("参加者 → 200。notified 前は venue=null（会場手配中）", async () => {
    loginAs(MEMBER, "user");
    const { GET } = await import("@/app/api/matches/[id]/route");
    const res = await GET(new Request("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      match?: {
        status?: string;
        venue?: unknown;
        members?: Array<Record<string, unknown>>;
      };
    };
    expect(json.match?.status).toBe("pending_venue");
    expect(json.match?.venue).toBeNull(); // notified 前は会場を出さない
    expect(json.match?.members).toHaveLength(6);
    // 【S12 #7/#4/#14】成立詳細では displayName/gender に加え age/occupation/bio を開示。
    // **PII最小は維持**: lineUserId/userId/birthdate は出さない。
    for (const m of json.match?.members ?? []) {
      expect(m).not.toHaveProperty("lineUserId");
      expect(m).not.toHaveProperty("userId");
      expect(m).not.toHaveProperty("birthdate"); // 生年月日そのものは出さない（age のみ）
      expect(Object.keys(m).sort()).toEqual([
        "age",
        "bio",
        "displayName",
        "gender",
        "occupation",
      ]);
      // age は整数 or null。occupation/bio は文字列 or null。
      expect(m.age === null || Number.isInteger(m.age)).toBe(true);
    }
  });

  it("参加者 → notify 後は venue が見える（会場露出は notified 後のみ）", async () => {
    // admin が venue 入力 + notify。
    loginAs("seed-admin", "admin");
    const venue = await import("@/app/api/admin/matches/[id]/venue/route");
    await venue.POST(
      jsonReq("http://localhost/x", {
        venueName: "夜会場",
        reservationName: "マッチング・タカハシ",
      }) as never,
      { params: { id: PENDING_MATCH } }
    );
    const notify = await import("@/app/api/admin/matches/[id]/notify/route");
    await notify.POST(jsonReq("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });

    // 参加者として詳細取得。
    loginAs(MEMBER, "user");
    const { GET } = await import("@/app/api/matches/[id]/route");
    const res = await GET(new Request("http://localhost/x") as never, {
      params: { id: PENDING_MATCH },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      match?: { status?: string; venue?: { venueName?: string } | null };
    };
    expect(json.match?.status).toBe("notified");
    expect(json.match?.venue?.venueName).toBe("夜会場");
  });
});
