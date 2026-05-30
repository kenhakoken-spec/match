"use client";

import type { ReactNode } from "react";
import { Button } from "./ui/Button";

// Loading / empty / error states per wireframes.md U-E.
// Calm tone, non-blaming copy. State conveyed by glyph + label, not color only.

export function LoadingState({
  label = "読み込んでいます",
  "data-testid": testId,
}: {
  label?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center"
    >
      <span
        aria-hidden
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-line-200 border-t-accent-500"
      />
      <p className="font-sans text-[14px] text-ink-500">{label}</p>
    </div>
  );
}

export function EmptyState({
  glyph = "◇",
  title,
  body,
  action,
  "data-testid": testId,
}: {
  glyph?: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span aria-hidden className="text-2xl text-ink-300">
        {glyph}
      </span>
      <p className="font-serif text-[18px] text-ink-900">{title}</p>
      {body ? (
        <p className="max-w-[16rem] font-sans text-[14px] leading-relaxed text-ink-500">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-1 w-full max-w-[16rem]">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "読み込めませんでした",
  body = "通信状況をご確認のうえ、もう一度お試しください。",
  onRetry,
}: {
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center"
    >
      <span aria-hidden className="text-2xl text-state-danger">
        ⚠
      </span>
      <p className="font-serif text-[18px] text-ink-900">{title}</p>
      <p className="max-w-[16rem] font-sans text-[14px] leading-relaxed text-ink-500">
        {body}
      </p>
      {onRetry ? (
        <div className="mt-1 w-full max-w-[12rem]">
          <Button variant="secondary" onClick={onRetry}>
            再読み込み
          </Button>
        </div>
      ) : null}
    </div>
  );
}
