// =============================================================================
// POST /api/webhooks/stripe — Stripe Webhook 受け口（モック）(S4 契約§3)
// - 署名検証の「枠」を用意（実検証は STRIPE_WEBHOOK_SECRET / constructEvent で TODO）。
// - payment_intent.succeeded で該当 Payment を succeeded に更新（冪等）。
// - 冪等: 既に succeeded のものは二重反映しない。署名不正は 400。
// 正典: docs/backend/api-contract-s4.md §3 / docs/backend/payment.md §3
//
// セキュリティ:
//  - 署名検証必須（payment.md §3）。本実装は枠＋モック許可。実キー運用では
//    verifyWebhookSignature を constructEvent ベースに差し替える（stripe-mock.ts TODO）。
//  - レスポンスに内部詳細/PII を出さない。
// =============================================================================

import { handle, jsonOk, jsonError } from "@/lib/http";
import { verifyWebhookSignature } from "@/lib/stripe-mock";
import { getPaymentRepo } from "@/lib/repo/payment-repo";
import type { PaymentStatusValue } from "@/lib/payment-types";

export const dynamic = "force-dynamic";

/** Stripe event.type → Payment.status の写像（payment.md §3 の表に対応）。 */
function statusForEvent(eventType: string): PaymentStatusValue | null {
  switch (eventType) {
    case "payment_intent.created":
      return "created";
    case "payment_intent.requires_action":
      return "requires_action";
    case "payment_intent.amount_capturable_updated":
      return "requires_capture";
    case "payment_intent.succeeded":
      return "succeeded";
    case "payment_intent.canceled":
      return "canceled";
    case "payment_intent.payment_failed":
      return "failed";
    case "charge.refunded":
      return "refunded";
    default:
      return null;
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    // raw body（署名検証は raw 文字列に対して行うのが Stripe の作法）。
    const raw = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

    // 署名検証（枠）。失敗は 400（payload を処理しない）。
    if (!verifyWebhookSignature(raw, signature, webhookSecret)) {
      return jsonError(400, "invalid_signature", "invalid webhook signature");
    }

    // payload パース（モック: { type, data: { object: { id } } } 互換の最小形）。
    let event: { type?: string; data?: { object?: { id?: string } } };
    try {
      event = JSON.parse(raw || "{}");
    } catch {
      return jsonError(400, "invalid_payload", "invalid webhook payload");
    }

    const eventType = event.type ?? "";
    const intentId = event.data?.object?.id ?? "";
    const nextStatus = statusForEvent(eventType);

    // 未対応イベント or PaymentIntent ID 欠如は 200 で受理（再送ループを避ける・冪等）。
    if (!nextStatus || !intentId) {
      return jsonOk({ received: true, applied: false }, 200);
    }

    const payments = getPaymentRepo();
    const payment = await payments.findByStripeIntentId(intentId);
    if (!payment) {
      // 対応する Payment 無し（既に消えた/別環境）でも 200 受理（冪等・情報を漏らさない）。
      return jsonOk({ received: true, applied: false }, 200);
    }

    // 冪等: 既に succeeded のものは succeeded で二重反映しない。
    if (payment.status === "succeeded" && nextStatus === "succeeded") {
      return jsonOk({ received: true, applied: false }, 200);
    }

    await payments.setStatus(payment.id, nextStatus, { note: eventType });
    return jsonOk({ received: true, applied: true }, 200);
  });
}
