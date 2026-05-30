// U-02b 写真ガイド（任意）— wireframes.md U-02b.
// Calm editorial guidance. First impression matters more when there is no chat.

import { AppHeader } from "@/components/AppHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card, PageBody, StickyFooter } from "@/components/ui/Surface";

const GOOD = [
  { title: "明るい場所で", note: "自然光だと印象が伝わりやすい" },
  { title: "顔がはっきり", note: "正面〜やや斜めがおすすめ" },
  { title: "自然な表情", note: "気負わず、ふだんの雰囲気で" },
];

const AVOID = [
  { title: "加工しすぎ", note: "実際の印象と離れてしまう" },
  { title: "誰かわからない", note: "集合写真・遠すぎる構図は避ける" },
];

export default function PhotoGuidePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title="良い写真のコツ" backHref="/profile/new" serif />
      <PageBody className="space-y-7">
        <p className="font-sans text-[15px] leading-7 text-ink-700">
          第一印象は写真で決まります。やり取りが無いぶん、ここはていねいに。
        </p>

        <section className="space-y-3">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">
            おすすめ
          </h2>
          <div className="space-y-2">
            {GOOD.map((g) => (
              <Card key={g.title}>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary-100 text-[13px] text-secondary-500"
                  >
                    ✓
                  </span>
                  <div>
                    <p className="font-sans text-[14px] font-semibold text-ink-900">
                      {g.title}
                    </p>
                    <p className="font-sans text-[13px] leading-relaxed text-ink-500">
                      {g.note}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">
            避けたい
          </h2>
          <div className="space-y-2">
            {AVOID.map((a) => (
              <Card key={a.title} tone="sunken">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line-200 text-[13px] text-state-muted"
                  >
                    —
                  </span>
                  <div>
                    <p className="font-sans text-[14px] font-semibold text-ink-700">
                      {a.title}
                    </p>
                    <p className="font-sans text-[13px] leading-relaxed text-ink-500">
                      {a.note}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </PageBody>

      <StickyFooter>
        <ButtonLink href="/profile/new">写真を選ぶ</ButtonLink>
      </StickyFooter>
    </div>
  );
}
