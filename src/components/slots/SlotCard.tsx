// src/components/slots/SlotCard.tsx — 枠カード (U-04, design-system §4.2 / s9 §5 / s11 §2).
// Layout(s11 日付主役): 日付ブロック(主役)+エリアチップ(従)(上) → 充足ドット+残数(中)
//   → 条件チップ+料金(下). 情報階層①いつ②どこ③充足④条件/料金。
// 条件不足(client hint) は淡色 + 破線 + 事実理由(muted)。danger(赤)にはしない(§8).
// 料金は viewer の性別で出し分け(s9 §5): 女性には料金行を出さない(異性料金を見せない)。
//   男性 = 「男性 ¥2,000」/ 性別不明(viewerGender 無し) = 中立併記「男性 ¥2,000 ・ 女性 無料」。
// Whole card is a link to U-05 (詳細は誰でも見られる)。
import Link from "next/link";
import { FillDots } from "./FillDots";
import { SlotConditionChips } from "./SlotConditionChips";
import { AreaChip, SlotDateBlock } from "./SlotDateBlock";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { areaLabel, fillProgressText, totalRemaining, yen, type ListHint } from "@/app/_lib/slots-ui";
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
  // S12 #10: 合計6名で柔軟(2:4 も成立)。残数は合計ベース「あと○名で成立」を主表示。
  const full = totalRemaining(slot) === 0;

  return (
    <Link
      href={`/slots/${slot.id}`}
      data-testid="slot-card-link"
      aria-label={`${areaLabel(slot.area)} ${formatDateShort(slot.datetimeStart)} ${formatTime(slot.datetimeStart)} の枠の詳細`}
      className={[
        // base は現行どおり block。md+ のグリッドでは h-full + flex-col でセル高さを揃え、
        // 料金行を md:mt-auto で下端に沈める(余白は中段 / s11視覚§4.1)。base は不変。
        "block rounded-md border p-4 transition-colors md:flex md:h-full md:flex-col",
        ineligible
          ? "border-dashed border-line-200 bg-bg-sunken/50 hover:bg-bg-sunken"
          : "border-line-200 bg-bg-surface hover:bg-bg-sunken/60",
      ].join(" ")}
    >
      {/* 上段: 日付ブロック(主役) + エリアチップ(従)。情報階層①いつ②どこ(s11 §2.3)。 */}
      <div data-testid="slot-card" className="flex items-start justify-between gap-3">
        <SlotDateBlock iso={slot.datetimeStart} muted={ineligible} />
        <AreaChip label={areaLabel(slot.area)} />
      </div>

      <div className="mt-3">
        <FillDots filled={slot.filled} capacityPerGender={slot.capacityPerGender} />
      </div>
      <p
        className={[
          "mt-1 font-sans text-[12px]",
          full ? "text-state-muted" : "text-ink-700",
        ].join(" ")}
      >
        {fillProgressText(slot)}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-100 pt-3 md:mt-auto">
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
