// =============================================================================
// 公開プレビューAPI / 公開DTO の **PII除去契約** テスト (01_s8_spec.md 要望1)。
//
// 検証方針:
//  1) シリアライザ（出口関門）を PII 満載の Profile で叩き、未認証に出してはいけない
//     文字列（氏名/displayName/photoUrl/lineUserId/正確な生年月日）が JSON に
//     一切現れないことを assert（not.toContain）。
//  2) 実 in-memory リポジトリ（seed 入り）に対して公開ルートを直接呼び、
//     HTTP レスポンスにも PII が漏れないことを end-to-end で確認。
//     ルートは requireUser を呼ばない＝未認証でも 200 が返ることもここで実証。
//
// リポジトリは __resetMemoryStore() で seed を使う（badges-route.test.ts と同流儀）。
// 公開ルートは認証不要のため guard のモックは不要。
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// server-only は node 環境の vitest では解決できないため no-op 化する
// （他のルートやヘルパが import "server-only" していても安全に同居できるように）。
vi.mock("server-only", () => ({}));

import { __resetMemoryStore } from "@/lib/repo/memory";
import type { ProfileEntity } from "@/lib/repo";
import { toPublicMemberDTO, toPublicSlotDTO, toAgeBand } from "@/lib/serializers";
import type { SlotEntity, GenderCounts } from "@/lib/repo";

import { GET as publicSlotsGET } from "../slots/route";
import { GET as publicSlotDetailGET } from "../slots/[id]/route";

// seed の水・恵比寿枠（誰でもOK・参加者あり）。memory.ts seed と一致。
const PREVIEW_SLOT_ID = "seed-slot-s8-wed-ebisu";

// seed の参加者 seed-user-male に実在する PII。これらが公開レスポンスに
// 出てはならない（出口関門が剥がすべき値）。memory.ts seed と一致。
const SEED_PII_NEEDLES = [
  "テスト太郎", // displayName
  "Umale00000000000000000000000seed", // lineUserId
  "S3太郎", // seed-m1 の displayName（同枠の別参加者）
  "S3花子", // seed-f1 の displayName
  "Us3male1", // seed-m1 の lineUserId
];

// 未認証メンバーDTO に許される唯一のキー集合（これ以外が生えたら漏洩）。
const PUBLIC_MEMBER_KEYS = [
  "ageBand",
  "gender",
  "occupation",
  "ratings",
  "hasPremiumBadge",
].sort();

beforeEach(() => {
  __resetMemoryStore();
});

afterEach(() => {
  __resetMemoryStore();
});

