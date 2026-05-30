"use client";

import { use, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageBody, Card, SectionLabel, StickyFooter } from "@/components/ui/Surface";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button, ButtonLink } from "@/components/ui/Button";
import { LoadingState } from "@/components/States";
import {
  createIntent,
  confirmPayment,
  type PaymentIntentResponse,
} from "@/app/_lib/api-payment";
import { ApiCallError } from "@/app/_lib/api";

// =============================================================================
// U-14 決済画面 — 成立枠への参加費お支払い。
// design-system §4.7C / §5 / §8 を厳守:
//  - 課金可否はサーバ(computeFee)が決める → 画面は intent の quote.reason で分岐:
//      male_paid       : 「¥2,000」を明示。Stripe へカード入力を委譲（カード値は非保持）。
//      male_first_free : 「初回は無料です」を静かに主役（accent.100 地）。販促・煽り禁止。
//      female_free     : 「ご参加は無料です」を事実として。
//  - 「成立後にお支払い」「不成立なら課金なし」を必ず併記（誤解・不信防止）。
//  - 状態は色のみに依存しない（ラベル＋形状を併記 / §5）。
//
// 決済フロー（モック）:
//  - 非課金(女性/初回): intent 時点で payment.status="succeeded"（確定済）。
//    画面は無料の確認を主役に見せ、「成立の詳細へ」進む。Stripe は通さない。
//  - 課金(男性2回目+) : intent で PaymentIntent 発行（clientSecret あり）。
//    本番は Stripe Elements/Checkout でカード入力＋3DS を通し、その成功後に確定。
//    ここではモックとして confirm(payment.id) で succeeded 化する。
//    ※ アプリ側はカード番号・名義等を一切保持/送信しない（PII配慮 / §4.7C）。
// =============================================================================

type Phase = "loading" | "ready" | "paying" | "done" | "error";

