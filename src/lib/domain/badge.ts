// =============================================================================
// matching-app — pure domain functions for S6 優良バッジ(premium)付与判定
// 副作用なし・DB非依存。vitest で単体テスト必須(境界網羅)。
// 正典: docs/backend/api-contract-s6.md §0,§1 / docs/backend/badge.md §3
//
// 設計方針:
//  - 付与可否は **サーバ側で必ずこの純関数で判定** する(クライアント値は信用しない)。
//  - 付与基準は調整可能な定数(PREMIUM_CRITERIA)に集約し、後で運用調整できる形にする。
//  - 付与時点の判定根拠を badgeCriteriaSnapshot で固定し、後から基準が変わっても
//    「なぜ付与されたか」を Badge.criteriaSnapshot として再現できるようにする。
//  - このファイルは repo / auth / http に一切依存しない(domain/index.ts も触らない:
//    S6 は専用ファイルで完結するため index への再エクスポートは行わない)。
// =============================================================================

/** バッジ付与判定の入力(評価集計 + 参加回数)。契約§1 の BadgeInput に一致。 */
export interface BadgeInput {
  /** 平均評価(0.0〜5.0)。Profile.ratingAvg 由来。 */
  ratingAvg: number;
  /** 受領した評価件数。Profile.ratingCount 由来。 */
  ratingCount: number;
  /** 開催完了(done)に参加し成立した回数。Profile.attendedCount 由来。 */
  attendedCount: number;
}

/**
 * 優良バッジ(premium)付与基準(MVP初期値。運用で調整可)。
 * 正典: api-contract-s6.md §0 / badge.md §3。
 *  - minRatingAvg   : 平均評価がこの値「以上」(>=)。
 *  - minRatingCount : 受領評価件数がこの値「以上」(>=)。評価の信頼性を担保。
 *  - minAttended    : 参加(done)回数がこの値「以上」(>=)。「複数回参加」の定義。
 */
export const PREMIUM_CRITERIA = {
  minRatingAvg: 4.0,
  minRatingCount: 5,
  minAttended: 2,
} as const;

/**
 * 入力値を防御的に正規化する内部ヘルパ。
 * NaN / Infinity / 非数は「基準を満たさない安全側」に倒すため -Infinity 相当として扱う。
 * (DB由来の数値が壊れていても誤付与しないことを優先する。)
 */
function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

/**
 * 優良バッジ(premium)を付与すべきか判定する純関数。
 *
 * 付与条件(AND): ratingAvg >= 4.0 かつ ratingCount >= 5 かつ attendedCount >= 2。
 * いずれか1つでも欠ければ false。
 *
 * 境界(契約§1のテスト観点):
 *  - ratingAvg : 3.9 → false / 4.0 → (他条件次第) / 4.1 → (他条件次第)
 *  - ratingCount : 4 → false / 5 → (他条件次第)
 *  - attendedCount : 1 → false / 2 → (他条件次第)
 *
 * NaN/Infinity 等の不正値は安全側(false)に倒す。
 */
export function qualifiesForPremium(input: BadgeInput): boolean {
  const ratingAvg = safeNumber(input.ratingAvg);
  const ratingCount = safeNumber(input.ratingCount);
  const attendedCount = safeNumber(input.attendedCount);

  return (
    ratingAvg >= PREMIUM_CRITERIA.minRatingAvg &&
    ratingCount >= PREMIUM_CRITERIA.minRatingCount &&
    attendedCount >= PREMIUM_CRITERIA.minAttended
  );
}

/**
 * 付与根拠スナップショット。付与時点の数値 + 適用した基準を固定して返す。
 * Badge.criteriaSnapshot(Json) に格納し、後から基準を変えても監査・再現できる。
 *
 * 返却キー(Record<string, number>・契約§1 の型に一致):
 *  - ratingAvg / ratingCount / attendedCount : 付与時点の入力値(そのまま記録)
 *  - minRatingAvg / minRatingCount / minAttended : 判定に用いた基準値
 *
 * 注: 入力値はそのまま記録する(安全側正規化は判定のみに適用)。
 *     監査目的では「実際にDBにあった値」を残すほうが正確なため。
 */
export function badgeCriteriaSnapshot(input: BadgeInput): Record<string, number> {
  return {
    ratingAvg: input.ratingAvg,
    ratingCount: input.ratingCount,
    attendedCount: input.attendedCount,
    minRatingAvg: PREMIUM_CRITERIA.minRatingAvg,
    minRatingCount: PREMIUM_CRITERIA.minRatingCount,
    minAttended: PREMIUM_CRITERIA.minAttended,
  };
}

/**
 * 各基準までの不足分を返す純関数(進捗表示 BadgeProgressDTO.remaining 用)。
 * 既に満たしている項目は 0。負にはならない(Math.max(0, ...))。
 * NaN/Infinity 入力は「満たしていない」とみなし、必要量を満額返す(安全側)。
 */
export function premiumRemaining(input: BadgeInput): {
  ratingAvg: number;
  ratingCount: number;
  attendedCount: number;
} {
  const avg = Number.isFinite(input.ratingAvg) ? input.ratingAvg : 0;
  const count = Number.isFinite(input.ratingCount) ? input.ratingCount : 0;
  const attended = Number.isFinite(input.attendedCount) ? input.attendedCount : 0;

  return {
    ratingAvg: Math.max(0, round2(PREMIUM_CRITERIA.minRatingAvg - avg)),
    ratingCount: Math.max(0, PREMIUM_CRITERIA.minRatingCount - count),
    attendedCount: Math.max(0, PREMIUM_CRITERIA.minAttended - attended),
  };
}

/** 小数2桁丸め(浮動小数の誤差を避ける。例: 4.0 - 3.9 = 0.0999... → 0.1)。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
