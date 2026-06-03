// src/components/profile/ProfileIcon.tsx — プリセットアイコンの実描画 (S12 #8).
//
// 写真アップロードを廃し、ユーザーは ICON_IDS(10種) から1つ選ぶ(顔写真詐欺の土俵に
// 乗らない / 06_s12_strategy §2)。本ファイルは icons.ts の id → 線画SVG の対応のみを
// 持つ(backend は画像実体を持たない)。
//
// design-system §4.6 準拠:
//  - すべて線画(stroke)・単色 currentColor・塗りはほぼ使わない(点描の鼻/目程度)。
//  - 太さ 1.6px。絵文字は使わない(§0: 絵文字の多用を避ける)。塗りつぶし装飾なし。
//  - 既定は装飾(aria-hidden)。ラベルは選択UI側のテキストで担保する。
//
// 色: ルートに text-* を当てれば currentColor として全ストロークに反映される。
//     アバター枠(rounded-full)に収めて表示する(§4.4: アバター=radius/full)。

import type { SVGProps } from "react";
import {
  DEFAULT_ICON_KEY,
  ICON_IDS,
  ICON_LABELS,
  isValidIconKey,
  type IconKey,
} from "@/lib/icons";

// 各アイコンの viewBox は 0 0 48 48 に統一(グリッド表示の揃えを優先)。
const VB = "0 0 48 48";
const SW = 1.6;

