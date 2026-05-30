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

const enabledByVariant: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-600/90 active:bg-accent-600",
  secondary:
    "border border-line-200 bg-transparent text-ink-700 hover:bg-bg-sunken active:bg-bg-sunken",
  text: "bg-transparent text-accent-500 hover:underline",
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
