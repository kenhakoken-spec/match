// src/components/brand/LpSections.tsx — LP の編集的セクション(価値5点 / ご利用の流れ)。
// s9 §3.1/§3.2: 量産LP(巨大ヒーロー+3カラム+キラキラ)を避け、価値は「縦に積む編集的
// リスト」。各項目=小さな線アイコン + 1行見出し + 1行本文。流れは番号付き5ステップ。
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
function NoChatIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden className="h-7 w-7">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h13A2.5 2.5 0 0 1 23 7.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V18H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9 9 10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export type ValueItem = { icon: ReactNode; title: string; body: string };

// 価値訴求5点(s9 §3.2 で文言確定)。色アイコンや絵文字は使わない。
export const LP_VALUES: ValueItem[] = [
  { icon: <GroupIcon />, title: "3対3だから安心", body: "1対1の重さがありません。" },
  { icon: <ShieldIcon />, title: "本人確認で、会う前に安心", body: "全員が本人確認を済ませます。" },
  { icon: <NoChatIcon />, title: "アプリ内のやり取りなし", body: "会うことに集中できます。" },
  {
    icon: <BrandMotif name="gate" className="h-7 w-7" />,
    title: "会場は運営が手配",
    body: "お店探しは要りません。",
  },
  {
    icon: <BrandMotif name="lantern" className="h-7 w-7" />,
    title: "評価と優良バッジで質を担保",
    body: "会った後の評価で場を整えます。",
  },
];

// ご利用の流れ(5ステップ / s9 §3.2)。
export const LP_STEPS: string[] = [
  "LINEではじめる",
  "本人確認（公的身分証）",
  "プロフィール登録",
  "会を選んで応募",
  "6人で成立 → 会場をご連絡",
];

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

// 価値5点(縦リスト・編集的)。LoginScreen LP 本体で使用。
export function ValueList() {
  return (
    <section className="mt-10">
      <SectionHeading>箱庭が選ばれる理由</SectionHeading>
      <ul className="mt-5 space-y-4">
        {LP_VALUES.map((v) => (
          <li key={v.title} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-accent-500" aria-hidden>
              {v.icon}
            </span>
            <div className="min-w-0">
              <p className="font-sans text-[15px] font-semibold leading-snug text-ink-900">
                {v.title}
              </p>
              <p className="mt-0.5 font-sans text-[13px] leading-relaxed text-ink-500">
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
    <section className="mt-9">
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
