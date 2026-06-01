"use client";

// U-01 オンボーディング + 規約同意 — wireframes U-01 / s9 §4 (4ステップ化)。
//
// 4ステップ: [0]性別を選ぶ(新規・必須・スキップ不可) → [1]3対3で安心 → [2]やり取りなし
//   → [3]本人確認 + 規約同意(同意ONで「本人確認へ進む」活性)。ドットは4つ。
// 殿要件(s9 §1/§4): 料金が性別で変わるため最初に性別を取得し、sessionStorage に一時保持。
//   Profile 作成時(/profile/new)に初期選択として引き継ぐ(最終的に Profile.gender が正)。
// 画像が無くても各スライドは箱庭の添景SVG＋編集的レイアウトで成立(◇空箱を廃止 / s9 §3/§4.3)。
// スキップ(説明スライドのみ)は「あとで」→/explore(撮影前でも会は見られる / s9 §4.5)。

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxRow } from "@/components/ui/Consent";
import { BrandMotif, type MotifName } from "@/components/brand/BrandMotif";
import { GENDER_LABELS, type Gender } from "@/app/_lib/types";
import { setOnboardingGender } from "@/app/_lib/onboarding-gender";

type Slide = {
  kicker: string;
  title: string;
  body: string;
  motif: MotifName;
};

// 説明スライド(性別の後の3枚)。現行コピーを踏襲しつつ s9 §4.3 に合わせ微修正。
const SLIDES: Slide[] = [
  {
    kicker: "グループだから安心",
    title: "男女3対3で会う。",
    body: "1対1の重さはありません。はじめての人とも、場の力で自然に話せます。",
    motif: "leaf",
  },
  {
    kicker: "会うことに集中",
    title: "アプリ内のやり取りはありません。",
    body: "メッセージのやりとりは不要です。当日、会場で話しましょう。",
    motif: "lantern",
  },
  {
    kicker: "はじめる前に",
    title: "安心のため、本人確認をお願いします。",
    body: "公的身分証で確認します。年齢確認（18歳以上）も兼ねています。",
    motif: "gate",
  },
];

// 全体のステップ数 = 性別(1) + 説明スライド数。
const TOTAL = SLIDES.length + 1;

function Dots({ index }: { index: number }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5"
      role="img"
      aria-label={`${index + 1} / ${TOTAL}`}
    >
      {Array.from({ length: TOTAL }, (_, i) => (
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
  const [index, setIndex] = useState(0); // 0 = 性別ステップ, 1..N = SLIDES[index-1]
  const [gender, setGender] = useState<Gender | null>(null);
  const [consent, setConsent] = useState(false);

  const isGenderStep = index === 0;
  const isLast = index === TOTAL - 1;
  const slide = isGenderStep ? null : SLIDES[index - 1];

  function chooseGender(g: Gender) {
    setGender(g);
    setOnboardingGender(g); // プロフィール登録へ引き継ぐ一時値。
  }

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-10 pt-10">
      {/* スキップは説明スライド(1〜N-1)のみ。性別と最終ステップでは出さない。 */}
      <div className="flex justify-end">
        {!isGenderStep && !isLast ? (
          <button
            type="button"
            onClick={() => router.push("/explore")}
            className="min-h-[44px] px-2 font-sans text-[13px] text-ink-500 hover:text-ink-700"
          >
            あとで
          </button>
        ) : (
          <span className="h-11" />
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {isGenderStep ? (
          <GenderStep gender={gender} onChoose={chooseGender} />
        ) : (
          <>
            {/* S10: aspect-[4/3] の大箱(garden-plot)を廃止し、意味の通る小モチーフ(48px)を
                見出し上に置く編集的レイアウトへ。タイポと余白で見せる(s10 §7.1/§7.3)。 */}
            <BrandMotif
              name={slide!.motif}
              accent="#C2703D"
              className="mb-6 h-12 w-12 text-line-200"
            />

            <p className="font-sans text-[13px] font-semibold tracking-[0.06em] text-accent-600">
              {slide!.kicker}
            </p>
            <h1 className="mt-2 font-serif text-[26px] leading-[1.4] text-ink-900">
              {slide!.title}
            </h1>
            <p className="mt-3 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
              {slide!.body}
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
          </>
        )}
      </div>

      <div className="space-y-5">
        <Dots index={index} />
        {isGenderStep ? (
          <Button
            data-testid="onboarding-gender-next"
            disabled={gender === null}
            onClick={() => setIndex(1)}
          >
            次へ進む
          </Button>
        ) : isLast ? (
          <Button
            data-testid="onboarding-next"
            disabled={!consent}
            onClick={() => router.push("/identity")}
          >
            本人確認へ進む
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)}>次へ</Button>
        )}
      </div>
    </main>
  );
}

// 性別ステップ(s9 §4.2): 大きめの2択カード。色のみに依存しない(枠 + ✓ を併用)。理由を1行明示。
function GenderStep({
  gender,
  onChoose,
}: {
  gender: Gender | null;
  onChoose: (g: Gender) => void;
}) {
  return (
    <>
      {/* S10: garden-plot の大箱を廃止。小モチーフ leaf(48px) + kicker を横並びに(s10 §7.2)。 */}
      <div className="flex items-center gap-3">
        <BrandMotif name="leaf" accent="#C2703D" className="h-12 w-12 shrink-0 text-line-200" />
        <p className="font-sans text-[13px] font-semibold tracking-[0.06em] text-accent-600">
          はじめに
        </p>
      </div>
      <h1 className="mt-3 font-serif text-[26px] leading-[1.4] text-ink-900">
        あなたについて教えてください
      </h1>
      <p className="mt-3 font-sans text-[15px] leading-7 text-ink-700">
        料金や表示の最適化に使います。
      </p>

      <div
        className="mt-6 grid grid-cols-2 gap-3"
        role="radiogroup"
        aria-label="性別"
        data-testid="onboarding-gender"
      >
        {(["female", "male"] as const).map((g) => {
          const selected = gender === g;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`gender-${g}`}
              onClick={() => onChoose(g)}
              className={[
                "flex min-h-[60px] items-center justify-center gap-2 rounded-md border px-4 font-sans text-[15px] font-semibold transition-colors",
                selected
                  ? "border-accent-500 bg-accent-100 text-ink-900"
                  : "border-line-200 bg-bg-surface text-ink-700 hover:bg-bg-sunken/60",
              ].join(" ")}
            >
              {/* 色のみに依存しない: 選択時はチェック形状を併記(§1.6 / §4.7)。 */}
              <span
                aria-hidden
                className={[
                  "text-[15px] leading-none",
                  selected ? "text-accent-600" : "text-transparent",
                ].join(" ")}
              >
                ✓
              </span>
              {GENDER_LABELS[g]}
            </button>
          );
        })}
      </div>

      <p className="mt-3 font-sans text-xs leading-relaxed text-ink-500">
        ※ 男女3対3で会うため、性別をうかがいます。後から変更できます。
      </p>
    </>
  );
}