// ---------------------------------------------------------------------------
// 1) 出口関門（シリアライザ）の単体 PII 契約
// ---------------------------------------------------------------------------
describe("toPublicMemberDTO — PII 出口関門", () => {
  // PII を全部盛りした Profile。どれか1つでも DTO に残れば漏洩。
  const piiProfile: ProfileEntity = {
    id: "p_pii",
    userId: "u_pii",
    gender: "female",
    birthdate: new Date(Date.UTC(1988, 2, 22)), // 1988-03-22
    photoUrl: "https://cdn.example.com/private/hanako-face.png",
    bio: "私の電話は 090-1234-5678 です",
    areaPref: ["ebisu"],
    occupation: "creative",
    ratingAvg: 4.2,
    ratingCount: 5,
    attendedCount: 7,
    scoreAgainAvg: 4.5,
    scoreTalkAvg: 4.0,
    scoreMannerAvg: 4.1,
    noShowCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const PROFILE_PII_NEEDLES = [
    "hanako-face.png", // photoUrl
    "090-1234-5678", // bio / 連絡先
    "1988", // 正確な生年（年代band のみ可）
    "03-22", // 正確な月日
    "u_pii", // 内部 userId
    "p_pii", // 内部 profile id
  ];

  it("安全なキーだけを公開し、それ以外を一切含まない", () => {
    const dto = toPublicMemberDTO(piiProfile, true);
    expect(Object.keys(dto).sort()).toEqual(PUBLIC_MEMBER_KEYS);
  });

  it("シリアライズ結果のどこにも PII 文字列が現れない", () => {
    const dto = toPublicMemberDTO(piiProfile, true);
    const raw = JSON.stringify(dto);
    for (const needle of PROFILE_PII_NEEDLES) {
      expect(raw).not.toContain(needle);
    }
  });

  it("年代band は粗いバケットで、正確な生年月日を出さない", () => {
    const dto = toPublicMemberDTO(piiProfile, false);
    // 1988-03-22 は 2026 時点で 38歳 → 30代後半。
    expect(dto.ageBand).toBe("30代後半");
    // 多軸評価は集計値のみ（生データではない）。
    expect(dto.ratings).toEqual({
      again: 4.5,
      talk: 4.0,
      manner: 4.1,
      overall: 4.2,
      count: 5,
    });
    expect(dto.hasPremiumBadge).toBe(false);
  });
});

describe("toPublicSlotDTO — 枠属性のみ（個人特定情報なし）", () => {
  const slot: SlotEntity = {
    id: "slot_x",
    datetimeStart: new Date("2026-09-10T10:30:00Z"),
    area: "ebisu",
    capacityPerGender: 3,
    status: "open",
    minAge: null,
    maxAge: null,
    requiresBadge: false,
    feeMale: 2000,
    note: "運営メモ（公開しない）",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const counts: GenderCounts = { male: 2, female: 1 };

  it("運営メモなど枠の内部情報を公開DTOに含めない", () => {
    const dto = toPublicSlotDTO(slot, counts);
    const raw = JSON.stringify(dto);
    expect(raw).not.toContain("運営メモ");
    expect(dto).not.toHaveProperty("note");
    expect(dto.filled).toEqual({ male: 2, female: 1 });
  });
});

describe("toAgeBand — 正確な年齢を出さず年代バンドのみ", () => {
  const now = new Date("2026-05-31T00:00:00Z");
  it("20代前半/後半・30代前半を正しく丸める", () => {
    expect(toAgeBand(new Date(Date.UTC(2004, 0, 1)), now)).toBe("20代前半"); // 22
    expect(toAgeBand(new Date(Date.UTC(1999, 0, 1)), now)).toBe("20代後半"); // 27
    expect(toAgeBand(new Date(Date.UTC(1993, 0, 1)), now)).toBe("30代前半"); // 33
  });
});

// ---------------------------------------------------------------------------
// 2) 公開ルートの end-to-end PII 契約（実 seed リポジトリ・未認証）
// ---------------------------------------------------------------------------
describe("GET /api/public/slots — 未認証一覧", () => {
  it("認証なしで 200 を返し、open 枠を日時昇順で返す", async () => {
    const res = await publicSlotsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.slots)).toBe(true);
    expect(body.slots.length).toBeGreaterThan(0);
    // すべて open。
    for (const s of body.slots) {
      expect(s.status).toBe("open");
    }
    // 日時昇順。
    const times = body.slots.map((s: { datetimeStart: string }) =>
      new Date(s.datetimeStart).getTime(),
    );
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("一覧レスポンスにメンバーPIIも members 配列も含めない", async () => {
    const res = await publicSlotsGET();
    const body = await res.json();
    const raw = JSON.stringify(body);
    for (const needle of SEED_PII_NEEDLES) {
      expect(raw).not.toContain(needle);
    }
    // 一覧は filled の数のみ。参加者の詳細（members）は持たない。
    for (const s of body.slots) {
      expect(s).not.toHaveProperty("members");
      expect(s).toHaveProperty("filled");
    }
  });
});

describe("GET /api/public/slots/[id] — 未認証詳細", () => {
  function call(id: string) {
    return publicSlotDetailGET(new Request(`http://localhost/api/public/slots/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("認証なしで 200・枠 + 参加者の匿名サマリを返す", async () => {
    const res = await call(PREVIEW_SLOT_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(PREVIEW_SLOT_ID);
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBeGreaterThan(0);
    // 各メンバーは安全キーのみ。
    for (const m of body.members) {
      expect(Object.keys(m).sort()).toEqual(PUBLIC_MEMBER_KEYS);
    }
  });

  it("詳細レスポンスのどこにも参加者PIIが現れない", async () => {
    const res = await call(PREVIEW_SLOT_ID);
    const body = await res.json();
    const raw = JSON.stringify(body);
    for (const needle of SEED_PII_NEEDLES) {
      expect(raw).not.toContain(needle);
    }
    // 職種・年代band・多軸評価・バッジは見える（「すごさ」サマリ）。
    const withOcc = body.members.find(
      (m: { occupation: string | null }) => m.occupation !== null,
    );
    expect(withOcc).toBeTruthy();
    expect(typeof withOcc.ageBand).toBe("string");
    expect(withOcc.ratings).toHaveProperty("overall");
  });

  it("存在しない枠は 404（エラーエンベロープ）", async () => {
    const res = await call("does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("slot_not_found");
  });
});
