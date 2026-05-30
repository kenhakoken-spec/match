import Link from "next/link";
import type { ReactNode } from "react";

// Screen header per design-system.md §4.4.
// Title (h1, serif used sparingly) + optional back ←. Transparent / bg.base.
// Each screen carries a self-explanatory title (deep-link landings, §4.4).

export function AppHeader({
  title,
  backHref,
  serif,
  right,
  progress,
}: {
  title: string;
  backHref?: string;
  serif?: boolean; // use the editorial serif for emotionally-weighted titles
  right?: ReactNode;
  progress?: string; // e.g. "1/1" shown at the right
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line-100 bg-bg-base/95 px-3 backdrop-blur">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="戻る"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-700 hover:bg-bg-sunken"
        >
          <span aria-hidden className="text-lg leading-none">
            ←
          </span>
        </Link>
      ) : (
        <span className="w-2" />
      )}
      <h1
        className={[
          "min-w-0 flex-1 truncate px-1 text-ink-900",
          serif ? "font-serif text-[20px] font-semibold" : "font-sans text-[17px] font-bold",
        ].join(" ")}
      >
        {title}
      </h1>
      {progress ? (
        <span className="px-2 font-sans text-xs tabular-nums text-ink-500">
          {progress}
        </span>
      ) : null}
      {right}
    </header>
  );
}
