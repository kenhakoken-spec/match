// =============================================================================
// matching-app — S3 成立サービスの単体テスト（match-service + repo 統合）
// in-memory リポジトリを使い、成立確定 → 会場 → 通知 → 参加者判定(IDOR) を検証する。
// route handler を介さずサービス層を直接叩く（cookies 不要なので next/headers モック不要）。
//
// server-only は node 環境では import で throw するため空モジュールに置換する
// （match-service / notify-mock / repo 経由）。詳細: feedback-vitest-route-testing。
// 正典: docs/backend/api-contract-s3.md §1,§2,§3
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  finalizeMatchOnApply,
  notifyMatchMembers,
  getMatchMembers,
  isMatchParticipant,
} from "./match-service";
import { getRepo } from "./repo";
import { __resetMemoryStore } from "./repo/memory";

const ORIG = {
  NODE_ENV: process.env.NODE_ENV,
  MOCK_DB: process.env.MOCK_DB,
  MOCK_NOTIFY: process.env.MOCK_NOTIFY,
};

// NODE_ENV は @types/node で読み取り専用に推論されるため Record キャストで書き込む。
function setEnv(key: keyof typeof ORIG, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

beforeEach(() => {
  setEnv("NODE_ENV", "test");
  setEnv("MOCK_DB", "1");
  setEnv("MOCK_NOTIFY", "1");
  __resetMemoryStore();
});

afterEach(() => {
  (Object.keys(ORIG) as (keyof typeof ORIG)[]).forEach((k) => setEnv(k, ORIG[k]));
});

// seed の「成立済 pending_venue」枠（男3/女3 accepted, Match=seed-match-pending）。
const MATCHED_SLOT = "seed-slot-matched";
const PENDING_MATCH = "seed-match-pending";

describe("getMatchMembers — PII最小（6名 / displayName+gender）", () => {
  it("成立済枠から 6名（男3女3）を返し、lineUserId を含まない", async () => {
    const members = await getMatchMembers(MATCHED_SLOT);
    expect(members).toHaveLength(6);
    const males = members.filter((m) => m.gender === "male");
    const females = members.filter((m) => m.gender === "female");
    expect(males).toHaveLength(3);
    expect(females).toHaveLength(3);
    // MatchMemberRow は userId/displayName/gender のみ。lineUserId フィールドは存在しない。
    for (const m of members) {
      expect(m).not.toHaveProperty("lineUserId");
      expect(typeof m.displayName === "string" || m.displayName === null).toBe(true);
    }
  });
});

describe("finalizeMatchOnApply — 成立確定（冪等 / accepted / match_to_admin）", () => {
  it("成立直前枠を埋めると Match(pending_venue) 生成 + 6名 accepted + admin通知1件", async () => {
    const repo = getRepo();
    const slotId = "seed-slot-almost-full"; // 男3/女2 applied（あと1名で成立）

    // 6人目（女性 seed-f3）を応募させて成立させる。
    const res = await repo.applications.applyAtomic(
      { slotId, userId: "seed-f3", gender: "female" },
      3
    );
    expect(res.error).toBeNull();
    expect(res.matched).toBe(true); // applyAtomic が成立を検知

    // 成立確定を実行。
    const match = await finalizeMatchOnApply(slotId);
    expect(match.status).toBe("pending_venue");

    // 6名全員 accepted。
    const active = await repo.applications.listActiveBySlot(slotId);
    expect(active).toHaveLength(6);
    expect(active.every((a) => a.status === "accepted")).toBe(true);

    // 運営内部通知 match_to_admin が記録される（宛先=seed-admin）。
    const adminNotifs = await repo.notifications.listByMatch(match.id, "match_to_admin");
    expect(adminNotifs.length).toBeGreaterThanOrEqual(1);
    expect(adminNotifs[0]?.userId).toBe("seed-admin");
    // payload に lineUserId を残さない（PII最小）。
    expect(JSON.stringify(adminNotifs[0]?.payload)).not.toContain("lineUserId");
  });

  it("冪等: 2回呼んでも match_to_admin が二重記録されない", async () => {
    const repo = getRepo();
    const slotId = "seed-slot-almost-full";
    await repo.applications.applyAtomic(
      { slotId, userId: "seed-f3", gender: "female" },
      3
    );
    const m1 = await finalizeMatchOnApply(slotId);
    const m2 = await finalizeMatchOnApply(slotId);
    expect(m1.id).toBe(m2.id); // 同じ Match（再作成しない）

    const adminNotifs = await repo.notifications.listByMatch(m1.id, "match_to_admin");
    expect(adminNotifs).toHaveLength(1); // 二重通知なし
  });
});

describe("notifyMatchMembers — 6名へ venue_to_member + Match notified + Slot confirmed", () => {
  it("会場設定後に通知すると NotificationLog 6件 + notified + confirmed", async () => {
    const repo = getRepo();
    // seed-match-pending に会場を入れる。
    const set = await repo.matches.setVenue(PENDING_MATCH, {
      venueName: "テスト酒場",
      venueUrl: "https://example.com/x",
      reservationName: "マッチング・ヤマダ",
      meetingPlace: "店前 18:50",
    });
    expect(set?.status).toBe("venue_set");

    const match = (await repo.matches.findById(PENDING_MATCH))!;
    const slot = (await repo.slots.findById(MATCHED_SLOT))!;
    const { notified } = await notifyMatchMembers(match, slot);
    expect(notified).toBe(6);

    // venue_to_member が 6件、すべて status=sent（MOCK_NOTIFY=1）。
    const logs = await repo.notifications.listByMatch(PENDING_MATCH, "venue_to_member");
    expect(logs).toHaveLength(6);
    expect(logs.every((l) => l.status === "sent")).toBe(true);
    // payload は運用情報のみ（lineUserId を含まない）。文面 text に店名・予約名を含む。
    for (const l of logs) {
      expect(JSON.stringify(l.payload)).not.toContain("lineUserId");
      expect(String((l.payload as { text?: string }).text)).toContain("テスト酒場");
      expect(String((l.payload as { text?: string }).text)).toContain("マッチング・ヤマダ");
    }

    // Match=notified, Slot=confirmed。
    expect((await repo.matches.findById(PENDING_MATCH))?.status).toBe("notified");
    expect((await repo.slots.findById(MATCHED_SLOT))?.status).toBe("confirmed");
  });
});

describe("isMatchParticipant — IDOR 判定", () => {
  it("成立メンバーは true / 非メンバーは false", async () => {
    // seed-m1 は成立済枠の accepted メンバー。
    expect(await isMatchParticipant(MATCHED_SLOT, "seed-m1")).toBe(true);
    // seed-user-female は同枠に応募していない非参加者。
    expect(await isMatchParticipant(MATCHED_SLOT, "seed-user-female")).toBe(false);
    // 存在しないユーザーも false。
    expect(await isMatchParticipant(MATCHED_SLOT, "nobody")).toBe(false);
  });
});
