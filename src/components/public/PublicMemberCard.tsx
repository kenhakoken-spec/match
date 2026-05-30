// src/components/public/PublicMemberCard.tsx — 公開(未ログイン)参加者カード (S8 要望1).
// 参加者の「すごさ」を匿名サマリで見せる: 職種・年代band・多軸評価★・優良バッジ。
// **PII を出さない**: PublicMemberDTO に氏名/写真/lineUserId は無く、本カードも
// それらの欄(アバター枠・名前欄)を作らない。年代/職種/評価のみで構成する。
// design-system §4.7D(星=accent.500/5段階/色のみに頼らない) / §4.7E(優良バッジは静かに)
// / §8(ランキング煽り禁止) 準拠。
import { PremiumBadge } from "@/components/ui/StatusPill";
import type { PublicMemberDTO } from "@/lib/types";
import { GENDER_LABELS } from "@/app/_lib/types";
import { occupationLabel } from "@/app/_lib/public-ui";

export function PublicMemberCard({ member }: { member: PublicMemberDTO }) {
  const { occupation, ageBand, gender, ratings, hasPremiumBadge } = member;

  return (
    <li
      className="rounded-md border border-line-200 bg-bg-surface p-4"
      data-testid="public-member"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-sans text-[14px] font-semibold text-ink-900">
            {occupationLabel(occupation)}
          </span>
          {hasPremiumBadge ? <PremiumBadge /> : null}
        </div>
        <span className="shrink-0 font-sans text-[13px] text-ink-500">
          {ageBand}・{GENDER_LABELS[gender]}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <RatingRow label="また会いたい" value={ratings.again} />
        <RatingRow label="会話" value={ratings.talk} />
        <RatingRow label="マナー" value={ratings.manner} />
        <RatingRow label="総合" value={ratings.overall} />
      </dl>

      <p className="mt-2 font-sans text-[12px] text-ink-500">
        {ratings.count > 0 ? `${ratings.count}件の評価` : "評価はまだありません"}
      </p>
    </li>
  );
}

// 多軸評価の1行。星は色だけに頼らず数値も併記(§5 / §1.6)。0件は「—」。
function RatingRow({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  const has = value > 0;
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="font-sans text-[12px] text-ink-700">{label}</dt>
      <dd className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-[12px] leading-none tracking-tight">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={has && i < rounded ? "text-accent-500" : "text-line-200"}>
              ★
            </span>
          ))}
        </span>
        <span className="font-sans text-[12px] tabular-nums text-ink-500">
          {has ? value.toFixed(1) : "—"}
        </span>
      </dd>
    </div>
  );
}
