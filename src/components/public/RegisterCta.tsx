// src/components/public/RegisterCta.tsx — 登録誘導 CTA (S8 要望1 / s9 §6.2a・§7).
// 未ログインは「見える」が「応募はできない」。応募ボタンの代わりに、登録導線
// (U-00 ログイン /)へ誘導する。文言は事実ベース・煽らない(design-system §8 / §4.1
// 動詞+目的語)。ユーザー語彙は「応募」で統一(「予約」は会場のみ / s9 §6.2d)。
import { ButtonLink } from "@/components/ui/Button";

export function RegisterCta({
  label = "登録して参加する",
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
