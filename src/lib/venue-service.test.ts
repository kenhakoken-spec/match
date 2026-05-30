import { describe, it, expect, beforeEach, vi } from "vitest";

// route/service が import する server-only を no-op 化。
vi.mock("server-only", () => ({}));

import {
  computeFitScore,
  recommendVenues,
  suggestVenuesForSlot,
  chooseVenueCandidate,
  rejectVenueCandidate,
  listVenueCandidatesForSlot,
} from "@/lib/venue-service";
import { getRepo } from "@/lib/repo";
import { __resetMemoryStore } from "@/lib/repo/memory";

// =============================================================================
// 純関数: computeFitScore（合コン向き度）
// =============================================================================
describe("computeFitScore (S8 合コン向き度の純関数)", () => {
  it("食べログ満点・Google満点・個室は最大(1.0)に近づく", () => {
    const s = computeFitScore({
      tabelogScore: 5,
      googleScore: 5,
      seatType: "private_room",
    });
    // 0.5 + 0.3 + 0.2 = 1.0。
    expect(s).toBe(1.0);
  });

  it("両点欠損(null)なら席タイプのみが寄与（最大0.2）", () => {
    expect(
      computeFitScore({ tabelogScore: null, googleScore: null, seatType: "private_room" })
    ).toBe(0.2);
    expect(
      computeFitScore({ tabelogScore: null, googleScore: null, seatType: "counter" })
    ).toBe(0.05); // 0.25 * 0.2 = 0.05。
  });

  it("個室 > 半個室 > テーブル > カウンター（点数同一なら席で差がつく）", () => {
    const base = { tabelogScore: 3.5, googleScore: 4.0 } as const;
    const priv = computeFitScore({ ...base, seatType: "private_room" });
    const semi = computeFitScore({ ...base, seatType: "semi_private" });
    const table = computeFitScore({ ...base, seatType: "table" });
    const counter = computeFitScore({ ...base, seatType: "counter" });
    expect(priv).toBeGreaterThan(semi);
    expect(semi).toBeGreaterThan(table);
    expect(table).toBeGreaterThan(counter);
  });

  it("範囲外/NaN の点数はクランプ・0 扱い（フェイルセーフ）", () => {
    // tabelog=10(>5) は 1.0 にクランプ、google=-3 は 0、NaN は 0。
    const s = computeFitScore({ tabelogScore: 10, googleScore: -3, seatType: "table" });
    // 1.0*0.5 + 0*0.3 + 0.55*0.2 = 0.61。
    expect(s).toBe(0.61);
    expect(
      computeFitScore({ tabelogScore: NaN, googleScore: NaN, seatType: "table" })
    ).toBe(0.11); // 0.55 * 0.2 = 0.11。
  });

  it("未指定の席タイプは通常席(table)相当として扱う", () => {
    const withDefault = computeFitScore({ tabelogScore: 3.5, googleScore: 4.0 });
    const withTable = computeFitScore({
      tabelogScore: 3.5,
      googleScore: 4.0,
      seatType: "table",
    });
    expect(withDefault).toBe(withTable);
  });
});

