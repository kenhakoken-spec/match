// src/components/slots/SlotDateBlock.tsx — 会カードの「日付主役」ブロック (s11 §2.2/§2.3).
// 情報階層①いつ②どこ③充足④条件/料金 のうち最上位「いつ」を担う共通ブロック。
// SlotCard / PublicSlotCard / カレンダー直下カードで同じ視覚言語を使うため切り出す。
//
// 構図: 左に大きな「日」(serif・tabular)を主役化、月は小さく前置、曜日は色で区別、
// 時刻は曜日の下に tabular で「19:30〜」。曜日色は既存トークン流用(平日 ink-700 /
// 土 state-info / 日 accent-600)で、色のみに依存しない(曜日文字を必ず併記)。
// 新トークンは使わない(design-system §7 の既存で完結)。
import { jstDateParts, weekdayColorClass } from "@/app/_lib/datetime";

export function SlotDateBlock({
  iso,
  muted = false,
}: {
  iso: string;
  // ineligible(条件不足)のカードで日付も淡色にする。赤にはしない(§8)。
  muted?: boolean;
}) {
  const p = jstDateParts(iso);
  const dayColor = muted ? "text-ink-700" : "text-ink-900";
  const weekdayColor = weekdayColorClass(p.weekdayIndex);

  return (
    <div className="flex items-baseline gap-1.5">
      {/* 月(小さく前置)。"6/" まで。 */}
      <span className="font-serif text-[14px] leading-none text-ink-500 tabular-nums">
        {p.month}/
      </span>
      {/* 日(主役・大きな数字)。 */}
      <span className={["font-serif text-[28px] leading-none tabular-nums", dayColor].join(" ")}>
        {p.day}
      </span>
      {/* 曜日(色で区別)＋時刻(その下に従える)。 */}
      <span className="ml-1.5 flex flex-col leading-none">
        <span className={["font-sans text-[14px] font-semibold leading-none", weekdayColor].join(" ")}>
          {p.weekday}
        </span>
        <span className="mt-1 font-sans text-[13px] leading-none tabular-nums text-ink-700">
          {p.time}〜
        </span>
      </span>
    </div>
  );
}

// エリアチップ(従)。日付の対角に置く。design-system §5.2 のチップ流儀(地 sunken / 線 / ink-700)。
// 「恵比寿」のみ・「エリア」語は付けない(s11 §5.2)。
export function AreaChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-sm border border-line-200 bg-bg-sunken px-2 py-0.5 font-sans text-[12px] text-ink-700">
      {label}
    </span>
  );
}
