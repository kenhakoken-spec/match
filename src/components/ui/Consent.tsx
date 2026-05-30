"use client";

import type { ReactNode } from "react";

// Consent / confirmation checkbox per design-system.md §4 and a11y.
// Used for terms consent (U-01) and confirmation steps. Tap target ≥44pt.
// The checked state shows a filled box with a check (shape), not color alone.

export function CheckboxRow({
  checked,
  onChange,
  children,
  "data-testid": testId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-sm border border-line-200 bg-bg-surface px-3.5 py-2.5 text-left transition-colors hover:bg-bg-sunken"
    >
      <span
        aria-hidden
        className={[
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border text-[12px] leading-none",
          checked
            ? "border-accent-600 bg-accent-600 text-white"
            : "border-line-200 bg-bg-surface text-transparent",
        ].join(" ")}
      >
        ✓
      </span>
      <span className="font-sans text-[14px] leading-relaxed text-ink-700">
        {children}
      </span>
    </button>
  );
}
