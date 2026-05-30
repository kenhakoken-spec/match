import type { ReactNode } from "react";

// Layout surfaces per design-system.md §3 / §4.2.
// Card: bg.surface, 1px line.200, radius.md, padding 16px, no shadow by default
// (borders separate; §3.3). Section spacing 24–32px (§3.1).

export function Card({
  children,
  tone = "surface",
  className = "",
}: {
  children: ReactNode;
  tone?: "surface" | "sunken" | "accent";
  className?: string;
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent-300 bg-accent-100"
      : tone === "sunken"
        ? "border-line-200 bg-bg-sunken"
        : "border-line-200 bg-bg-surface";
  return (
    <div className={`rounded-md border p-4 ${toneClass} ${className}`}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-sans text-[13px] font-bold tracking-wide text-ink-700">
      {children}
    </h2>
  );
}

// Standard scrollable page body with consistent side margins (20px, §3.1) and
// generous vertical rhythm. Use inside (app) screens.
export function PageBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`flex-1 px-5 pb-10 pt-5 ${className}`}>{children}</main>
  );
}

// A fixed-feel footer that holds the single primary action (§3.4 / §4.1).
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 border-t border-line-200 bg-bg-surface px-5 py-3 shadow-md">
      {children}
    </div>
  );
}
