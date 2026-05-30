// ComingSoon — 「リリースをお待ちください」待機画面の本体（01_s8_spec.md 要望3）。
//
// design-system §0/§8 準拠:
//   - 温かく編集的（雑誌の特集ページに置けるか）。生成りの地＋インクの文字。
//   - 紫グラデ・ネオン・原色ブルーなし。絵文字の散りばめなし。煽りコピーなし。
//   - 見出しは明朝（serif）、本文はゴシック（sans）。余白は広め。スマホ縦。
//   - アクセント（テラコッタ）は控えめに1色だけ。
//
// 純presentational（hooks/インタラクションなし）なので Server Component として
// /coming-soon ページと ReleaseGate の両方から再利用できる。通知希望の入口は
// 「準備中」の静かなプレースホルダに留める（偽の動作はさせない＝誠実）。

const AREAS = ["恵比寿", "池袋", "銀座"] as const;

export function ComingSoon() {
  return (
    <main
      data-testid="coming-soon"
      className="flex min-h-[100dvh] flex-col justify-between px-6 pb-10 pt-16"
    >
      <div className="pt-8">
        {/* 編集的マーク — U-00 と同じ控えめなダイヤ。光沢SaaSロゴにしない。 */}
        <div
          aria-hidden
          className="mb-6 flex h-11 w-11 items-center justify-center rounded-md border border-line-200 text-accent-500"
        >
          <span className="text-lg leading-none">◇</span>
        </div>

        <p className="font-serif text-[22px] font-semibold tracking-tight text-ink-900">
          rendez
        </p>
        <p className="mt-1 font-sans text-[13px] tracking-wide text-ink-500">
          東京・恵比寿 / 池袋 / 銀座
        </p>

        <h1 className="mt-10 font-serif text-[28px] leading-[1.35] text-ink-900">
          近日、はじまります。
        </h1>
        <p className="mt-4 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
          rendez は、男女3人ずつ・計6人で会う、新しい合コンです。
          いまは公開の準備をしています。もうしばらくお待ちください。
        </p>

        {/* サービス概要 — 事実ベースの3点。煽らない。 */}
        <dl className="mt-8 space-y-4 border-t border-line-100 pt-6">
          <div>
            <dt className="font-sans text-[12px] tracking-wide text-ink-500">
              会い方
            </dt>
            <dd className="mt-1 font-sans text-[15px] leading-7 text-ink-700">
              3対3、計6人で集まります。会場はこちらで手配します。
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
              公開
            </dt>
            <dd className="mt-1 font-sans text-[15px] leading-7 text-ink-700">
              東京での開催に向けて、近日公開予定です。
            </dd>
          </div>
        </dl>
      </div>

      {/* 通知希望の入口プレースホルダ。まだ動かないことを誠実に伝える。 */}
      <div className="space-y-3">
        <div className="rounded-md border border-line-200 bg-bg-surface p-4">
          <p className="font-sans text-[14px] font-semibold text-ink-900">
            公開のお知らせを希望する
          </p>
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
