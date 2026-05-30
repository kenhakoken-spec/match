import type { ReactNode } from "react";

// Status / badge primitives per design-system.md §4.7 / §5.
// CRITICAL RULE: state is expressed by color + LABEL + SHAPE together, never
// color alone (§1.6 / §5). Each pill carries a glyph (shape) + text label.

type Tone = "info" | "success" | "warn" | "muted" | "danger" | "accent" | "verified" | "trust";

// Each tone maps to a low-saturation token from the palette. We pair every
// tone with an explicit glyph at the call site so meaning never relies on hue.
const toneClass: Record<Tone, string> = {
  info: "border-state-info/40 bg-state-info/10 text-state-info",
  success: "border-secondary-500/40 bg-secondary-100 text-secondary-500",
  warn: "border-state-warn/45 bg-[#F7EFD9] text-state-warn",
  muted: "border-line-200 bg-bg-sunken text-state-muted",
  danger: "border-state-danger/40 bg-[#F4E4E2] text-state-danger",
  accent: "border-accent-500/45 bg-accent-100 text-accent-600",
  verified: "border-verified-500/40 bg-secondary-100 text-verified-500",
  trust: "border-trust-300 bg-trust-100 text-trust-600",
};

export function StatusPill({
  tone,
  glyph,
  children,
}: {
  tone: Tone;
  glyph: ReactNode; // shape cue: ◷ ● ○ ◌ ⚠ ✓ ◆ ★ etc.
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-xs font-semibold leading-5",
        toneClass[tone],
      ].join(" ")}
    >
      <span aria-hidden className="text-[11px] leading-none">
        {glyph}
      </span>
      {children}
    </span>
  );
}

// Trust badges (本人確認済 / 優良) — quiet brass, no shine/gradient (§4.7 E).
export function VerifiedBadge() {
  return (
    <StatusPill tone="verified" glyph="✓">
      本人確認済
    </StatusPill>
  );
}

export function PremiumBadge() {
  return (
    <StatusPill tone="trust" glyph="◆">
      優良
    </StatusPill>
  );
}

// Participation-condition chip (20代限定 / 優良バッジ限定) per §4.7 A.
// Color does NOT signal urgency — conditions are factual info on a neutral pill.
export function ConditionChip({
  children,
  withBadgeIcon,
}: {
  children: ReactNode;
  withBadgeIcon?: boolean; // 優良バッジ限定 prefixes a ◆ to link to the badge
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-line-200 bg-bg-sunken px-2 py-0.5 font-sans text-xs text-ink-700">
      {withBadgeIcon ? (
        <span aria-hidden className="text-trust-600">
          ◆
        </span>
      ) : null}
      {children}
    </span>
  );
}