export default function PaymentPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  const { slotId } = use(params);

  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadIntent() {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await createIntent(slotId);
      setIntent(res);
      setPhase("ready");
    } catch (e) {
      setErrorMsg(
        e instanceof ApiCallError ? intentErrorMessage(e) : "通信エラーが発生しました。",
      );
      setPhase("error");
    }
  }

  useEffect(() => {
    void loadIntent();
    // slotId のみに依存。
  }, [slotId]);

  async function handlePay() {
    if (!intent) return;
    setPhase("paying");
    setErrorMsg(null);
    try {
      // 本番では Stripe で 3DS 等を通過させたのち確定。ここではモック確定。
      const payment = await confirmPayment(intent.payment.id);
      if (payment.status === "succeeded") {
        setPhase("done");
      } else {
        setErrorMsg("お支払いを確認できませんでした。もう一度お試しください。");
        setPhase("error");
      }
    } catch (e) {
      setErrorMsg(
        e instanceof ApiCallError
          ? "お支払いを完了できませんでした。カードをご確認のうえ、もう一度お試しください。"
          : "通信エラーが発生しました。もう一度お試しください。",
      );
      setPhase("error");
    }
  }

  // --- loading --------------------------------------------------------------
  if (phase === "loading" || !intent) {
    return (
      <>
        <AppHeader title="お支払い" backHref="/applications" />
        <PageBody>
          <LoadingState label="お支払い情報を確認しています…" data-testid="pay-loading" />
        </PageBody>
      </>
    );
  }

  const { reason, chargeable, amountJpy } = intent.quote;

  // --- error ----------------------------------------------------------------
  if (phase === "error") {
    return (
      <>
        <AppHeader title="お支払い" backHref="/applications" />
        <PageBody>
          <div className="flex flex-col gap-5" data-testid="pay-error">
            <Card tone="surface" className="flex flex-col gap-2 border-state-danger/40">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-[18px] text-state-danger">
                  ⚠
                </span>
                <p className="font-sans text-[14px] font-semibold text-state-danger">
                  お支払いに問題が発生しました
                </p>
              </div>
              <p className="font-sans text-[13px] leading-relaxed text-ink-700">
                {errorMsg ?? "もう一度お試しください。"}
              </p>
            </Card>
            {chargeable ? (
              <div className="flex flex-col gap-2">
                <Button onClick={() => void handlePay()} data-testid="pay-retry">
                  もう一度支払う
                </Button>
                <Button variant="secondary" onClick={() => void loadIntent()}>
                  別のカードで試す
                </Button>
              </div>
            ) : (
              <Button onClick={() => void loadIntent()} data-testid="pay-retry">
                もう一度試す
              </Button>
            )}
          </div>
        </PageBody>
      </>
    );
  }

  // --- done (paid confirmation) --------------------------------------------
  if (phase === "done") {
    return (
      <>
        <AppHeader title="お支払い" backHref="/applications" />
        <PageBody>
          <div className="flex flex-col gap-5" data-testid="pay-done">
            <Card tone="surface" className="flex flex-col gap-2">
              <StatusPill tone="success" glyph="●">
                お支払い完了
              </StatusPill>
              <p className="font-sans text-[14px] leading-relaxed text-ink-700">
                お支払いが完了しました。
              </p>
              <p className="font-sans text-[12px] leading-relaxed text-ink-500">
                当日の会場が決まりましたら、改めてお知らせします。
              </p>
            </Card>
          </div>
        </PageBody>
        <StickyFooter>
          <ButtonLink href="/applications">成立の一覧へ戻る</ButtonLink>
        </StickyFooter>
      </>
    );
  }

  // --- ready: NON-chargeable (female_free / male_first_free) ---------------
  // 無料を主役に。初回無料は静かに主役（accent.100 地・祝意の絵文字は最大1・販促禁止 / §4.7C）。
  if (!chargeable) {
    return (
      <>
        <AppHeader title="お支払い" backHref="/applications" />
        <PageBody>
          <div className="flex flex-col gap-6" data-testid="pay-free">
            {reason === "male_first_free" ? (
              <section className="flex flex-col gap-2 rounded-md border border-accent-300 bg-accent-100 px-4 py-5">
                <p className="font-serif text-[22px] text-accent-600">
                  <span aria-hidden="true">🎁</span> 初回は無料です
                </p>
                <p className="font-sans text-[13px] leading-relaxed text-ink-700">
                  最初のご参加は費用がかかりません。
                </p>
                <p className="font-sans text-[12px] leading-relaxed text-ink-500">
                  次回のご参加から ¥2,000 です。
                </p>
              </section>
            ) : (
              <section className="flex flex-col gap-2 rounded-md border border-line-200 bg-bg-sunken px-4 py-5">
                <p className="font-serif text-[22px] text-ink-900">ご参加は無料です</p>
                <p className="font-sans text-[13px] leading-relaxed text-ink-700">
                  費用はかかりません。
                </p>
              </section>
            )}

            {/* 成立後・不成立非課金の明示（無料側でも誤解防止のため併記）。 */}
            <Card tone="surface" className="flex flex-col gap-1.5">
              <p className="font-sans text-[13px] leading-relaxed text-ink-700">
                お支払いは<strong className="font-semibold">成立後</strong>のお手続きです。
                <strong className="font-semibold">不成立の場合は発生しません。</strong>
              </p>
              <p className="font-sans text-[12px] leading-relaxed text-ink-500">
                当日の会場が決まりましたら、改めてお知らせします。
              </p>
            </Card>
          </div>
        </PageBody>
        <StickyFooter>
          <ButtonLink href="/applications" data-testid="pay-confirm-free">
            参加を確定する
          </ButtonLink>
        </StickyFooter>
      </>
    );
  }

  // --- ready: chargeable (male_paid) ---------------------------------------
  return (
    <>
      <AppHeader title="お支払い" backHref="/applications" />
      <PageBody>
        <div className="flex flex-col gap-6">
          {/* 金額（主役）。¥は半角・tabular。状態は色＋ラベル＋形状で併記（§5）。 */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>参加費のお支払い</SectionLabel>
              <StatusPill tone="accent" glyph="●">
                お支払い待ち
              </StatusPill>
            </div>
            <div className="flex items-baseline justify-between border-b border-line-100 pb-3">
              <span className="font-sans text-[14px] text-ink-700">参加費</span>
              <span className="font-serif text-[28px] tabular-nums text-ink-900">
                ¥{amountJpy.toLocaleString()}
              </span>
            </div>
          </section>

          {/* タイミングの明示（必須）。誤解・不信を防ぐ事実ベースの説明。 */}
          <Card tone="sunken" className="flex flex-col gap-1.5">
            <p className="font-sans text-[13px] leading-relaxed text-ink-700">
              成立後のお支払いです。
              <strong className="font-semibold">不成立の場合は発生しません。</strong>
            </p>
            <p className="font-sans text-[12px] leading-relaxed text-ink-500">
              開催が見送りになった場合、料金は一切かかりません。
            </p>
          </Card>

          {/* Stripe 導線。カード入力は Stripe に委譲し、アプリ側でカード値を保持しない。 */}
          <section className="flex flex-col gap-2">
            <SectionLabel>お支払い方法</SectionLabel>
            <Card tone="surface" className="flex flex-col gap-2">
              {/*
                本番: ここに Stripe Elements (PaymentElement) を intent.clientSecret で
                マウントし、stripe.confirmPayment() で 3DS 等のリダイレクトまで委譲する。
                カード番号・名義・有効期限・CVC はすべて Stripe iframe 内で完結し、
                アプリ側 state / DOM / API には一切保持・送信しない（PII配慮 / §4.7C）。
                現在はモック: 下の「支払う」で confirm(payment.id) を呼び succeeded 化する。
              */}
              <p className="font-sans text-[13px] text-ink-700">カード情報の入力</p>
              <p className="font-sans text-[12px] leading-relaxed text-ink-500">
                決済は Stripe で安全に処理されます。カード情報は当アプリには保存されません。
              </p>
            </Card>
          </section>
        </div>
      </PageBody>

      <StickyFooter>
        <Button
          onClick={() => void handlePay()}
          disabled={phase === "paying"}
          data-testid="pay-button"
        >
          {phase === "paying"
            ? "お支払いを処理中…"
            : `¥${amountJpy.toLocaleString()} を支払う`}
        </Button>
      </StickyFooter>
    </>
  );
}

function intentErrorMessage(e: ApiCallError): string {
  switch (e.code) {
    case "forbidden":
      return "この成立のお支払いはできません。";
    case "slot_not_found":
      return "対象の成立が見つかりませんでした。";
    case "profile_required":
      return "お支払いの前にプロフィールの登録が必要です。";
    default:
      return "お支払い情報を取得できませんでした。時間をおいてお試しください。";
  }
}
