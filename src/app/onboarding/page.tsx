"use client";

// U-01 オンボーディング + 規約同意 (STEP0) — wireframes.md U-01.
// 3 slides (3対3 / チャット無し / 本人確認あり). Final slide carries the terms
// consent checkbox; 「本人確認へ」 is enabled ONLY when consent is ON.
// No birthdate here — age is verified via ID (U-12 / U-02) per wireframe note.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxRow } from "@/components/ui/Consent";

type Slide = {
  kicker: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    kicker: "グループだから安心",
    title: "男女3対3で会う。",
    body: "1対1の重さはありません。はじめての人とも、場の力で自然に話せます。",
  },
  {
    kicker: "会うことに集中",
    title: "アプリ内のやり取りはありません。",
    body: "メッセージのやりとりは不要。当日、会場で話しましょう。",
  },
  {
    kicker: "はじめる前に",
    title: "安心のため、本人確認をお願いします。",
    body: "公的身分証で確認します。年齢確認（18歳以上）も兼ねています。",
  },
];

function Dots({ index }: { index: number }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5"
      role="img"
      aria-label={`${index + 1} / ${SLIDES.length}`}
    >
      {SLIDES.map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={[
            "h-1.5 rounded-full transition-all",
            i === index ? "w-5 bg-accent-500" : "w-1.5 bg-line-200",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-10 pt-10">
      <div className="flex justify-end">
        {!isLast ? (
          <button
            type="button"
            onClick={() => router.push("/identity")}
            className="min-h-[44px] px-2 font-sans text-[13px] text-ink-500 hover:text-ink-700"
          >
            スキップ
          </button>
        ) : (
          <span className="h-11" />
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {/* Editorial image placeholder — restrained, not a flat SaaS hero. */}
        <div
          aria-hidden
          className="mx-auto mb-10 flex aspect-[4/3] w-full max-w-[18rem] items-center justify-center rounded-lg border border-line-200 bg-bg-sunken text-ink-300"
        >
          <span className="text-3xl">◇</span>
        </div>

        <p className="font-sans text-[13px] font-semibold tracking-wide text-accent-600">
          {slide.kicker}
        </p>
        <h1 className="mt-2 font-serif text-[24px] leading-[1.4] text-ink-900">
          {slide.title}
        </h1>
        <p className="mt-3 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
          {slide.body}
        </p>

        {isLast ? (
          <div className="mt-8">
            <CheckboxRow checked={consent} onChange={setConsent} data-testid="consent">
              <a
                href="/legal/terms"
                className="text-accent-500 underline"
                onClick={(e) => e.stopPropagation()}
              >
                利用規約
              </a>
              ・
              <a
                href="/legal/privacy"
                className="text-accent-500 underline"
                onClick={(e) => e.stopPropagation()}
              >
                プライバシーポリシー
              </a>
              に同意します
            </CheckboxRow>
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <Dots index={index} />
        {isLast ? (
          <Button
            data-testid="onboarding-next"
            disabled={!consent}
            onClick={() => router.push("/identity")}
          >
            本人確認へ
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)}>次へ</Button>
        )}
      </div>
    </main>
  );
}
