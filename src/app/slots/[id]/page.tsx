"use client";

// U-05 枠詳細 + 応募 — wireframes.md U-05/U-06, screen-flow.md §2.6.
// 応募導線が主役。eligibility(サーバ算出: 本人確認 AND 募集中 AND 条件充足)で応募ボタンの
// 状態を制御。不可時は理由を最上位に提示(条件不足は warn/muted、danger=赤にはしない / §8)。
// 男性は料金(成立後・初回無料)、女性は無料を明示。応募確認(U-06)はボトムシートで実施。
//
// GET /api/slots/[id] → { slot: SlotDetailDTO }（myApplication + eligibility 込み）。

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/States";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { FillDots } from "@/components/slots/FillDots";
import { SlotConditionChips } from "@/components/slots/SlotConditionChips";
import { PaymentNotice } from "@/components/slots/PaymentNotice";
import { ApplyConfirmSheet } from "@/components/slots/ApplyConfirmSheet";
import { fetchSlot, type SlotDetailDTO } from "@/app/_lib/api-s2";
import { getMe } from "@/app/_lib/api";
import {
  APPLICATION_STATUS_PILL,
  areaLabel,
  capacityText,
  conditionLines,
  fillProgressText,
  reasonSpec,
} from "@/app/_lib/slots-ui";
import { jstDateParts, weekdayColorClass } from "@/app/_lib/datetime";
import type { MeResponse } from "@/app/_lib/types";

// 初回無料の対象か。S2 では決済実装前のため全員 true(初回扱い)。料金予告は次回¥2,000を誠実に提示。
const FIRST_TIME_FREE = true;

const reasonBlockTone: Record<"warn" | "muted" | "info", string> = {
  warn: "border-state-warn/45 bg-[#F7EFD9]",
  muted: "border-line-200 bg-bg-sunken",
  info: "border-state-info/40 bg-state-info/10",
};
const reasonTextTone: Record<"warn" | "muted" | "info", string> = {
  warn: "text-state-warn",
  muted: "text-ink-700",
  info: "text-state-info",
};