// id → 線画(stroke)。中立な動植物/自然モチーフ。顔は最小限(点で目)・性別を匂わせない。
const SHAPES: Record<IconKey, React.ReactNode> = {
  // きつね: 三角の輪郭 + とがった耳 + 鼻先。
  fox: (
    <>
      <path d="M12 16l5-7 7 4 7-4 5 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16c0 9 5 16 12 16s12-7 12-16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 32l-3-4h6l-3 4z" strokeLinejoin="round" />
      <circle cx="19" cy="22" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="29" cy="22" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  // ねこ: 丸い顔 + 三角の耳 + ひげ。
  cat: (
    <>
      <path d="M15 13l3 6M33 13l-3 6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="26" r="11" />
      <path d="M10 25h5M33 25h5M11 29h4M33 29h4" strokeLinecap="round" opacity="0.7" />
      <circle cx="20" cy="25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="28" cy="25" r="0.9" fill="currentColor" stroke="none" />
      <path d="M23 29l1 1 1-1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // くま: 大きな丸顔 + 丸い耳。
  bear: (
    <>
      <circle cx="15" cy="16" r="4.5" />
      <circle cx="33" cy="16" r="4.5" />
      <circle cx="24" cy="27" r="12" />
      <circle cx="20" cy="25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="28" cy="25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="24" cy="29" r="1.6" />
    </>
  ),
  // うさぎ: 丸顔 + 長い耳2本。
  rabbit: (
    <>
      <path d="M19 16c-1-7-3-9-4-9s-2 4 0 10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 16c1-7 3-9 4-9s2 4 0 10" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="27" r="11" />
      <circle cx="20" cy="26" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="28" cy="26" r="0.9" fill="currentColor" stroke="none" />
      <path d="M23 30l1 1 1-1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // ぱんだ: 丸顔 + 丸耳 + 目の周りの楕円(輪郭線のみ)。
  panda: (
    <>
      <circle cx="14" cy="15" r="4" />
      <circle cx="34" cy="15" r="4" />
      <circle cx="24" cy="27" r="12" />
      <ellipse cx="19" cy="25" rx="2.6" ry="3.2" />
      <ellipse cx="29" cy="25" rx="2.6" ry="3.2" />
      <circle cx="24" cy="30" r="1.4" />
    </>
  ),
  // ぺんぎん: 卵形の体 + くちばし + ひれ。
  penguin: (
    <>
      <path d="M24 9c-7 0-10 6-10 16 0 9 4 14 10 14s10-5 10-14C34 15 31 9 24 9z" strokeLinejoin="round" />
      <path d="M20 18c1 8 1 13 0 18M28 18c-1 8-1 13 0 18" opacity="0.7" strokeLinecap="round" />
      <path d="M22 22l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 26l-3 4M34 26l3 4" strokeLinecap="round" />
    </>
  ),
  // はっぱ: 1枚の葉 + 葉脈。
  leaf: (
    <>
      <path d="M14 34C12 20 22 12 35 12c0 13-8 23-21 22z" strokeLinejoin="round" />
      <path d="M16 32C22 26 28 20 34 14" strokeLinecap="round" opacity="0.7" />
      <path d="M24 27l5-1M21 30l4-1" strokeLinecap="round" opacity="0.6" />
    </>
  ),
  // はな: 5枚の花びら + 中心。
  flower: (
    <>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="24" cy="13" rx="3.4" ry="6" transform={`rotate(${deg} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="4" />
    </>
  ),
  // ほし: 5角の星(輪郭線のみ)。
  star: (
    <>
      <path
        d="M24 9l4.6 9.3 10.2 1.5-7.4 7.2 1.7 10.2L24 32.6l-9.1 4.8 1.7-10.2-7.4-7.2 10.2-1.5z"
        strokeLinejoin="round"
      />
    </>
  ),
  // つき: 三日月。
  moon: (
    <>
      <path
        d="M31 9a16 16 0 100 30 13 13 0 010-30z"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="18" r="1" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="19" cy="27" r="0.9" fill="currentColor" stroke="none" opacity="0.6" />
    </>
  ),
};

/** id を有効な IconKey に正規化(未知/null は既定アイコン)。 */
export function normalizeIconKey(key: string | null | undefined): IconKey {
  return isValidIconKey(key) ? key : DEFAULT_ICON_KEY;
}

/**
 * プリセットアイコンの線画SVG。`iconKey` 不正/未指定は既定(fox)に落ちる。
 * 既定は装飾(aria-hidden)。意味を持たせたい場合のみ title を渡す。
 */
export function ProfileIcon({
  iconKey,
  className,
  title,
}: {
  iconKey: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const key = normalizeIconKey(iconKey);
  const a11y: SVGProps<SVGSVGElement> = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true, focusable: false };
  return (
    <svg
      viewBox={VB}
      fill="none"
      stroke="currentColor"
      strokeWidth={SW}
      className={className}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {SHAPES[key]}
    </svg>
  );
}

/**
 * アバター枠つきのアイコン表示(マイページ等の従来 photo 表示の置換)。
 * 円形(radius/full)に収め、線画を中央に置く。サイズは className(枠側)で調整。
 */
export function ProfileIconAvatar({
  iconKey,
  className,
  iconClassName,
}: {
  iconKey: string | null | undefined;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      aria-hidden
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-200 bg-bg-sunken text-accent-600",
        className ?? "h-16 w-16",
      ].join(" ")}
    >
      <ProfileIcon iconKey={iconKey} className={iconClassName ?? "h-3/5 w-3/5"} />
    </div>
  );
}

/**
 * アイコン選択グリッド(プロフィール登録/編集 #8)。
 * 10種を等間隔のグリッドで並べ、選択中は border+✓(色のみに頼らない / §1.6)。
 * 各ボタンは aria-pressed + aria-label(ラベル文字)でスクリーンリーダ対応。
 */
export function ProfileIconPicker({
  value,
  onChange,
}: {
  value: IconKey | null;
  onChange: (key: IconKey) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="アイコンを選ぶ"
      data-testid="icon-picker"
      className="grid grid-cols-5 gap-2.5"
    >
      {ICON_IDS.map((id) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ICON_LABELS[id]}
            data-testid={`icon-option-${id}`}
            data-selected={selected ? "true" : "false"}
            onClick={() => onChange(id)}
            className={[
              "relative flex aspect-square items-center justify-center rounded-md border bg-bg-surface transition-colors",
              selected
                ? "border-accent-500 text-accent-600 ring-2 ring-accent-500/40"
                : "border-line-200 text-ink-700 hover:bg-bg-sunken/60",
            ].join(" ")}
          >
            <ProfileIcon iconKey={id} className="h-3/5 w-3/5" />
            {selected ? (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-[10px] leading-none text-white"
              >
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
