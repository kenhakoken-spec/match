"use client";

import type { ReactNode } from "react";

// Selectable chips / segmented choices per design-system.md §4.3 / §4.7.
// Used for gender (2-up, required), area chips (multi), docType, birthdate-ish.
// Selected state is NOT color-only: selected adds an accent ground AND a filled
// dot marker + aria-pressed, so it reads without color (§1.6 / §5).

const MIN_TAP = "min-h-[44px]"; // tap target ≥44pt (§4.1)

export function ChoiceChip({
  selected,
  onClick,
  children,
  multi,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  multi?: boolean; // multi-select shows a check-like marker; single shows a dot
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={[
        MIN_TAP,
        "inline-flex items-center gap-2 rounded-sm border px-3.5 py-2 font-sans text-[13px] font-semibold transition-colors",
        selected
          ? "border-accent-500 bg-accent-300/40 text-ink-900"
          : "border-line-200 bg-bg-surface text-ink-700 hover:bg-bg-sunken",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] leading-none",
          selected
            ? "border-accent-600 bg-accent-600 text-white"
            : "border-line-200 bg-transparent text-transparent",
        ].join(" ")}
      >
        {selected ? (multi ? "✓" : "●") : ""}
      </span>
      {children}
    </button>
  );
}

// A larger 2-up segmented control (e.g. gender). Same no-color-only rule.
export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={[
              "flex h-12 items-center justify-center gap-2 rounded-md border font-sans text-[14px] font-semibold transition-colors",
              selected
                ? "border-accent-500 bg-accent-300/40 text-ink-900"
                : "border-line-200 bg-bg-surface text-ink-700 hover:bg-bg-sunken",
            ].join(" ")}
          >
            <span
              aria-hidden
              className={[
                "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px]",
                selected
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-line-200",
              ].join(" ")}
            >
              {selected ? "●" : ""}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
