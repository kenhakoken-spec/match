// src/components/public/RegisterCta.tsx — 登録誘導 CTA (S8 要望1).
// 未ログインは「見える」が「予約はできない」。応募ボタンの代わりに、登録導線
// (U-00 ログイン /)へ誘導する。文言は事実ベース・煽らない(design-system §8 / §4.1
// 動詞+目的語)。primary ボタン(ButtonLink)を流用し見た目を統一。
import { ButtonLink } from "@/components/ui/Button";

export function RegisterCta({
  label = "登録して参加",
  note,
}: {
  label?: string;
  note?: string;
}) {
  return (
    <div className="space-y-2">
      <ButtonLink href="/" data-testid="register-cta">
        {label}
      </ButtonLink>
      {note ? (
        <p className="text-center font-sans text-[12px] leading-relaxed text-ink-500">
          {note}
        </p>
      ) : null}
    </div>
  );
}
