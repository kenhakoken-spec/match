// src/components/slots/ApplyConfirmSheet.tsx — 応募確認 (U-06, screen-flow §2.6).
// Bottom-sheet dialog: 枠サマリ + 料金予告(男性は初回無料/女性は無料) + 確認チェック
// → 応募を確定する。role="dialog" aria-modal + focus trap + Esc。
// POST apply: 200 → onApplied(status,matched)。409 → reasons をシート内に文言化して表示
// (条件不足は danger にしない)。
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxRow } from "@/components/ui/Consent";
import { PaymentNotice } from "./PaymentNotice";
import { SlotConditionChips } from "./SlotConditionChips";
import { applyToSlot } from "@/app/_lib/api-s2";
import { reasonSpec, areaLabel } from "@/app/_lib/slots-ui";
import { formatDateTime } from "@/app/_lib/datetime";
import type { EligibilityReasonCode, SlotDetailDTO } from "@/app/_lib/api-s2";
import type { Gender } from "@/app/_lib/types";

interface Props {
  slot: SlotDetailDTO;
  gender: Gender | null;
  firstTimeFree: boolean;
  onClose: () => void;
  onApplied: (status: string, matched?: boolean) => void;
}

const reasonToneClass: Record<"warn" | "muted" | "info", string> = {
  warn: "border-state-warn/45 bg-[#F7EFD9] text-state-warn",
  muted: "border-line-200 bg-bg-sunken text-ink-700",
  info: "border-state-info/40 bg-state-info/10 text-state-info",
};

export function ApplyConfirmSheet({ slot, gender, firstTimeFree, onClose, onApplied }: Props) {
  const male = gender !== "female";
  const [attend, setAttend] = useState(false);
  const [venue, setVenue] = useState(false);
  const [fee, setFee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reasons, setReasons] = useState<EligibilityReasonCode[]>([]);
  const [genericError, setGenericError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 男性(2回目以降)は料金チェックも必須。初回無料/女性は料金チェック不要。
  const needFeeCheck = male && !firstTimeFree;
  const allChecked = attend && venue && (!needFeeCheck || fee);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => prev?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const f = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  async function handleApply() {
    setSubmitting(true);
    setReasons([]);
    setGenericError(null);
    const outcome = await applyToSlot(slot.id);
    if (outcome.ok) {
      onApplied(outcome.status ?? "applied", outcome.matched);
      return;
    }
    if (outcome.reasons && outcome.reasons.length > 0) {
      setReasons(outcome.reasons);
    } else {
      setGenericError("通信に失敗しました。時間をおいて再度お試しください。");
    }
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(43,38,34,0.45)]"
      onClick={submitting ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-sheet-title"
        className="max-h-[90dvh] w-full max-w-app overflow-y-auto rounded-t-lg border-t border-line-200 bg-bg-base px-5 pb-6 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-200" aria-hidden />
        <h2 id="apply-sheet-title" className="font-serif text-[20px] text-ink-900">
          応募の確認
        </h2>

        <div className="mt-4 rounded-md border border-line-200 bg-bg-surface p-4">
          <p className="font-sans text-[15px] text-ink-900">
            {areaLabel(slot.area)} ・ {formatDateTime(slot.datetimeStart)}
          </p>
          <p className="mt-1 font-sans text-[13px] text-ink-500">3 対 3（男女各3名）</p>
          <div className="mt-2">
            <SlotConditionChips conditions={slot.conditions} />
          </div>
        </div>

        <div className="mt-5">
          <PaymentNotice gender={gender} feeMale={slot.feeMale} firstTimeFree={firstTimeFree} />
        </div>

        <div className="mt-5 space-y-2">
          <h3 className="font-sans text-[13px] font-bold text-ink-700">確認事項</h3>
          <CheckboxRow checked={attend} onChange={setAttend}>
            当日の参加を予定しています
          </CheckboxRow>
          <CheckboxRow checked={venue} onChange={setVenue}>
            会場は後日の連絡で確認します
          </CheckboxRow>
          {needFeeCheck ? (
            <CheckboxRow checked={fee} onChange={setFee}>
              料金（成立後に {slot.feeMale.toLocaleString("ja-JP")} 円）について確認しました
            </CheckboxRow>
          ) : null}
        </div>

        {reasons.length > 0 ? (
          <ul className="mt-4 space-y-1.5" aria-live="assertive">
            {reasons.map((code) => {
              const spec = reasonSpec(code);
              return (
                <li
                  key={code}
                  className={[
                    "rounded-sm border px-3 py-2 font-sans text-[13px] leading-relaxed",
                    reasonToneClass[spec.tone],
                  ].join(" ")}
                >
                  {spec.text}
                </li>
              );
            })}
          </ul>
        ) : null}

        {genericError ? (
          <p
            role="alert"
            className="mt-4 rounded-sm border border-state-warn/45 bg-[#F7EFD9] px-3 py-2 font-sans text-[13px] text-state-warn"
          >
            {genericError}
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          <Button data-testid="apply-confirm" disabled={!allChecked || submitting} onClick={handleApply}>
            {submitting ? "応募しています…" : "応募を確定する"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            やめる
          </Button>
        </div>
      </div>
    </div>
  );
}
