import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Button system per design-system.md §4.1.
// Primary: accent.600 ground (≥4.5:1 white-on-ground per §1.6), white text,
//   radius.md, height 52px, label type. One primary per screen (fixed footer).
// Secondary: transparent ground, 1px line.200 border, ink.700 text.
// Text: accent.500 text only. Danger(text): state.danger text.
// All hit targets ≥48px tall (≥44pt per §4.1 / accessibility).
// Disabled: bg.sunken ground, ink.300 text, not-allowed — used for unmet gates.

type Variant = "primary" | "secondary" | "text" | "danger";

const base =
  "inline-flex w-full items-center justify-center gap-2 rounded-md font-sans text-[13px] font-semibold tracking-[0.02em] transition-colors select-none";

const sizeByVariant: Record<Variant, string> = {
  primary: "h-[52px] px-5",
  secondary: "h-12 px-5",
  text: "h-12 px-3",
  danger: "h-12 px-3",
};

// S11 #4: 「押せる」アフォーダンスを強化。トーン(テラコッタaccent・角丸)は維持しつつ、
// primary は影＋押下フィードバック(active:scale/translate)で立体感とタップ実感を出す。
// secondary も陰影を少し付け、輪郭を明確化。
const enabledByVariant: Record<Variant, string> = {
  primary:
    "bg-accent-600 text-white shadow-[0_2px_8px_rgba(176,70,60,0.28)] hover:bg-accent-600/95 hover:shadow-[0_4px_14px_rgba(176,70,60,0.34)] active:translate-y-px active:shadow-[0_1px_4px_rgba(176,70,60,0.28)] active:bg-accent-600",
  secondary:
    "border border-line-200 bg-bg-surface text-ink-700 shadow-[0_1px_3px_rgba(43,38,34,0.06)] hover:bg-bg-sunken hover:border-ink-300 active:translate-y-px active:bg-bg-sunken",
  text: "bg-transparent text-accent-600 hover:underline",
  danger: "bg-transparent text-state-danger hover:underline",
};

const disabledClass =
  "cursor-not-allowed bg-bg-sunken text-ink-300 hover:bg-bg-sunken";

function classesFor(variant: Variant, disabled: boolean): string {
  return [
    base,
    sizeByVariant[variant],
    disabled ? disabledClass : enabledByVariant[variant],
  ].join(" ");
}

type ButtonProps = {
  variant?: Variant;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "className">;

export function Button({
  variant = "primary",
  disabled = false,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={classesFor(variant, disabled)}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = {
  variant?: Variant;
  href: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "className" | "href">;

export function ButtonLink({
  variant = "primary",
  href,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link href={href} className={classesFor(variant, false)} {...rest}>
      {children}
    </Link>
  );
}