export default function SlotDetailPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slot, setSlot] = useState<SlotDetailDTO | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [applied, setApplied] = useState<{ status: string; matched?: boolean } | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [detail, meRes] = await Promise.all([fetchSlot(params.id), getMe()]);
      setSlot(detail);
      setMe(meRes);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
        <AppHeader title="枠の詳細" backHref="/browse" />
        <LoadingState />
      </div>
    );
  }
  if (error || !slot) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
        <AppHeader title="枠の詳細" backHref="/browse" />
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      </div>
    );
  }

  const gender = me?.profile?.gender ?? null;
  const { eligibility, myApplication } = slot;
  // 重複しない最優先の不可理由ブロック(最上位表示用)。reasons は配列。
  const topReason = eligibility.reasons[0] ?? null;
  const canApply = eligibility.canApply && !applied;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <AppHeader title="枠の詳細" backHref="/browse" />

      <main className="flex-1 px-5 pb-10 pt-4">
        {/* 見出し(s11 §2.4 日付主役): 「6月13日(金)」明朝＋曜日色＋時刻、エリアはチップに格下げ。 */}
        <header>
          {(() => {
            const p = jstDateParts(slot.datetimeStart);
            return (
              <>
                <h1 className="font-serif text-[28px] leading-tight text-ink-900">
                  {p.month}月{p.day}日
                  <span className={weekdayColorClass(p.weekdayIndex)}>（{p.weekday}）</span>
                </h1>
                <p className="mt-1 font-sans text-[17px] tabular-nums text-ink-700">{p.time}〜</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-sm border border-line-200 bg-bg-sunken px-2 py-0.5 font-sans text-[12px] text-ink-700">
                    {areaLabel(slot.area)}
                  </span>
                  <span className="font-sans text-[13px] text-ink-500">{capacityText(slot)}</span>
                </div>
              </>
            );
          })()}
          <div className="mt-2.5">
            <SlotConditionChips conditions={slot.conditions} />
          </div>
        </header>

        {/* 応募済み: 現在の状態を最上位に静かに知らせる */}
        {myApplication ? (
          <div className="mt-5 flex items-center gap-2 rounded-md border border-line-200 bg-bg-surface p-3.5">
            <StatusPill
              tone={APPLICATION_STATUS_PILL[myApplication.status].tone}
              glyph={APPLICATION_STATUS_PILL[myApplication.status].glyph}
            >
              {APPLICATION_STATUS_PILL[myApplication.status].label}
            </StatusPill>
            <p className="font-sans text-[13px] text-ink-700">この枠に応募しています。</p>
          </div>
        ) : null}

        {/* 応募不可の理由を最上位に(条件不足は赤にしない)。応募済み起因の場合は上で案内済み。 */}
        {!eligibility.canApply && topReason && topReason !== "already_applied" ? (
          <div
            className={[
              "mt-5 rounded-md border p-3.5",
              reasonBlockTone[reasonSpec(topReason).tone],
            ].join(" ")}
            role="status"
          >
            <p
              className={[
                "font-sans text-[14px] font-semibold",
                reasonTextTone[reasonSpec(topReason).tone],
              ].join(" ")}
            >
              {reasonSpec(topReason).text}
            </p>
            {eligibility.reasons.length > 1 ? (
              <ul className="mt-1.5 space-y-0.5">
                {eligibility.reasons.slice(1).map((r) => (
                  <li key={r} className="font-sans text-[12px] text-ink-500">
                    ・{reasonSpec(r).text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* 募集状況(S12 #10: 合計6名で柔軟。「あと○名で成立」を主表示) */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">募集状況</h2>
          <div className="mt-2 rounded-md border border-line-200 bg-bg-surface p-4">
            <p className="font-sans text-[15px] font-semibold text-ink-900">
              {fillProgressText(slot)}
            </p>
            <p className="mt-0.5 font-sans text-[12px] text-ink-500">{capacityText(slot)}</p>
            <div className="mt-3 border-t border-line-100 pt-3">
              <FillDots
                filled={slot.filled}
                capacityPerGender={slot.capacityPerGender}
                variant="detail"
              />
            </div>
          </div>
        </section>

        {/* 参加条件 */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">参加条件</h2>
          <ul className="mt-2 space-y-1.5">
            {conditionLines(slot.conditions).map((line) => (
              <li key={line} className="flex items-start gap-2 font-sans text-[14px] text-ink-700">
                <span aria-hidden className="mt-0.5 text-ink-300">
                  ・
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* 料金(性別で出し分け) */}
        <section className="mt-6">
          <PaymentNotice gender={gender} feeMale={slot.feeMale} firstTimeFree={FIRST_TIME_FREE} />
        </section>

        {/* 当日の流れ */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">当日の流れ</h2>
          <ul className="mt-2 space-y-1.5">
            {["6名で成立 → ご連絡します", "会場は運営が手配します", "アプリ内の連絡はありません"].map(
              (line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 font-sans text-[14px] text-ink-700"
                >
                  <span aria-hidden className="mt-0.5 text-ink-300">
                    ・
                  </span>
                  {line}
                </li>
              ),
            )}
          </ul>
        </section>

        {/* 応募完了トースト相当(成立予告つき) */}
        {applied ? (
          <div className="mt-6 rounded-md border border-secondary-500/40 bg-secondary-100 p-3.5">
            <p className="font-sans text-[14px] font-semibold text-secondary-500">
              応募しました
            </p>
            <p className="mt-1 font-sans text-[13px] text-ink-700">
              成立したらお知らせします。応募状況からも確認できます。
            </p>
          </div>
        ) : null}
      </main>

      {/* フッタ: 応募導線。eligibility 通過時のみ活性。不可時は理由 + 別枠導線。 */}
      <div className="sticky bottom-0 space-y-2 border-t border-line-200 bg-bg-surface px-5 py-3 shadow-md">
        {applied ? (
          <ButtonLink href="/applications">応募状況を見る</ButtonLink>
        ) : canApply ? (
          <Button data-testid="apply-button" onClick={() => setSheetOpen(true)}>この枠に応募する</Button>
        ) : (
          <>
            <Button data-testid="apply-blocked" disabled aria-label="この枠には応募できません">
              {myApplication ? "応募済み" : "応募できません"}
            </Button>
            <ButtonLink href="/browse" variant="secondary">
              ほかの枠をさがす
            </ButtonLink>
          </>
        )}
      </div>

      {sheetOpen ? (
        <ApplyConfirmSheet
          slot={slot}
          gender={gender}
          firstTimeFree={FIRST_TIME_FREE}
          onClose={() => setSheetOpen(false)}
          onApplied={(status, matched) => {
            setSheetOpen(false);
            setApplied({ status, matched });
            // 反映のため詳細を再取得(myApplication / filled 更新)。
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
