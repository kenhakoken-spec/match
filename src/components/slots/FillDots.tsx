// src/components/slots/FillDots.tsx — 充足ドット (design-system §4.2 / §5.4).
// ●=確定 / ○=空き を性別ごとに表示。色だけに頼らず aria-label で確定数を読み上げる。
// variant="inline": U-04 カード用(横並び・残数つき)。variant="detail": U-05 用(大きめ)。
import { fillDots, genderRemainingLabel } from "@/app/_lib/slots-ui";

function Row({
  label,
  filled,
  capacity,
  large,
}: {
  label: string;
  filled: number;
  capacity: number;
  large?: boolean;
}) {
  const remain = genderRemainingLabel(filled, capacity);
  const isFull = remain === "満";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-sans text-[12px] text-ink-500">{label}</span>
      <span
        className={[
          "tracking-[0.12em] tabular-nums",
          large ? "text-[15px]" : "text-[13px]",
          "text-accent-500",
        ].join(" ")}
        aria-label={`${label} ${capacity}枠中${Math.min(Math.max(filled, 0), capacity)}確定`}
      >
        {fillDots(filled, capacity)}
      </span>
      <span
        className={[
          "font-sans text-[11px]",
          isFull ? "text-state-muted" : "text-ink-500",
        ].join(" ")}
      >
        ({remain})
      </span>
    </span>
  );
}

export function FillDots({
  filled,
  capacityPerGender,
  variant = "inline",
}: {
  filled: { male: number; female: number };
  capacityPerGender: number;
  variant?: "inline" | "detail";
}) {
  const large = variant === "detail";
  return (
    <div
      className={[
        "flex",
        large ? "flex-col gap-1.5" : "flex-wrap items-center gap-x-4 gap-y-1",
      ].join(" ")}
    >
      <Row label="女性" filled={filled.female} capacity={capacityPerGender} large={large} />
      <Row label="男性" filled={filled.male} capacity={capacityPerGender} large={large} />
    </div>
  );
}
