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
// S11(s11-visual §2.2/§2.4): app-shell の 480px 撤廃に伴い、読み物/入力系の本文は
// ここで 480px 中央を保証する(base 不変＝従来 480px と同一)。PC でも間延びさせない。
export function PageBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto w-full max-w-[480px] flex-1 px-5 pb-10 pt-5 ${className}`}>
      {children}
    </main>
  );
}

// A fixed-feel footer that holds the single primary action (§3.4 / §4.1).
// S11: 帯は全幅、中身は本文と同じ 480px 中央に揃える(PC で CTA が間延びしない)。
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 border-t border-line-200 bg-bg-surface shadow-md">
      <div className="mx-auto w-full max-w-[480px] px-5 py-3">{children}</div>
    </div>
  );
}
