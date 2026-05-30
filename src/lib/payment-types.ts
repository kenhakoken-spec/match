// =============================================================================
// matching-app — S4 専用 API 型 (決済) — 契約§4
// 正典: docs/backend/api-contract-s4.md §3,§4 / docs/backend/payment.md
//
// 設計方針（並行実装の鉄則）:
//   共有 src/lib/types.ts には **追記しない**。S4 で増える型はこの専用ファイルに閉じる。
//   統合時の配線（既存 SlotDTO 等との結合）は開発将軍が行う。
//
// PII / セキュリティ:
//   - カード番号・氏名・Stripe の生レスポンス等の機微情報は DTO に載せない。
//   - クライアントへ返すのは PaymentIntent の id / client_secret / 状態 / 金額のみ。
// =============================================================================

import type { FeeReason } from "@/lib/domain/payment";

/** 決済(Payment)の状態。schema.prisma の PaymentStatus と一致。 */
export type PaymentStatusValue =
  | "created"
  | "requires_action"
  | "requires_capture"
  | "succeeded"
  | "canceled"
  | "refunded"
  | "failed";

/**
 * 課金見積り（純関数 computeFee の結果をAPI表現にしたもの）。
 * 非課金（女性/初回）でもこの形で「課金不要・確定」を表現する。
 */
export interface FeeQuote {
  amountJpy: number;
  currency: "JPY";
  chargeable: boolean;
  reason: FeeReason;
}

/**
 * 決済DTO（API 出力）。Payment エンティティから機微情報を落として整形。
 * stripePaymentIntentId は内部突合用の ID であり機微カード情報ではないため返してよいが、
 * client_secret は intent 作成レスポンスでのみ返し、履歴(mine)には含めない。
 */
export interface PaymentDTO {
  id: string;
  amountJpy: number;
  currency: "JPY";
  isFirstFree: boolean;
  status: PaymentStatusValue;
  slotId: string | null;
  paidAt: string | null; // ISO8601 or null
  createdAt: string; // ISO8601
}

/**
 * POST /api/payments/intent のレスポンス。
 * - 非課金（女性/初回）: chargeable=false。payment は確定記録(succeeded相当)、clientSecret=null。
 * - 課金（男性2回目+）  : chargeable=true。PaymentIntent を発行し clientSecret を返す。
 */
export interface PaymentIntentResponse {
  quote: FeeQuote;
  /** 課金時のみ。Stripe(モック)の client_secret。非課金時は null。 */
  clientSecret: string | null;
  payment: PaymentDTO;
}

/** POST /api/payments/confirm のレスポンス。 */
export interface PaymentConfirmResponse {
  payment: PaymentDTO;
}

/** GET /api/payments/mine のレスポンス。 */
export interface PaymentListResponse {
  payments: PaymentDTO[];
}