// =============================================================================
// 純関数: recommendVenues（モックrecommender / 実API差し替え点）
// =============================================================================
describe("recommendVenues (S8 会場候補レコメンドの純関数)", () => {
  it("fitScore 降順で返す（合コン向き度が高い順）", () => {
    const out = recommendVenues("ginza", 6);
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].fitScore).toBeGreaterThanOrEqual(out[i].fitScore);
    }
  });

  it("各候補に食べログ/Google点と fitScore が併記される", () => {
    const out = recommendVenues("ebisu", 6);
    for (const v of out) {
      expect(v).toHaveProperty("tabelogScore");
      expect(v).toHaveProperty("googleScore");
      expect(typeof v.fitScore).toBe("number");
      expect(v.fitScore).toBeGreaterThanOrEqual(0);
      expect(v.fitScore).toBeLessThanOrEqual(1);
    }
  });

  it("6名以上はカウンター席を除外する（合コンに不向き）", () => {
    const out = recommendVenues("ikebukuro", 6, 10);
    expect(out.some((v) => v.seatType === "counter")).toBe(false);
  });

  it("maxResults で件数を制限する", () => {
    expect(recommendVenues("ginza", 6, 2).length).toBe(2);
    expect(recommendVenues("ginza", 6, 1).length).toBe(1);
  });

  it("決定的（同じ入力で同じ結果＝テスト可能）", () => {
    const a = recommendVenues("ginza", 6);
    const b = recommendVenues("ginza", 6);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// service（副作用あり）: 候補生成 + 運営通知 / 採用 / 却下
// =============================================================================
describe("venue-service flow (S8 会場候補: 成立→suggest→通知→choose/reject)", () => {
  beforeEach(() => {
    __resetMemoryStore();
  });

  it("候補ゼロの枠に suggest すると候補生成 + 運営通知が走る", async () => {
    const repo = getRepo();
    // 成立済枠だが候補を空にしてから suggest（seed は候補ありなので別枠を使う）。
    // seed-slot-almost-full は候補なし & Match なし → 候補は生成されるが matchId は null。
    const slotId = "seed-slot-almost-full";
    const before = await repo.venueCandidates.listBySlot(slotId);
    expect(before.length).toBe(0);

    const result = await suggestVenuesForSlot(slotId, "seed-admin");
    expect(result.created).toBeGreaterThan(0);
    expect(result.candidates.length).toBe(result.created);
    // 運営(seed-admin)へ1件通知。
    expect(result.notified).toBe(1);

    // 候補は fitScore 降順。
    for (let i = 1; i < result.candidates.length; i++) {
      const prev = result.candidates[i - 1].fitScore ?? -Infinity;
      const cur = result.candidates[i].fitScore ?? -Infinity;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it("suggest は冪等（既存候補があれば再生成・再通知しない）", async () => {
    // seed-slot-matched は seed 済みで候補3件あり。
    const slotId = "seed-slot-matched";
    const result = await suggestVenuesForSlot(slotId, "seed-admin");
    expect(result.created).toBe(0);
    expect(result.notified).toBe(0);
    expect(result.candidates.length).toBe(3); // seed の3件のまま。
  });

  it("存在しない枠への suggest は空・created 0（route が 404 判断）", async () => {
    const result = await suggestVenuesForSlot("no-such-slot", "seed-admin");
    expect(result.candidates.length).toBe(0);
    expect(result.created).toBe(0);
    expect(result.notified).toBe(0);
  });

  it("choose で候補が chosen 化し Match.setVenue が走る（会場確定と整合）", async () => {
    const repo = getRepo();
    // seed-slot-matched の最上位候補（fitScore 0.92 の seed-venue-cand-1）。
    const candId = "seed-venue-cand-1";
    const res = await chooseVenueCandidate(candId, {
      reservationName: "山田",
      meetingPlace: "銀座駅A4出口",
    });
    expect(res.error).toBeNull();
    expect(res.candidate?.status).toBe("chosen");
    // Match は venue_set に、会場名は候補から転記、予約名は入力値。
    expect(res.match?.status).toBe("venue_set");
    expect(res.match?.venueName).toBe("個室和食 銀座はなれ");
    expect(res.match?.reservationName).toBe("山田");
    expect(res.match?.confirmedAt).not.toBeNull();

    // repo にも反映されている。
    const persisted = await repo.venueCandidates.findById(candId);
    expect(persisted?.status).toBe("chosen");
    const match = await repo.matches.findBySlotId("seed-slot-matched");
    expect(match?.venueUrl).toBe("https://example.com/ginza-hanare");
  });

  it("choose は venueName/URL を上書き指定できる（候補から転記しない）", async () => {
    const res = await chooseVenueCandidate("seed-venue-cand-2", {
      reservationName: "佐藤",
      venueName: "別の店 上書き",
      venueUrl: "https://example.com/override",
    });
    expect(res.error).toBeNull();
    expect(res.match?.venueName).toBe("別の店 上書き");
    expect(res.match?.venueUrl).toBe("https://example.com/override");
  });

  it("既に chosen/rejected の候補は再 choose 不可（candidate_not_suggestable）", async () => {
    await chooseVenueCandidate("seed-venue-cand-1", { reservationName: "山田" });
    // もう一度 choose（既に chosen）。
    const again = await chooseVenueCandidate("seed-venue-cand-1", {
      reservationName: "山田",
    });
    expect(again.error).toBe("candidate_not_suggestable");
  });

  it("存在しない候補の choose は candidate_not_found", async () => {
    const res = await chooseVenueCandidate("no-such-candidate", {
      reservationName: "山田",
    });
    expect(res.error).toBe("candidate_not_found");
  });

  it("Match の無い枠の候補は choose で match_not_found", async () => {
    const repo = getRepo();
    // Match の無い枠（seed-slot-almost-full）に候補を1件作ってから choose。
    await suggestVenuesForSlot("seed-slot-almost-full", "seed-admin");
    const cands = await repo.venueCandidates.listBySlot("seed-slot-almost-full");
    const res = await chooseVenueCandidate(cands[0].id, { reservationName: "山田" });
    expect(res.error).toBe("match_not_found");
  });

  it("notified 後の Match には会場を差し替えられない（match_not_settable）", async () => {
    const repo = getRepo();
    // seed-match-pending を notified にしてから choose を試みる。
    await repo.matches.markNotified("seed-match-pending");
    const res = await chooseVenueCandidate("seed-venue-cand-1", {
      reservationName: "山田",
    });
    expect(res.error).toBe("match_not_settable");
  });

  it("reject で候補が rejected 化する", async () => {
    const repo = getRepo();
    const res = await rejectVenueCandidate("seed-venue-cand-3");
    expect(res.error).toBeNull();
    expect(res.candidate?.status).toBe("rejected");
    const persisted = await repo.venueCandidates.findById("seed-venue-cand-3");
    expect(persisted?.status).toBe("rejected");
  });

  it("既に rejected の候補は再 reject 不可（candidate_not_suggestable）", async () => {
    await rejectVenueCandidate("seed-venue-cand-3");
    const again = await rejectVenueCandidate("seed-venue-cand-3");
    expect(again.error).toBe("candidate_not_suggestable");
  });

  it("存在しない候補の reject は candidate_not_found", async () => {
    const res = await rejectVenueCandidate("no-such-candidate");
    expect(res.error).toBe("candidate_not_found");
  });

  it("listVenueCandidatesForSlot は枠なしで null（route が 404）", async () => {
    expect(await listVenueCandidatesForSlot("no-such-slot")).toBeNull();
    const ok = await listVenueCandidatesForSlot("seed-slot-matched");
    expect(ok?.length).toBe(3);
  });
});
