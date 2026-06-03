// src/components/public/PublicSlotCard.tsx — 公開(未ログイン)枠カード (S8 要望1 / s11 §2).
// 認証版 SlotCard(eligibility ヒント前提) は流用せず、公開DTO専用の薄いカードを置く。
// 表示(s11 日付主役): 日付ブロック(主役)+エリアチップ(従) / 充足ドット+残数 / 参加条件チップ / 料金中立併記。
// 個人特定情報は構造上 PublicSlotDTO に無い(氏名/写真/lineUserId は出さない)。
// design-system §4.2(カード) / §4.7A(条件チップ) / §8(煽らない) 準拠。
import Link from "next/link";
import { FillDots } from "@/components/slots/FillDots";
import { SlotConditionChips } from "@/components/slots/SlotConditionChips";
import { AreaChip, SlotDateBlock } from "@/components/slots/SlotDateBlock";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { areaLabel, remainingText, yen } from "@/app/_lib/slots-ui";
import type { PublicSlotDTO } from "@/lib/types";

export function PublicSlotCard({ slot }: { slot: PublicSlotDTO }) {
  const remain = remainingText(slot);
  const full = remain === "満員";

  return (
    <Link
      href={`/explore/${slot.id}`}
      data-testid="public-slot-card"
      aria-label={`${areaLabel(slot.area)} ${formatDateShort(slot.datetimeStart)} ${formatTime(slot.datetimeStart)} の会の詳細`}
      className="block rounded-md border border-line-200 bg-bg-surface p-4 transition-colors hover:bg-bg-sunken/60 md:flex md:h-full md:flex-col"
    >
      {/* 上段: 日付ブロック(主役) + エリアチップ(従)。情報階層①いつ②どこ(s11 §2.3)。 */}
      <div className="flex items-start justify-between gap-3">
        <SlotDateBlock iso={slot.datetimeStart} />
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
        {full ? "満席です" : `${remain}名で成立します`}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-100 pt-3 md:mt-auto">
        <SlotConditionChips conditions={slot.conditions} />
        {/* 公開は性別不明 → 中立併記(女性無料を追記 / s9 §5.1・§5.3)。 */}
        <span className="shrink-0 font-sans text-[12px] text-ink-500">
          男性 <span className="font-semibold tabular-nums text-ink-700">{yen(slot.feeMale)}</span>
          <span className="text-ink-500"> ・ 女性 無料</span>
        </span>
      </div>
    </Link>
  );
}
