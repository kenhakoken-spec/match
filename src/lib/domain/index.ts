// Barrel for pure domain functions (contract §3).
export { calcAge, isAdult, ageInBand, canApply } from "./age";
// S3 成立判定 / 会場通知文面 (contract §5)。
export { isSlotFull, buildVenueMessage, type VenueMessageInput } from "./match";
// S12 #10 定員柔軟化(合計6人で 2:4〜4:2)。既存 isSlotFull(厳密 per-gender) は温存。
export {
  isSlotFullFlex,
  canAcceptGenderFlex,
  isValidFlexCapacity,
  DEFAULT_FLEX_CAPACITY,
  type FlexCapacity,
} from "./match";
// S12 #6 職業フリー入力サニタイズ / #14 成立詳細の職業表示解決。
export {
  sanitizeOccupationText,
  occupationLabel,
  resolveOccupationDisplay,
  OCCUPATION_TEXT_MAX,
} from "./profile";
// S8 多軸評価集計 (spec 要望4)。既存 aggregateRatings(単一) は後方互換で温存。
export {
  aggregateMultiAxis,
  type MultiAxisScore,
  type MultiAxisAggregate,
} from "./rating";
// S8 ドタキャン確定判定 (spec 要望5)。
export { isNoShowConfirmed, NO_SHOW_THRESHOLD } from "./noshow";
// S8 ドタキャン罰金額 (spec 要望5)。
export { penaltyAmountJpy, NO_SHOW_PENALTY_JPY } from "./payment";
// S8 総合平均によるバッジ判定 (spec 要望4)。
export { qualifiesForPremiumByOverall } from "./badge";
