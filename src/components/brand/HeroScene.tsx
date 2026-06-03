// src/components/brand/HeroScene.tsx — LPの主役級ビジュアル (s11視覚強化 §6 / #8).
//
// 「箱庭＝小さな庭で人が出会う夕暮れの情景」を 1枚絵(イラストレーション)として描く。
// garden-plot(線だけの俯瞰製図=安っぽさの原因)とは別物: 塗り＋グラデで奥行きのある絵にする。
//
// なぜインラインSVGか(殿の「画像欠落で枠だけ」恒久対策 / BrandMotif と同方針):
//   外部 <img> は配信失敗で枠だけ残る。インラインなら外部依存ゼロ・必ず描画。
//   将来 raster(自前撮影/許諾済み写真)に差し替える場合も、この単体SVGを <img> に置換できる(§6.5)。
//
// S11視覚強化(§6.2): viewBox を 280→300 に縦伸ばし、preserveAspectRatio を slice→meet にして
// 「絵全体が見える1枚絵」にする。奥行きを 4層→6層に拡張し、夕日(主光源)を強め、人影の
// コントラストと存在感を上げて「3対3=6人が向かい合う」を明確にする。
//
// 奥行き6レイヤー(後→前):
//   1. 空     : 上 accent-100(#F6E7DC) → 下 bg-base(#FBF7F0) の縦グラデ(夕暮れの空気)。
//   2. 沈む陽 : accent-300(#E7B79A) の放射(主光源・芯を強化)＋ 芯に accent-500(#C2703D) の三重円。
//   3. 遠景稜線: secondary-500(#5E7A57) を ごく淡く(空気遠近法)。最奥の丘/木立。
//   4. 庭の丘 : 奥 secondary-100(#E7EDE6)・手前 secondary-500(#5E7A57) 低不透明グラデ。
//   5. 前景   : 敷石(楕円)・左右の低木 を低彩度・低不透明で(奥行きの「手前」＝人影の足元を支える)。
//   6. 人影   : ink-900/ink-700 の塗りシルエット6人(3対3で向かい合う)。手前ほど濃く・大きく。顔は描かない。
//
// 色は全て design-system §7 のトークン由来の hex のみ(紫・青・原色なし)。ハードエッジ禁止
// (放射グラデ/低不透明で縁を溶かす)。アニメ無し(prefers-reduced-motion を自動で満たす)。
// 主役の絵なので aria-hidden ではなく role=img+aria-label(意味はこのラベル＋隣接テキストが担う)。
// SaaS/3D/クリップアート/写真の借り物感を出さない(§6.4 トーン規定)。

