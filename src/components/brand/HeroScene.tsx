// src/components/brand/HeroScene.tsx — LPの主役級ビジュアル (s11 §4.2 / #8).
//
// 「箱庭＝小さな庭で人が出会う夕暮れの情景」を 1枚絵(イラストレーション)として描く。
// garden-plot(線だけの俯瞰製図=安っぽさの原因)とは別物: 塗り＋グラデで奥行きのある絵にする。
//
// なぜインラインSVGか(殿の「画像欠落で枠だけ」恒久対策 / BrandMotif と同方針):
//   外部 <img> は配信失敗で枠だけ残る。インラインなら外部依存ゼロ・必ず描画。
//
// 奥行き4レイヤー(後→前 / s11 §4.2):
//   1. 空: 上 accent-100(#F6E7DC) → 下 bg-base(#FBF7F0) の縦グラデ(夕暮れの空気)。
//   2. 光の弧: accent-300(#E7B79A) の radialGradient で縁を溶かす。芯に accent-500(#C2703D)。
//   3. 庭の丘: 奥 secondary-100(#E7EDE6)・手前 secondary-500(#5E7A57) 低不透明。石灯籠1つ(灯り=安心)。
//   4. 人影: ink-700(#4A433C) 70〜85%の塗りシルエット6人(3対3で向かい合う)。顔は描かない。
//
// 色は全て design-system §7 のトークン由来(紫・青・原色なし)。ハードエッジ禁止(radialGradientで溶かす)。
// アニメ無し(prefers-reduced-motion を自動で満たす)。aria-hidden(意味は隣接テキストが担う)。
// SaaS/3D/クリップアート/写真の借り物感を出さない(§4.4 トーン規定)。

export function HeroScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 280"
      className={className}
      role="img"
      aria-label="夕暮れの小さな庭で、男女3人ずつが向かい合う情景のイラスト"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* 1. 空(縦グラデ): accent-100(#F6E7DC) → bg-base(#FBF7F0)。両端ともトークン。 */}
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6E7DC" />
          <stop offset="1" stopColor="#FBF7F0" />
        </linearGradient>
        {/* 2. 光の弧(放射・縁を溶かす): accent-300 → 透明 */}
        <radialGradient id="hs-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E7B79A" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#E7B79A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#E7B79A" stopOpacity="0" />
        </radialGradient>
        {/* 灯籠の灯り(ごく淡い放射) */}
        <radialGradient id="hs-lantern-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#C2703D" stopOpacity="0.55" />
          <stop offset="1" stopColor="#C2703D" stopOpacity="0" />
        </radialGradient>
        {/* 手前の丘(下へフェードして地に溶かす) */}
        <linearGradient id="hs-hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E7A57" stopOpacity="0.30" />
          <stop offset="1" stopColor="#5E7A57" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      {/* レイヤー1: 空 */}
      <rect x="0" y="0" width="360" height="280" fill="url(#hs-sky)" />

      {/* レイヤー2: 沈む陽の光(画面上部・やわらかい放射) */}
      <ellipse cx="208" cy="96" rx="150" ry="120" fill="url(#hs-glow)" />
      {/* 陽の芯(小さな暖色の点・ごく淡く) */}
      <circle cx="208" cy="92" r="20" fill="#E7B79A" opacity="0.5" />
      <circle cx="208" cy="92" r="9" fill="#C2703D" opacity="0.45" />

      {/* レイヤー3: 庭の丘(奥=淡い緑) — 不均一なベジェで製図に見せない */}
      <path
        d="M0 196 C 70 176, 150 188, 220 178 C 285 169, 330 182, 360 176 L360 280 L0 280 Z"
        fill="#E7EDE6"
        opacity="0.9"
      />
      {/* 手前の丘(下へフェード) */}
      <path
        d="M0 224 C 80 206, 150 222, 232 212 C 300 204, 336 218, 360 210 L360 280 L0 280 Z"
        fill="url(#hs-hill-front)"
      />

      {/* 石灯籠(灯り=安心) — 線画・trust-600。芯に accent の光点＋ごく淡い放射 */}
      <g transform="translate(300 150)" stroke="#8A6D3B" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 淡い灯り */}
        <circle cx="9" cy="20" r="22" fill="url(#hs-lantern-glow)" stroke="none" />
        <path d="M0 52h18" />
        <path d="M3.5 52v-6h11v6" />
        <rect x="1.5" y="28" width="15" height="13" rx="1.5" />
        <path d="M-2 28h22l-3.5-6.5H1.5L-2 28z" />
        <path d="M9 21.5v-4" />
        <circle cx="9" cy="14" r="2" />
        {/* 灯りの芯(差し色1点) */}
        <circle cx="9" cy="34.5" r="2.4" fill="#C2703D" stroke="none" />
      </g>

      {/* レイヤー4: 人の気配(6人=3対3で向かい合う・逆光シルエット・顔は描かない) */}
      {/* 左の3人(右を向く)。頭(円)＋肩(なだらかな曲線)の塗り。 */}
      <g fill="#4A433C">
        {/* 左・手前 */}
        <g opacity="0.82" transform="translate(96 188)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>
        {/* 左・中(やや奥) */}
        <g opacity="0.72" transform="translate(64 196) scale(0.9)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>
        {/* 左・奥 */}
        <g opacity="0.62" transform="translate(126 198) scale(0.84)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>

        {/* 右の3人(左を向く=向かい合う)。 */}
        {/* 右・手前 */}
        <g opacity="0.82" transform="translate(264 188)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>
        {/* 右・中(やや奥) */}
        <g opacity="0.72" transform="translate(296 196) scale(0.9)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>
        {/* 右・奥 */}
        <g opacity="0.62" transform="translate(234 198) scale(0.84)">
          <circle cx="0" cy="0" r="11" />
          <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
        </g>
      </g>
    </svg>
  );
}
