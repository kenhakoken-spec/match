// src/components/brand/BrandMotif.tsx — 箱庭(HAKO-NIWA)の最小モチーフSVG群。
//
// design-system §4.6 / s9 §2: すべて線画(stroke)・単色 currentColor・aria-hidden の
// 「沈黙の調度」。塗りはほぼ使わない。SaaS/3D イラスト禁止。
//
// なぜインラインSVGか(殿の「画像欠落で枠だけ残る」恒久対策):
//   - <img src="/brand/*.svg"> は currentColor を継承できず、配信失敗で「枠だけ」事故が起きる。
//   - インラインなら外部依存ゼロ・必ず描画・色はテキスト色(currentColor)とaccentに追従。
//   - public/brand/*.svg にも同一図形を配置(OGP/将来差し替え/ドキュメント用の独立アセット)。
//
// 色の当て方: ルートに text-* で currentColor(主線) を、style={--brand-accent} で
// 差し色(植栽の実/飛び石1枚)を指定。accent は 1 SVG につき最大1点(s9 §2.1)。

import type { CSSProperties, SVGProps } from "react";

export type MotifName =
  | "mark"
  | "garden-plot"
  | "lantern"
  | "gate"
  | "stepping-stones";

type Props = {
  name: MotifName;
  className?: string;
  // 差し色(accent)を当てる箇所のCSS変数。未指定なら currentColor に落ちる。
  accent?: string;
  title?: string; // 付ける場合のみ role=img + <title>。既定は装飾(aria-hidden)。
};

const ACCENT_VAR = "--brand-accent" as const;

const VIEWBOX: Record<MotifName, string> = {
  mark: "0 0 44 44",
  "garden-plot": "0 0 320 200",
  lantern: "0 0 64 64",
  gate: "0 0 64 64",
  "stepping-stones": "0 0 96 48",
};

export function BrandMotif({ name, className, accent, title }: Props) {
  const style = accent
    ? ({ [ACCENT_VAR]: accent } as CSSProperties)
    : undefined;
  // 既定は装飾(aria-hidden)。title 指定時のみ role=img + aria-label にする。
  const a11y: SVGProps<SVGSVGElement> = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true, focusable: false };

  return (
    <svg
      viewBox={VIEWBOX[name]}
      fill="none"
      className={className}
      style={style}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {SHAPES[name]}
    </svg>
  );
}

// 差し色は var(--brand-accent, currentColor): accent 指定が無ければ主線色に溶ける。
const ACCENT_STROKE = "var(--brand-accent, currentColor)";

const SHAPES: Record<MotifName, React.ReactNode> = {
  // 箱庭マーク: 角丸の枠(箱)+区画線+植栽の点描。ロゴ位置の ◇ 置換。
  mark: (
    <>
      <rect x="6.5" y="6.5" width="31" height="31" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="6.5" y1="26" x2="37.5" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <line x1="22" y1="6.5" x2="22" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <path d="M14 21v-5.5M11.6 17.4 14 15.6l2.4 1.8" stroke={ACCENT_STROKE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 21v-4.5M28 18.2 30 16.6l2 1.6" stroke={ACCENT_STROKE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.5" cy="31.5" r="1.1" fill="currentColor" />
      <circle cx="22" cy="31.5" r="1.1" fill="currentColor" />
      <circle cx="28.5" cy="31.5" r="1.1" fill="currentColor" />
    </>
  ),
  // 小さな庭の俯瞰: 区画・飛び石・植え込み + ○6つ(3対3=6人の暗喩、顔は描かない)。
  "garden-plot": (
    <>
      <rect x="18.5" y="22.5" width="283" height="155" rx="8" stroke="currentColor" strokeWidth="1.4" />
      <line x1="160" y1="22.5" x2="160" y2="177.5" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <line x1="18.5" y1="100" x2="301.5" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <ellipse cx="92" cy="148" rx="13" ry="6.5" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
      <ellipse cx="128" cy="132" rx="10.5" ry="5.5" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
      <ellipse cx="160" cy="118" rx="8.5" ry="4.5" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
      <path d="M232 78V52M222 62l10-9 10 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M262 78V58M254 65l8-7 8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="62" cy="56" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="92" cy="56" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="122" cy="56" r="6" stroke={ACCENT_STROKE} strokeWidth="1.6" />
      <circle cx="206" cy="148" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="236" cy="148" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="266" cy="148" r="6" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  // 石灯籠 — 「安心・灯り」。
  lantern: (
    <>
      <path d="M22 54h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M27 54v-6h10v6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="24" y="28" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="32" cy="35" r="3.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M20 28h24l-4-7H24l-4 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M32 21v-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="32" cy="14" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M30 48h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // 枝折戸の門 — 「入口・はじまり」。
  gate: (
    <>
      <path d="M14 52V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M50 52V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 20h44" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 26h38" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
      <path d="M20 50V30h11v20" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M20 37h11M20 44h11M25.5 30v20" stroke="currentColor" strokeWidth="1" opacity="0.75" />
      <path d="M14 52h36" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  // 飛び石3つ — 「流れ・進み方」。手前ほど大きく。
  "stepping-stones": (
    <>
      <ellipse cx="20" cy="34" rx="14" ry="7" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="52" cy="24" rx="11" ry="5.5" stroke={ACCENT_STROKE} strokeWidth="1.5" />
      <ellipse cx="80" cy="16" rx="8.5" ry="4.5" stroke="currentColor" strokeWidth="1.3" opacity="0.85" />
    </>
  ),
};
