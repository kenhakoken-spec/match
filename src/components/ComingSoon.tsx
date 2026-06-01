// ComingSoon — 「リリースをお待ちください」待機画面の本体（s9 §3.3 / 01_s8_spec 要望3）。
//
// LoginScreen と双子の HAKO-NIWA(箱庭) LP。違いは CTA が「準備中」で、価値/流れは要点に圧縮。
// design-system §0/§8 準拠: 温かく編集的・生成りの地+インクの文字・紫グラデやネオン無し・
// 絵文字の散りばめ無し・煽りコピー無し。見出しは明朝、本文はゴシック、余白は広め。
//
// 純presentational(hooks/インタラクション無し)なので Server Component として
// /coming-soon ページと ReleaseGate の両方から再利用できる。通知希望の入口は
// 「準備中」の静かなプレースホルダに留める(偽の動作はさせない＝誠実)。画像が無くても
// 添景SVGとタイポで成立する(枠だけ残る事故ゼロ / s9 §3.4)。

import { BrandLockup } from "@/components/brand/BrandLockup";
import { BrandMotif } from "@/components/brand/BrandMotif";

const AREAS = ["恵比寿", "池袋", "銀座"] as const;

export function ComingSoon() {
  return (
    <main
      data-testid="coming-soon"
      className="flex min-h-[100dvh] flex-col justify-between px-6 pb-10 pt-16"
    >
      <div className="pt-8">
        <BrandLockup />

        {/* ヒーロー: タグライン → 主見出し(明朝) → 箱庭の添景SVG */}
        <p className="mt-10 font-sans text-[18px] font-bold leading-snug text-accent-600">
          みんなが出会える場所
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-[1.35] text-ink-900">
          近日、はじまります。
        </h1>

        <div className="mt-7 flex justify-center">
          <BrandMotif
            name="garden-plot"
            accent="#C2703D"
            className="h-auto w-full max-w-[20rem] text-line-200"
          />
        </div>

        <p className="mt-7 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
          HAKO-NIWA（箱庭）は、男女3人ずつ・計6人で会う、安心できる出会いの場です。
          いまは公開の準備をしています。もうしばらくお待ちください。
        </p>

        {/* このサービスについて — 事実ベースの4点(安心行を追加して内容を立てる)。煽らない。 */}
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
      </div>

      {/* 通知希望の入口プレースホルダ。まだ動かないことを誠実に伝える(動かないものを動くように見せない)。 */}
      <div className="space-y-3">
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
