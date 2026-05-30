// =============================================================================
// matching-app — S5 純関数（相互評価）。副作用なし・vitest対象。
// 契約: docs/backend/api-contract-s5.md §1 / docs/backend/badge.md §1-2。
//
// ここには DB/通知/セッションに依存しない判定・集計のみを置く。
// route / rating-repo はこの純関数に状態を「渡す」だけにして、評価ロジックを
// 単体テスト可能に保つ（マッチングアプリの評価は監査対象になりうるため）。
// =============================================================================

/** 評価集計の結果。Profile.ratingAvg / ratingCount に反映する値。 */
export interface RatingAggregate {
  /** 平均評価（0.0〜5.0）。空配列は 0。小数第1位に四捨五入。 */
  avg: number;
  /** 受領した評価件数。 */
  count: number;
}

/**
 * 受領評価スコア配列から平均と件数を算出する（純関数）。
 * - 空配列 → { avg: 0, count: 0 }
 * - 平均は **小数第1位** に四捨五入（契約§1: 平均小数1桁）。
 *   例: [5,4,3] → avg 4, [4,4,3] → 3.6666.. → 3.7, [5,4] → 4.5。
 * 入力スコアの妥当性（1..5整数）は呼び出し側で保証する前提だが、
 * 集計自体は与えられた数値をそのまま平均する（防御は isRatingScoreValid で別途）。
 */
export function aggregateRatings(scores: number[]): RatingAggregate {
  const count = scores.length;
  if (count === 0) return { avg: 0, count: 0 };
  const sum = scores.reduce((a, b) => a + b, 0);
  const raw = sum / count;
  // 小数第1位に四捨五入。浮動小数の誤差を避けるため整数化して丸める。
  const avg = Math.round(raw * 10) / 10;
  return { avg, count };
}

/**
 * スコアが有効か（1〜5の整数）。範囲外（0/6）・非整数（3.5）・NaN/Infinity を弾く。
 * route の zod でも検証するが、ドメイン側でも単体テスト可能な形で重ねて防御する。
 */
export function isRatingScoreValid(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

// =============================================================================
// S8 多軸評価（spec 要望4: また会いたい / 会話 / マナー の3軸）。
// 既存 aggregateRatings（単一 score 用）は **後方互換のため温存** し、3軸集計は
// 新関数として追加する。総合(overall)= 3軸全スコアの平均（軸平均の平均ではなく、
// 全数値の単純平均＝各軸が同数なら数学的に等価）。Profile に
// scoreAgainAvg/scoreTalkAvg/scoreMannerAvg(軸別) と ratingAvg(=overall) を反映する。
// =============================================================================

/** 多軸評価1件分の3スコア（各1〜5）。 */
export interface MultiAxisScore {
  scoreAgain: number;
  scoreTalk: number;
  scoreManner: number;
}

/** 多軸集計の結果。各軸平均 + 総合(overall) + 件数。空配列はすべて 0。 */
export interface MultiAxisAggregate {
  /** 「また会いたい」軸の平均（小数1桁）。 */
  again: number;
  /** 「会話」軸の平均（小数1桁）。 */
  talk: number;
  /** 「マナー」軸の平均（小数1桁）。 */
  manner: number;
  /** 総合平均（3軸の全スコアの平均・小数1桁）。優良バッジ判定の入力。 */
  overall: number;
  /** 受領した評価件数（=入力配列長。1件につき3軸ぶん）。 */
  count: number;
}

/** 小数第1位に四捨五入（aggregateRatings と同じ丸め。浮動小数誤差を避ける）。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 受領した多軸評価の配列から、軸別平均・総合平均・件数を算出する（純関数）。
 * - 空配列 → { again:0, talk:0, manner:0, overall:0, count:0 }。
 * - 各軸平均・総合とも **小数第1位** に四捨五入（aggregateRatings と一貫）。
 * - overall は「全軸の全スコアの平均」= (Σagain+Σtalk+Σmanner)/(count*3)。
 *   各評価が3軸そろう前提のため、これは「3軸平均の平均」と数学的に一致する。
 * 入力スコアの妥当性（1..5整数）は呼び出し側(zod/isRatingScoreValid)で担保する前提。
 */
export function aggregateMultiAxis(ratings: MultiAxisScore[]): MultiAxisAggregate {
  const count = ratings.length;
  if (count === 0) {
    return { again: 0, talk: 0, manner: 0, overall: 0, count: 0 };
  }
  let sumAgain = 0;
  let sumTalk = 0;
  let sumManner = 0;
  for (const r of ratings) {
    sumAgain += r.scoreAgain;
    sumTalk += r.scoreTalk;
    sumManner += r.scoreManner;
  }
  const again = round1(sumAgain / count);
  const talk = round1(sumTalk / count);
  const manner = round1(sumManner / count);
  // 総合は丸め前の生平均から算出（軸平均を丸めてから平均すると誤差が乗るため）。
  const overall = round1((sumAgain + sumTalk + sumManner) / (count * 3));
  return { again, talk, manner, overall, count };
}

/** canRate の入力。すべて呼び出し側（rating-repo / route）がサーバ状態から解決する。 */
export interface CanRateInput {
  /** rater が「done になった Slot」に accepted で参加していたか。 */
  isParticipantOfDoneSlot: boolean;
  /** ratee が同じ Slot の同席者（自分以外の accepted）か。 */
  rateeIsCoMember: boolean;
  /** 同一(slot,rater,ratee)で既に評価済みか（UNIQUE 相当）。 */
  alreadyRated: boolean;
  /** 自分自身を評価しようとしているか（rater === ratee）。 */
  selfRate: boolean;
}

/** canRate の結果。ok=false のとき reason に最初に該当した理由コードを返す。 */
export interface CanRateResult {
  ok: boolean;
  reason: CanRateReason | null;
}

/** 評価不可の理由コード（route で status に対応づける）。 */
export type CanRateReason =
  | "self_rate" // 自分自身は評価不可 → 400
  | "not_participant" // done 参加者でない → 403
  | "not_co_member" // 同席者でない → 403
  | "already_rated"; // 二重評価 → 409

/**
 * 評価可否を判定する（純関数）。判定順は「不正→権限→重複」。
 * 1. selfRate → self_rate（400相当: そもそも不正な対象）。
 * 2. !isParticipantOfDoneSlot → not_participant（403: 参加していないイベント）。
 * 3. !rateeIsCoMember → not_co_member（403: 同席者でない＝IDOR防止の要）。
 * 4. alreadyRated → already_rated（409: 二重評価）。
 * すべて満たせば ok。理由は1つ目に該当したものだけ返す（情報最小化）。
 */
export function canRate(input: CanRateInput): CanRateResult {
  if (input.selfRate) return { ok: false, reason: "self_rate" };
  if (!input.isParticipantOfDoneSlot) return { ok: false, reason: "not_participant" };
  if (!input.rateeIsCoMember) return { ok: false, reason: "not_co_member" };
  if (input.alreadyRated) return { ok: false, reason: "already_rated" };
  return { ok: true, reason: null };
}
