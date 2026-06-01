// src/components/brand/LpSections.tsx — LP の編集的セクション。
// S10 (s10-redesign §4.4): 価値訴求を「素のリスト5点」から「カード4点(不安解消4軸)」に
// 作り替える。各カード=左に線アイコン(28px/accent) + 右に見出し+本文。平板な羅列から脱し、
// グラデ(hero-atmosphere)＋カードのリズムで「画像っぽい」上質さを出す。
// ご利用の流れ(5ステップ)は維持。開催(エリア/曜日/人数)の具体ブロックを新規追加(実在感)。
// 線アイコンは BrandMotif(箱庭モチーフ)と素のインライン線アイコンを併用(塗りつぶし絵文字は不可)。

import type { ReactNode } from "react";
import { BrandMotif } from "./BrandMotif";

// --- 小さな線アイコン(stroke 1.6 / currentColor / 28px)。SaaS塗りアイコンにしない。 ---
function GroupIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden className="h-7 w-7">
      <circle cx="9" cy="11" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="11" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 21c0-2.8 2.3-4.6 5.5-4.6s5.5 1.8 5.5 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 18.2c1-1.1 2.8-1.8 5-1.8 3.2 0 5.5 1.8 5.5 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden className="h-7 w-7">
      <path d="M14 3.5 23 7v6c0 5.2-3.6 9.2-9 11.5C8.6 22.2 5 18.2 5 13V7l9-3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m10.5 13.5 2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type ValueItem = { icon: ReactNode; title: string; body: string };

// 不安解消の価値4軸(s10 §4.3/§4.4 で文言確定)。ペルソナの不安に1:1で応答。
// ①1対1は気まずい ②写真詐欺/変な人 ③ドタキャン ④手間。色アイコンや絵文字は使わない。
export const LP_VALUES: ValueItem[] = [
  {
    icon: <GroupIcon />,
    title: "3対3だから、気まずくない",
    body: "1対1の重さがありません。はじめての人とも、場の力で自然に話せます。",
  },
  {
    icon: <ShieldIcon />,
    title: "全員、本人確認済み",
    body: "公的身分証で確認しています。安心して会えます。",
  },
  {
    icon: <BrandMotif name="lantern" className="h-7 w-7" />,
    title: "真剣な人だけ",
    body: "ドタキャンには罰金があります。当日、ちゃんと集まります。",
  },
  {
    icon: <BrandMotif name="gate" className="h-7 w-7" />,
    title: "やり取り不要・会場もおまかせ",
    body: "メッセージの往復も、お店探しも要りません。",
  },
];

// ご利用の流れ(5ステップ / s10 §4.3 = s9踏襲)。
export const LP_STEPS: string[] = [
  "LINEではじめる",
  "本人確認（公的身分証）",
  "プロフィール登録",
  "会を選んで応募",
  "6人で成立 → 会場をご連絡",
];

// 開催の具体(s10 §4.3)。曜日・時刻という事実で実在感を出す(空欄やぼかし表現にしない)。
// 将来は設定化を想定するが、現状は表示文言としてハードコード(運用と齟齬が出れば将軍が調整)。
const AREAS = ["恵比寿", "池袋", "銀座"] as const;

// セクション見出し(細い区切り線 + 任意のモチーフ脇飾り)。
function SectionHeading({ children, motif }: { children: ReactNode; motif?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line-200" aria-hidden />
      <h2 className="flex items-center gap-2 font-sans text-[13px] font-bold tracking-wide text-ink-700">
        {children}
        {motif ? <span className="text-line-200">{motif}</span> : null}
      </h2>
      <span className="h-px flex-1 bg-line-200" aria-hidden />
    </div>
  );
}

// 不安解消の価値4点(カードのリスト / s10 §4.4)。LoginScreen LP 本体で使用。
// カード=bg.surface + 1px line.200 + radius.md + shadow.sm + pad16。平板な羅列からの脱却。
export function ValueList() {
  return (
    <section className="mt-12">
      <SectionHeading>不安がいらない理由</SectionHeading>
      <ul className="mt-5 space-y-3">
        {LP_VALUES.map((v) => (
          <li
            key={v.title}
            className="flex items-start gap-3 rounded-md border border-line-200 bg-bg-surface p-4 shadow-sm"
          >
            <span className="mt-0.5 shrink-0 text-accent-500" aria-hidden>
              {v.icon}
            </span>
            <div className="min-w-0">
              <p className="font-sans text-[15px] font-semibold leading-snug text-ink-900">
                {v.title}
              </p>
              <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-500">
                {v.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ご利用の流れ(番号付き5ステップ)。
export function FlowList() {
  return (
    <section className="mt-10">
      <SectionHeading motif={<BrandMotif name="stepping-stones" className="h-4 w-8" />}>
        ご利用の流れ
      </SectionHeading>
      <ol className="mt-5 space-y-3">
        {LP_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-200 font-sans text-[13px] font-semibold tabular-nums text-ink-700"
            >
              {i + 1}
            </span>
            <span className="font-sans text-[14px] leading-snug text-ink-700">
              {label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// 開催について(s10 §4.3 具体ブロック)。エリア/開催曜日・時刻/人数の事実で実在感を出す。
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 font-sans text-[12px] tracking-wide text-ink-500 sm:w-16">
        {label}
      </dt>
      <dd className="font-sans text-[14px] leading-7 text-ink-700">{children}</dd>
    </div>
  );
}

export function ConcreteBlock() {
  return (
    <section className="mt-10">
      <SectionHeading>開催について</SectionHeading>
      <dl className="mt-5 space-y-4">
        <FactRow label="エリア">
          <span className="flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <span
                key={area}
                className="rounded-sm border border-line-200 bg-bg-sunken px-2 py-1 font-sans text-[13px] text-ink-700"
              >
                {area}
              </span>
            ))}
          </span>
        </FactRow>
        <FactRow label="開催">
          <span className="tabular-nums">水・金・土 19:30〜</span>
        </FactRow>
        <FactRow label="人数">男女3人ずつ・計6人</FactRow>
      </dl>
    </section>
  );
}
