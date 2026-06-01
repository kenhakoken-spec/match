// src/components/slots/SlotCard.tsx — 枠カード (U-04, design-system §4.2 / s9 §5).
// Layout: エリア・日時(上) → 充足ドット+残数(中) → 条件チップ+料金(下).
// 条件不足(client hint) は淡色 + 破線 + 事実理由(muted)。danger(赤)にはしない(§8).
// 料金は viewer の性別で出し分け(s9 §5): 女性には料金行を出さない(異性料金を見せない)。
//   男性 = 「男性 ¥2,000」/ 性別不明(viewerGender 無し) = 中立併記「男性 ¥2,000 ・ 女性 無料」。
// Whole card is a link to U-05 (詳細は誰でも見られる)。
import Link from "next/link";
import { FillDots } from "./FillDots";
import { SlotConditionChips } from "./SlotConditionChips";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { areaLabel, remainingText, yen, type ListHint } from "@/app/_lib/slots-ui";
import type { SlotDTO } from "@/app/_lib/api-s2";
import type { Gender } from "@/app/_lib/types";

export function SlotCard({
  slot,
  hint,
  viewerGender,
}: {
  slot: SlotDTO;
  hint?: ListHint;
  viewerGender?: Gender | null;
}) {
  const ineligible = hint?.ineligible ?? false;
  const remain = remainingText(slot);
  const full = remain === "満員";

  return (
    <Link
      href={`/slots/${slot.id}`}
      data-testid="slot-card-link"
      aria-label={`${areaLabel(slot.area)} ${formatDateShort(slot.datetimeStart)} ${formatTime(slot.datetimeStart)} の枠の詳細`}
      className={[
        "block rounded-md border p-4 transition-colors",
        ineligible
          ? "border-dashed border-line-200 bg-bg-sunken/50 hover:bg-bg-sunken"
          : "border-line-200 bg-bg-surface hover:bg-bg-sunken/60",
      ].join(" ")}
    >
      <div data-testid="slot-card" className="flex items-baseline justify-between gap-2">
        <span
          className={[
            "font-serif text-[17px] leading-tight",
            ineligible ? "text-ink-700" : "text-ink-900",
          ].join(" ")}
        >
          {areaLabel(slot.area)}
        </span>
        <span className="shrink-0 font-sans text-[13px] tabular-nums text-ink-500">
          {formatDateShort(slot.datetimeStart)} {formatTime(slot.datetimeStart)}〜
        </span>
      </div>

      <div className="mt-2.5">
        <FillDots filled={slot.filled} capacityPerGender={slot.capacityPerGender} />
      </div>
      <p
        className={[
          "mt-1 font-sans text-[12px]",
          full ? "text-state-muted" : "text-ink-700",
        ].join(" ")}
      >
        {remain}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-100 pt-3">
        <SlotConditionChips conditions={slot.conditions} />
        {/* 女性視点では料金行を出さない(¥2,000 を見せない / s9 §5)。 */}
        {viewerGender === "female" ? null : (
          <span className="shrink-0 font-sans text-[12px] text-ink-500">
            男性 <span className="font-semibold text-ink-700 tabular-nums">{yen(slot.feeMale)}</span>
            {viewerGender == null ? (
              <span className="text-ink-500"> ・ 女性 無料</span>
            ) : null}
          </span>
        )}
      </div>

      {ineligible && hint?.reason ? (
        <p className="mt-2 font-sans text-[12px] text-state-muted">{hint.reason}</p>
      ) : null}
    </Link>
  );
}
