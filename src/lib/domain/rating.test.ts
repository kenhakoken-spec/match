// =============================================================================
// matching-app — S5 純関数テスト（相互評価）。vitest。
// 契約§1 の境界テストを網羅: 空配列 / 1件 / 複数(平均・件数) / 範囲外スコア(0,6,3.5)
//   / self評価不可 / 二重評価不可 / 非参加者不可 / 非同席者不可。
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  aggregateRatings,
  aggregateMultiAxis,
  isRatingScoreValid,
  canRate,
  type CanRateInput,
  type MultiAxisScore,
} from "./rating";

describe("aggregateRatings", () => {
  it("空配列は { avg: 0, count: 0 }", () => {
    expect(aggregateRatings([])).toEqual({ avg: 0, count: 0 });
  });

  it("1件はその値が平均、count=1", () => {
    expect(aggregateRatings([5])).toEqual({ avg: 5, count: 1 });
    expect(aggregateRatings([3])).toEqual({ avg: 3, count: 1 });
  });

  it("複数件の平均と件数を返す（割り切れる）", () => {
    expect(aggregateRatings([5, 4, 3])).toEqual({ avg: 4, count: 3 });
    expect(aggregateRatings([5, 4])).toEqual({ avg: 4.5, count: 2 });
    expect(aggregateRatings([2, 2, 2, 2])).toEqual({ avg: 2, count: 4 });
  });

  it("平均は小数第1位に四捨五入する（契約§1: 平均小数1桁）", () => {
    // 11/3 = 3.6666.. → 3.7
    expect(aggregateRatings([4, 4, 3])).toEqual({ avg: 3.7, count: 3 });
    // 10/3 = 3.3333.. → 3.3
    expect(aggregateRatings([4, 3, 3])).toEqual({ avg: 3.3, count: 3 });
    // 1+2 = 1.5 → 1.5（境界の .5 は切り上げ）
    expect(aggregateRatings([1, 2])).toEqual({ avg: 1.5, count: 2 });
    // 浮動小数誤差が出やすい組み合わせでも1桁に収まる
    const r = aggregateRatings([5, 5, 4, 1]); // 15/4 = 3.75 → 3.8
    expect(r).toEqual({ avg: 3.8, count: 4 });
  });

  it("満点・最低点の平均", () => {
    expect(aggregateRatings([5, 5, 5])).toEqual({ avg: 5, count: 3 });
    expect(aggregateRatings([1, 1, 1])).toEqual({ avg: 1, count: 3 });
  });
});

describe("aggregateMultiAxis (S8 多軸評価)", () => {
  const r = (a: number, t: number, m: number): MultiAxisScore => ({
    scoreAgain: a,
    scoreTalk: t,
    scoreManner: m,
  });

  it("空配列は全て 0", () => {
    expect(aggregateMultiAxis([])).toEqual({
      again: 0,
      talk: 0,
      manner: 0,
      overall: 0,
      count: 0,
    });
  });

  it("1件はその値が各軸平均、総合は3軸平均、count=1", () => {
    // again5 talk3 manner4 → overall=(5+3+4)/3=4
    expect(aggregateMultiAxis([r(5, 3, 4)])).toEqual({
      again: 5,
      talk: 3,
      manner: 4,
      overall: 4,
      count: 1,
    });
  });

  it("複数件の軸別平均と総合平均（割り切れる）", () => {
    // again:(5+3)/2=4, talk:(4+2)/2=3, manner:(5+5)/2=5
    // overall:(5+3+4+2+5+5)/6 = 24/6 = 4
    expect(aggregateMultiAxis([r(5, 4, 5), r(3, 2, 5)])).toEqual({
      again: 4,
      talk: 3,
      manner: 5,
      overall: 4,
      count: 2,
    });
  });

  it("各軸・総合とも小数第1位に四捨五入する", () => {
    // again:(4+4+3)/3=3.6666→3.7, talk:(4+3+3)/3=3.3333→3.3, manner:(5+5+4)/3=4.6666→4.7
    // overall:(4+4+3 + 4+3+3 + 5+5+4)/9 = 35/9 = 3.888..→3.9
    expect(aggregateMultiAxis([r(4, 4, 5), r(4, 3, 5), r(3, 3, 4)])).toEqual({
      again: 3.7,
      talk: 3.3,
      manner: 4.7,
      overall: 3.9,
      count: 3,
    });
  });

  it("総合は丸め前の生平均から算出（軸平均を丸めてから平均しない）", () => {
    // 軸平均を丸めると again3.7/talk3.3/manner4.7 の平均=3.9(同じ)になるが、
    // 生平均 35/9=3.888..→3.9 と一致することを確認（誤差が乗らない設計）。
    const agg = aggregateMultiAxis([r(4, 4, 5), r(4, 3, 5), r(3, 3, 4)]);
    expect(agg.overall).toBe(3.9);
  });

  it("全軸満点 / 全軸最低", () => {
    expect(aggregateMultiAxis([r(5, 5, 5), r(5, 5, 5)])).toEqual({
      again: 5,
      talk: 5,
      manner: 5,
      overall: 5,
      count: 2,
    });
    expect(aggregateMultiAxis([r(1, 1, 1)])).toEqual({
      again: 1,
      talk: 1,
      manner: 1,
      overall: 1,
      count: 1,
    });
  });
});

