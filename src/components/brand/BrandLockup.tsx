// src/components/brand/BrandLockup.tsx — HAKO-NIWA(箱庭) のロゴロックアップ。
// 箱庭マーク(SVG) + 主名称 HAKO-NIWA(明朝) + 副名称「箱庭」とエリア。
// LoginScreen / ComingSoon の双子LPで共有する(s9 §3.2 / §3.3)。
// 旧 ◇ プレースホルダの置換(s9 §2.4)。

import { BrandMotif } from "./BrandMotif";

const ACCENT = "#C2703D"; // accent-500: 植栽の差し色(1点のみ)

export function BrandLockup() {
  return (
    <div>
      {/* 箱庭マーク — 光沢SaaSロゴにしない。線画・currentColor。 */}
      <div
        className="mb-6 flex h-11 w-11 items-center justify-center rounded-md border border-line-200 text-line-200"
        aria-hidden
      >
        <BrandMotif name="mark" accent={ACCENT} className="h-7 w-7" />
      </div>
      <p className="font-serif text-[22px] font-semibold tracking-tight text-ink-900">
        HAKO-NIWA
      </p>
      <p className="mt-1 font-sans text-[13px] tracking-wide text-ink-500">
        箱庭 ・ 東京 恵比寿 / 池袋 / 銀座
      </p>
    </div>
  );
}