export function HeroScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 300"
      className={className}
      role="img"
      aria-label="夕暮れの小さな庭で、男女あわせて6名が向かい合う情景のイラスト"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* 1. 空(縦グラデ): accent-100(#F6E7DC) → bg-base(#FBF7F0)。上空の焼けは②の放射で重ねて表現
            (新色を足さず深みを出す / s11視覚§6.2①の推奨)。stop は4つだが hex は2トークンのみ。 */}
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6E7DC" />
          <stop offset="0.42" stopColor="#F6E7DC" />
          <stop offset="0.72" stopColor="#FBF7F0" />
          <stop offset="1" stopColor="#FBF7F0" />
        </linearGradient>
        {/* 2. 沈む陽の光(放射・主光源を強化): accent-300 中心を濃く → 透明。縁は放射で必ず溶かす。 */}
        <radialGradient id="hs-glow" cx="0.5" cy="0.42" r="0.6">
          <stop offset="0" stopColor="#E7B79A" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#E7B79A" stopOpacity="0.45" />
          <stop offset="1" stopColor="#E7B79A" stopOpacity="0" />
        </radialGradient>
        {/* 手前の丘(下へフェードして地に溶かす) */}
        <linearGradient id="hs-hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E7A57" stopOpacity="0.38" />
          <stop offset="1" stopColor="#5E7A57" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* レイヤー1: 空 */}
      <rect x="0" y="0" width="360" height="300" fill="url(#hs-sky)" />

      {/* レイヤー2: 沈む陽(主光源)。放射で空に焼けを重ね、芯を三重円で「夕日がちゃんとある」状態に。 */}
      <ellipse cx="210" cy="104" rx="170" ry="140" fill="url(#hs-glow)" />
      {/* 陽の芯(三重: 外=淡い暖色, 中=accent-500, コア=濃く小さく)。ハードエッジを避けるため不透明は控えめ。 */}
      <circle cx="210" cy="98" r="26" fill="#E7B79A" opacity="0.65" />
      <circle cx="210" cy="96" r="13" fill="#C2703D" opacity="0.55" />
      <circle cx="210" cy="95" r="6" fill="#C2703D" opacity="0.75" />

      {/* レイヤー3: 遠景の稜線(空気遠近法・ごく淡い緑)。空と庭の間に最奥のシルエットを1枚。 */}
      <path
        d="M0 188 C 90 178, 180 184, 270 176 C 320 172, 345 178, 360 174 L360 210 L0 210 Z"
        fill="#5E7A57"
        opacity="0.12"
      />

      {/* レイヤー4: 庭の丘(奥=淡い緑) — 不均一なベジェで製図に見せない。奥はしっかり(opacity 1.0)。 */}
      <path
        d="M0 198 C 70 178, 150 190, 220 180 C 285 171, 330 184, 360 178 L360 300 L0 300 Z"
        fill="#E7EDE6"
      />
      {/* 手前の丘(下へフェード) */}
      <path
        d="M0 224 C 80 206, 150 222, 232 212 C 300 204, 336 218, 360 210 L360 300 L0 300 Z"
        fill="url(#hs-hill-front)"
      />

      {/* レイヤー5: 前景の添え(奥行きの「手前」)。敷石(楕円)＋左右の低木を低彩度・低不透明で「気配」に留める。 */}
      {/* 敷石(stepping-stones を絵に溶かす) */}
      <ellipse cx="150" cy="268" rx="26" ry="7" fill="#5E7A57" opacity="0.16" />
      <ellipse cx="205" cy="276" rx="22" ry="6" fill="#5E7A57" opacity="0.14" />
      <ellipse cx="120" cy="280" rx="18" ry="5" fill="#5E7A57" opacity="0.12" />
      {/* 左下の低木(やわらかい塊＋淡いハイライト) */}
      <path
        d="M-6 300 C -6 276, 14 268, 30 272 C 44 276, 50 290, 48 300 Z"
        fill="#5E7A57"
        opacity="0.20"
      />
      <path
        d="M6 286 C 12 278, 24 278, 30 284 C 24 286, 14 288, 6 286 Z"
        fill="#E7EDE6"
        opacity="0.5"
      />
      {/* 右下の低木(小さく) */}
      <path
        d="M328 300 C 326 282, 340 274, 352 278 C 362 281, 366 292, 366 300 Z"
        fill="#5E7A57"
        opacity="0.18"
      />

      {/* レイヤー6: 人の気配(6人=3対3で向かい合う・逆光シルエット・顔は描かない)。
          手前ほど濃く(ink-900)＋大きく、奥ほど淡く(ink-700)＝逆光の階調で奥行きを出す。
          足元を手前の丘ライン(~y212)付近に沈めて接地感を出す。各人を僅かにばらつかせ機械的等間隔を避ける。 */}
      {/* 左の3人(右を向く) */}
      {/* 左・手前(最も濃く・大きく) */}
      <g fill="#2B2622" opacity="0.88" transform="translate(98 196)">
        <circle cx="0" cy="0" r="12" />
        <path d="M-19 46 C -19 23, -11 14, 0 14 C 11 14, 19 23, 19 46 Z" />
      </g>
      {/* 左・中 */}
      <g fill="#4A433C" opacity="0.80" transform="translate(64 202) scale(0.9)">
        <circle cx="0" cy="0" r="11" />
        <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
      </g>
      {/* 左・奥(最も淡く) */}
      <g fill="#4A433C" opacity="0.70" transform="translate(130 205) scale(0.82)">
        <circle cx="0" cy="0" r="11" />
        <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
      </g>

      {/* 右の3人(左を向く=向かい合う) */}
      {/* 右・手前(最も濃く・大きく) */}
      <g fill="#2B2622" opacity="0.88" transform="translate(262 196)">
        <circle cx="0" cy="0" r="12" />
        <path d="M-19 46 C -19 23, -11 14, 0 14 C 11 14, 19 23, 19 46 Z" />
      </g>
      {/* 右・中 */}
      <g fill="#4A433C" opacity="0.80" transform="translate(298 203) scale(0.9)">
        <circle cx="0" cy="0" r="11" />
        <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
      </g>
      {/* 右・奥 */}
      <g fill="#4A433C" opacity="0.70" transform="translate(232 205) scale(0.82)">
        <circle cx="0" cy="0" r="11" />
        <path d="M-17 44 C -17 22, -10 14, 0 14 C 10 14, 17 22, 17 44 Z" />
      </g>
    </svg>
  );
}
