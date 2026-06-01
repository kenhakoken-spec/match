// /coming-soon — 「リリースをお待ちください」画面（01_s8_spec.md 要望3）。
//
// この URL は RELEASE_MODE に関わらず常に待機画面を表示する（直接の着地点・
// 全体ゲートの誘導先の両方を兼ねる）。画面本体は ComingSoon に集約し、
// ReleaseGate（全体ゲート）と同じものを再利用する。Server Component。

import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "HAKO-NIWA（箱庭）— 近日公開予定",
  description:
    "HAKO-NIWA（箱庭）は、男女3人ずつ・計6人で会う、安心できる出会いの場です。東京・恵比寿 / 池袋 / 銀座で近日公開予定。",
};

export default function ComingSoonPage() {
  return <ComingSoon />;
}
