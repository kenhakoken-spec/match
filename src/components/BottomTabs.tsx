"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Bottom tab bar per design-system.md §4.4 and screen-flow.md §2.2.
// Three tabs: 枠をさがす / 応募状況 / マイページ. bg.surface + top border.
// Selected = accent.500 icon+label; unselected = ink.500. No filled badges.
// Icons are simple line glyphs (stroke feel) — not emoji.

type Tab = {
  href: string;
  label: string;
  // match these path prefixes as "active"
  match: string[];
  icon: (active: boolean) => JSX.Element;
};

function strokeProps(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: active ? "text-accent-500" : "text-ink-500",
    "aria-hidden": true,
  };
}

const TABS: Tab[] = [
  {
    href: "/browse",
    label: "枠をさがす",
    match: ["/browse"],
    icon: (active) => (
      <svg {...strokeProps(active)}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-3.6-3.6" />
      </svg>
    ),
  },
  {
    href: "/applications",
    label: "応募状況",
    match: ["/applications"],
    icon: (active) => (
      <svg {...strokeProps(active)}>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
      </svg>
    ),
  },
  {
    href: "/mypage",
    label: "マイページ",
    match: ["/mypage", "/profile"],
    icon: (active) => (
      <svg {...strokeProps(active)}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
      </svg>
    ),
  },
];

export function BottomTabs() {
  const pathname = usePathname() ?? "";
  return (
    // S11(s11視覚§4.3): 帯(border-t/bg)は全幅、3タブのグリッドは 480px 中央に抑える。
    // PC で広い一覧の下でもタブが両端に間延びしない。base は 480px のままで不変。
    <nav
      aria-label="メインナビゲーション"
      className="sticky bottom-0 z-10 border-t border-line-200 bg-bg-surface"
    >
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-3">
        {TABS.map((tab) => {
        const active = tab.match.some(
          (p) => pathname === p || pathname.startsWith(`${p}/`),
        );
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 py-2"
          >
            {tab.icon(active)}
            <span
              className={[
                "font-sans text-[11px] font-semibold tracking-wide",
                active ? "text-accent-500" : "text-ink-500",
              ].join(" ")}
            >
              {tab.label}
            </span>
          </Link>
        );
        })}
      </div>
    </nav>
  );
}
