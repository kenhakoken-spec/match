// =============================================================================
// matching-app — S8 会場候補レコメンド route handler 統合テスト（admin）。
// 検証:
//  - 認可: 未ログイン → 401 / 一般ユーザー → 403 / admin → 200。
//  - GET /api/admin/venues?slotId=: fitScore 降順・食べログ/Google点併記・PII無し。
//  - POST suggest: 候補生成 + 運営通知 / 冪等 / 400(slotId欠落) / 404(枠なし)。
//  - POST [id]/choose: chosen 化 + 会場確定(venue_set) / 400 / 404 / 409(二重)。
//  - POST [id]/reject: rejected 化 / 認可 / 404。
//
// 認証は seal したセッション Cookie を next/headers モックの store に差し込む方式
// （matches-route.test.ts と同じ。route は cookies() で読むため Request ヘッダは使わない）。
// server-only は node 環境で throw するため空モジュールに置換する。
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// next/headers の cookies() を in-memory に置換（factory 内にストアを閉じ込め globalThis に保持）。
vi.mock("next/headers", () => {
  const g = globalThis as unknown as { __venueTestCookies?: Map<string, string> };
  if (!g.__venueTestCookies) g.__venueTestCookies = new Map<string, string>();
  const store = g.__venueTestCookies;
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

function setEnv(key: keyof typeof ORIG, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

function loginAs(sub: string, role: Role): void {
  const g = globalThis as unknown as { __venueTestCookies?: Map<string, string> };
  if (!g.__venueTestCookies) g.__venueTestCookies = new Map<string, string>();
  g.__venueTestCookies.set(SESSION_COOKIE, sealSession({ sub, role }));
}

function logout(): void {
  const g = globalThis as unknown as { __venueTestCookies?: Map<string, string> };
  g.__venueTestCookies?.clear();
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

// seed-slot-matched に会場候補3件、seed-slot-almost-full は候補なし & Match なし。
const MATCHED_SLOT = "seed-slot-matched";
const EMPTY_SLOT = "seed-slot-almost-full";
const TOP_CAND = "seed-venue-cand-1"; // fitScore 0.92（個室和食 銀座はなれ）
const LOW_CAND = "seed-venue-cand-3"; // fitScore 0.55（立ち飲み）

function getReq(url: string): Request {
  return new Request(url, { method: "GET" });
}
function postReq(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// -----------------------------------------------------------------------------
// 認可（admin 必須）
// -----------------------------------------------------------------------------
describe("admin venues — 認可（admin 必須）", () => {
  it("未ログインの GET → 401", async () => {
    const { GET } = await import("@/app/api/admin/venues/route");
    const res = await GET(
      getReq(`http://localhost/api/admin/venues?slotId=${MATCHED_SLOT}`) as never
    );
    expect(res.status).toBe(401);
  });

  it("一般ユーザーの GET → 403", async () => {
    loginAs("seed-user-male", "user");
    const { GET } = await import("@/app/api/admin/venues/route");
    const res = await GET(
      getReq(`http://localhost/api/admin/venues?slotId=${MATCHED_SLOT}`) as never
    );
    expect(res.status).toBe(403);
  });

  it("一般ユーザーの suggest → 403", async () => {
    loginAs("seed-user-male", "user");
    const { POST } = await import("@/app/api/admin/venues/suggest/route");
    const res = await POST(
      postReq("http://localhost/api/admin/venues/suggest", { slotId: MATCHED_SLOT }) as never
    );
    expect(res.status).toBe(403);
  });

  it("一般ユーザーの choose → 403", async () => {
    loginAs("seed-user-male", "user");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(
      postReq("http://localhost/x", { reservationName: "山田" }) as never,
      { params: { id: TOP_CAND } }
    );
    expect(res.status).toBe(403);
  });

  it("一般ユーザーの reject → 403", async () => {
    loginAs("seed-user-male", "user");
    const { POST } = await import("@/app/api/admin/venues/[id]/reject/route");
    const res = await POST(postReq("http://localhost/x") as never, {
      params: { id: LOW_CAND },
    });
    expect(res.status).toBe(403);
  });
});

// -----------------------------------------------------------------------------
// GET 一覧
// -----------------------------------------------------------------------------
describe("GET /api/admin/venues — 候補一覧（fitScore 降順 / 点併記 / PII無し）", () => {
  it("admin → 200。fitScore 降順・食べログ/Google点併記", async () => {
    loginAs("seed-admin", "admin");
    const { GET } = await import("@/app/api/admin/venues/route");
    const res = await GET(
      getReq(`http://localhost/api/admin/venues?slotId=${MATCHED_SLOT}`) as never
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{
        fitScore: number | null;
        tabelogScore: number | null;
        googleScore: number | null;
      }>;
    };
    expect(json.items).toHaveLength(3);
    for (let i = 1; i < json.items.length; i++) {
      expect(json.items[i - 1].fitScore!).toBeGreaterThanOrEqual(json.items[i].fitScore!);
    }
    expect(json.items[0]).toHaveProperty("tabelogScore");
    expect(json.items[0]).toHaveProperty("googleScore");
    // 出口DTO は監査フィールド suggestedBy を出さない。
    for (const item of json.items) {
      expect(item).not.toHaveProperty("suggestedBy");
    }
  });

  it("slotId 欠落の GET → 400", async () => {
    loginAs("seed-admin", "admin");
    const { GET } = await import("@/app/api/admin/venues/route");
    const res = await GET(getReq("http://localhost/api/admin/venues") as never);
    expect(res.status).toBe(400);
  });

  it("存在しない枠の GET → 404", async () => {
    loginAs("seed-admin", "admin");
    const { GET } = await import("@/app/api/admin/venues/route");
    const res = await GET(
      getReq("http://localhost/api/admin/venues?slotId=no-such-slot") as never
    );
    expect(res.status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// POST suggest
// -----------------------------------------------------------------------------
describe("POST /api/admin/venues/suggest — 候補生成 + 運営通知 / 冪等", () => {
  it("候補なし枠 → 200。created>0・notified=1", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/suggest/route");
    const res = await POST(
      postReq("http://localhost/api/admin/venues/suggest", { slotId: EMPTY_SLOT }) as never
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: unknown[];
      created: number;
      notified: number;
    };
    expect(json.created).toBeGreaterThan(0);
    expect(json.notified).toBe(1);
    expect(json.items.length).toBe(json.created);

    // 運営通知（reminder / kind=venue_candidates_ready）が記録される（admin 宛・PII無し）。
    const repo = getRepo();
    const notifs = (
      globalThis as unknown as {
        __mappStore?: {
          notifications: Array<{ userId: string; type: string; payload: { kind?: string } }>;
        };
      }
    ).__mappStore?.notifications.filter(
      (n) =>
        n.userId === "seed-admin" &&
        n.type === "reminder" &&
        n.payload?.kind === "venue_candidates_ready"
    );
    expect((notifs?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(notifs)).not.toContain("lineUserId");
    void repo;
  });

  it("候補ありの枠 → 冪等（created/notified 0・既存3件）", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/suggest/route");
    const res = await POST(
      postReq("http://localhost/api/admin/venues/suggest", { slotId: MATCHED_SLOT }) as never
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; created: number; notified: number };
    expect(json.created).toBe(0);
    expect(json.notified).toBe(0);
    expect(json.items.length).toBe(3);
  });

  it("slotId 欠落 → 400", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/suggest/route");
    const res = await POST(
      postReq("http://localhost/api/admin/venues/suggest", {}) as never
    );
    expect(res.status).toBe(400);
  });

  it("存在しない枠 → 404", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/suggest/route");
    const res = await POST(
      postReq("http://localhost/api/admin/venues/suggest", { slotId: "no-such-slot" }) as never
    );
    expect(res.status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// POST [id]/choose
// -----------------------------------------------------------------------------
describe("POST /api/admin/venues/[id]/choose — 採用 + 会場確定", () => {
  it("admin → 200。chosen 化・Match=venue_set・会場名は候補から転記", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(
      postReq("http://localhost/x", {
        reservationName: "山田",
        meetingPlace: "銀座駅A4出口",
      }) as never,
      { params: { id: TOP_CAND } }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      candidate: { status: string };
      match: {
        status: string;
        venue: { venueName: string; reservationName: string } | null;
        members: Array<Record<string, unknown>>;
      };
    };
    expect(json.candidate.status).toBe("chosen");
    expect(json.match.status).toBe("venue_set");
    expect(json.match.venue?.venueName).toBe("個室和食 銀座はなれ");
    expect(json.match.venue?.reservationName).toBe("山田");
    // admin 詳細 DTO の members は lineUserId/userId を含まない（PII最小）。
    for (const m of json.match.members) {
      expect(m).not.toHaveProperty("lineUserId");
      expect(m).not.toHaveProperty("userId");
    }
  });

  it("venueName/URL を上書き指定できる", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(
      postReq("http://localhost/x", {
        reservationName: "佐藤",
        venueName: "上書きの店",
        venueUrl: "https://example.com/override",
      }) as never,
      { params: { id: "seed-venue-cand-2" } }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      match: { venue: { venueName: string; venueUrl: string | null } | null };
    };
    expect(json.match.venue?.venueName).toBe("上書きの店");
    expect(json.match.venue?.venueUrl).toBe("https://example.com/override");
  });

  it("reservationName 欠落 → 400", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(postReq("http://localhost/x", {}) as never, {
      params: { id: TOP_CAND },
    });
    expect(res.status).toBe(400);
  });

  it("venueUrl が http(s) 以外 → 400（XSS スキーム対策）", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(
      postReq("http://localhost/x", {
        reservationName: "山田",
        venueUrl: "javascript:alert(1)",
      }) as never,
      { params: { id: TOP_CAND } }
    );
    expect(res.status).toBe(400);
  });

  it("存在しない候補 → 404", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const res = await POST(
      postReq("http://localhost/x", { reservationName: "山田" }) as never,
      { params: { id: "no-such-candidate" } }
    );
    expect(res.status).toBe(404);
  });

  it("二重 choose → 409（candidate_not_suggestable）", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/choose/route");
    const first = await POST(
      postReq("http://localhost/x", { reservationName: "山田" }) as never,
      { params: { id: TOP_CAND } }
    );
    expect(first.status).toBe(200);
    const second = await POST(
      postReq("http://localhost/x", { reservationName: "山田" }) as never,
      { params: { id: TOP_CAND } }
    );
    expect(second.status).toBe(409);
  });
});

// -----------------------------------------------------------------------------
// POST [id]/reject
// -----------------------------------------------------------------------------
describe("POST /api/admin/venues/[id]/reject — 却下", () => {
  it("admin → 200。rejected 化", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/reject/route");
    const res = await POST(postReq("http://localhost/x") as never, {
      params: { id: LOW_CAND },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { candidate: { status: string } };
    expect(json.candidate.status).toBe("rejected");
  });

  it("存在しない候補 → 404", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/reject/route");
    const res = await POST(postReq("http://localhost/x") as never, {
      params: { id: "no-such-candidate" },
    });
    expect(res.status).toBe(404);
  });

  it("既に rejected の候補 → 409（candidate_not_suggestable）", async () => {
    loginAs("seed-admin", "admin");
    const { POST } = await import("@/app/api/admin/venues/[id]/reject/route");
    await POST(postReq("http://localhost/x") as never, { params: { id: LOW_CAND } });
    const again = await POST(postReq("http://localhost/x") as never, {
      params: { id: LOW_CAND },
    });
    expect(again.status).toBe(409);
  });
});