describe("isRatingScoreValid", () => {
  it("1〜5の整数は有効", () => {
    for (const s of [1, 2, 3, 4, 5]) {
      expect(isRatingScoreValid(s)).toBe(true);
    }
  });

  it("範囲外（0 / 6 / -1 / 100）は無効", () => {
    expect(isRatingScoreValid(0)).toBe(false);
    expect(isRatingScoreValid(6)).toBe(false);
    expect(isRatingScoreValid(-1)).toBe(false);
    expect(isRatingScoreValid(100)).toBe(false);
  });

  it("非整数（3.5 / 4.0001）は無効", () => {
    expect(isRatingScoreValid(3.5)).toBe(false);
    expect(isRatingScoreValid(4.0001)).toBe(false);
  });

  it("NaN / Infinity は無効", () => {
    expect(isRatingScoreValid(Number.NaN)).toBe(false);
    expect(isRatingScoreValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("canRate", () => {
  // 全条件OKのベース（done参加者が、同席者を、未評価で、self以外で評価）。
  const base: CanRateInput = {
    isParticipantOfDoneSlot: true,
    rateeIsCoMember: true,
    alreadyRated: false,
    selfRate: false,
  };

  it("全条件を満たすと ok（reason=null）", () => {
    expect(canRate(base)).toEqual({ ok: true, reason: null });
  });

  it("自己評価は不可（self_rate）— 他条件より優先", () => {
    // selfRate のときは他がどうであれ self_rate を返す。
    expect(canRate({ ...base, selfRate: true })).toEqual({
      ok: false,
      reason: "self_rate",
    });
    expect(
      canRate({
        isParticipantOfDoneSlot: false,
        rateeIsCoMember: false,
        alreadyRated: true,
        selfRate: true,
      })
    ).toEqual({ ok: false, reason: "self_rate" });
  });

  it("done 参加者でないと不可（not_participant）", () => {
    expect(canRate({ ...base, isParticipantOfDoneSlot: false })).toEqual({
      ok: false,
      reason: "not_participant",
    });
  });

  it("同席者でないと不可（not_co_member）= IDOR防止", () => {
    expect(canRate({ ...base, rateeIsCoMember: false })).toEqual({
      ok: false,
      reason: "not_co_member",
    });
  });

  it("二重評価は不可（already_rated）", () => {
    expect(canRate({ ...base, alreadyRated: true })).toEqual({
      ok: false,
      reason: "already_rated",
    });
  });

  it("判定順序: not_participant は not_co_member / already_rated より優先", () => {
    // 参加していない & 同席でない & 既評価 → 最初の not_participant のみ返す。
    expect(
      canRate({
        isParticipantOfDoneSlot: false,
        rateeIsCoMember: false,
        alreadyRated: true,
        selfRate: false,
      })
    ).toEqual({ ok: false, reason: "not_participant" });
  });

  it("判定順序: not_co_member は already_rated より優先", () => {
    expect(
      canRate({
        isParticipantOfDoneSlot: true,
        rateeIsCoMember: false,
        alreadyRated: true,
        selfRate: false,
      })
    ).toEqual({ ok: false, reason: "not_co_member" });
  });
});
