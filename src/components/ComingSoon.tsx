// ComingSoon — 「リリースをお待ちください」待機画面の本体（s10-redesign §6 / s9 §3.3 / 01_s8_spec 要望3）。
//
// LoginScreen と双子の HAKO-NIWA(箱庭) LP。違いは CTA が「準備中」で、不安解消は要点に圧縮。
// S10: garden-plot(俯瞰の製図)を撤去し、ヒーローを LoginScreen と同じ CSSアトモスフィア
// (hero-atmosphere / globals.css §9)に。説明文は白面カードに載せグラデ上でも可読性を確保。
// design-system §0/§8 準拠: 温かく編集的・生成りの地+インクの文字・紫グラデやネオン無し・
// 絵文字の散りばめ無し・煽りコピー無し。見出しは明朝、本文はゴシック、余白は広め。
//
// 純presentational(hooks/インタラクション無し)なので Server Component として
// /coming-soon ページと ReleaseGate の両方から再利用できる。通知希望の入口は
// 「準備中」の静かなプレースホルダに留める(偽の動作はさせない＝誠実)。アトモスフィアは
// CSSだけで成立するため presentational のまま実装できる。

import { BrandLockup } from "@/components/brand/BrandLockup";
import { BrandMotif } from "@/components/brand/BrandMotif";

const AREAS = ["恵比寿", "池袋", "銀座"] as const;

export function ComingSoon() {
  return (
    <main
      data-testid="coming-soon"
      className="flex min-h-[100dvh] flex-col px-6 pb-10 pt-16"
    >
      <BrandLockup />

      {/* ヒーロー: CSSアトモスフィア背景 + タグライン → 主見出し(明朝) → 説明白面カード → 添え(leaf) */}
      <section className="relative isolate mt-10 overflow-hidden">
        <div className="hero-atmosphere" aria-hidden />

        <div className="relative pb-2 pt-2">
          <p className="font-sans text-[13px] font-bold tracking-[0.08em] text-accent-600">
            みんなが出会える場所
          </p>
          <h1 className="mt-3 font-serif text-[32px] leading-[1.3] tracking-[-0.01em] text-ink-900">
            近日、はじまります。
          </h1>

          <div className="mt-5 rounded-md border border-line-200 bg-bg-surface/70 p-4 shadow-sm backdrop-blur-[2px]">
            <p className="max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
              HAKO-NIWA（箱庭）は、男女3人ずつ・計6人で会う、安心できる出会いの場です。いまは公開の準備をしています。もうしばらくお待ちください。
            </p>
          </div>

          {/* 任意の添え1枚(s10 §2.2/§6.1)。賑やかにしない・1枚まで。 */}
          <div className="mt-6 flex justify-center">
            <BrandMotif name="leaf" accent="#C2703D" className="h-12 w-12 text-line-200" />
          </div>
        </div>
      </section>

      {/* このサービスについて — 事実ベースの4点(S9のまま維持・事実が立っている)。煽らない。 */}
      <dl className="mt-8 space-y-4 border-t border-line-100 pt-6">
        <div>
          <dt className="font-sans text-[12px] tracking-wide text-ink-500">
            会い方
          </dt>
          <dd className="mt-1 font-sans text-[15px] leading-7 text-ink-700">
            3対3、計6人で会います。会場はこちらで手配します。
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[12px] tracking-wide text-ink-500">
            エリア
          </dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <span
                key={area}
                className="rounded-sm border border-line-200 bg-bg-sunken px-2 py-1 font-sans text-[13px] text-ink-700"
              >
                {area}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[12px] tracking-wide text-ink-500">
            安心
          </dt>
          <dd className="mt-1 font-sans text-[15px] leading-7 text-ink-700">
            本人確認・評価で、場を整えます。
          </dd>
        </div>
        <div>
          <dt className="font-sans text-[12px] tracking-wide text-ink-500">
            公開
          </dt>
          <dd className="mt-1 font-sans text-[15px] leading-7 text-ink-700">
            東京での開催に向けて、近日公開予定です。
          </dd>
        </div>
      </dl>

      {/* 通知希望の入口プレースホルダ(S9のまま維持)。まだ動かないことを誠実に伝える。 */}
      <div className="mt-8 space-y-3">
        <div className="rounded-md border border-line-200 bg-bg-surface p-4">
          <div className="flex items-center gap-2">
            <BrandMotif name="gate" className="h-5 w-5 text-ink-500" />
            <p className="font-sans text-[14px] font-semibold text-ink-900">
              公開のお知らせを希望する
            </p>
          </div>
          <p className="mt-1 font-sans text-[13px] leading-6 text-ink-500">
            LINE での友だち追加によるお知らせを準備中です。公開まで今しばらくお待ちください。
          </p>
          <span
            aria-disabled
            className="mt-3 inline-flex h-10 cursor-default items-center rounded-md bg-bg-sunken px-4 font-sans text-[13px] font-semibold text-ink-300"
          >
            準備中
          </span>
        </div>
        <p className="text-center font-sans text-xs leading-relaxed text-ink-500">
          公開をお待ちください。
        </p>
      </div>
    </main>
  );
}
