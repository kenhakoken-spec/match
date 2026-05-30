// Barrel for pure domain functions (contract §3).
export { calcAge, isAdult, ageInBand, canApply } from "./age";
// S3 成立判定 / 会場通知文面 (contract §5)。
export { isSlotFull, buildVenueMessage, type VenueMessageInput } from "./match";
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
