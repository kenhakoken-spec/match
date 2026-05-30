// Star rating display + input per design-system.md §4.7 D.
// ★ filled = accent.500, ☆ empty. 5 段階。Tap target ≥44pt (§4.7 D / §6).
// Honest tone — never used to nag, compete, or rank (§8).

"use client";

import { useId } from "react";

export function StarSummary({
  avg,
  count,
}: {
  avg: number;
  count: number;
}) {
  const rounded = Math.round(avg);
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[13px] text-ink-700">
      <span aria-hidden className="text-[13px] leading-none tracking-tight">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={i < rounded ? "text-accent-500" : "text-line-200"}
          >
            ★
          </span>
        ))}
      </span>
      <span className="tabular-nums">
        {avg.toFixed(1)}
        <span className="ml-1 text-ink-500">（{count}件の評価）</span>
      </span>
    </span>
  );
}

// Interactive 5-step star input (U-15). A native radiogroup so it is keyboard-
// operable and screen-reader friendly: each star is a radio labelled "N点".
// Each control is ≥44pt (h-11 w-11) per §4.7 D / accessibility §6. Color is not
// the only signal — selecting renders ★ (filled) vs ☆ (outline) shapes, and the
// chosen value is announced via the radio's accessible label.
const SCORE_LABELS: Record<number, string> = {
  1: "1点",
  2: "2点",
  3: "3点",
  4: "4点",
  5: "5点",
};

export function StarInput({
  value,
  onChange,
  legend,
  name,
  testIdPrefix,
}: {
  value: number; // 0 = 未選択
  onChange: (score: number) => void;
  legend: string; // 見出し（例: 全体の満足度 / また会いたい）
  name: string; // radiogroup 名（カードごとに一意に）
  testIdPrefix?: string; // 例 "star" → star-1..star-5
}) {
  const groupId = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 font-sans text-[13px] font-semibold text-ink-700">
        {legend}
      </legend>
      <div role="radiogroup" aria-label={legend} className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = n <= value;
          const inputId = `${groupId}-${n}`;
          return (
            <label
              key={n}
              htmlFor={inputId}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-[26px] leading-none transition-colors hover:bg-bg-sunken"
            >
              <input
                type="radio"
                id={inputId}
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                data-testid={testIdPrefix ? `${testIdPrefix}-${n}` : undefined}
                className="sr-only"
              />
              <span aria-hidden className={selected ? "text-accent-500" : "text-line-200"}>
                {selected ? "★" : "☆"}
              </span>
              <span className="sr-only">{SCORE_LABELS[n]}</span>
            </label>
          );
        })}
        {/* 選択値をテキストでも添える（色のみに依存しない / §5）。 */}
        <span aria-hidden className="ml-2 font-sans text-[13px] tabular-nums text-ink-500">
          {value > 0 ? SCORE_LABELS[value] : "未選択"}
        </span>
      </div>
    </fieldset>
  );
}
