// src/components/slots/PaymentNotice.tsx — 料金予告 (U-05 / U-06, design-system §4.7C).
// 男性: 「成立後に ¥N のお支払い」+ 初回無料を主役に(accent.100 地)。
// 女性: 「参加無料」。共通: 「不成立の場合、お支払いは発生しません」を必ず併記(§4.7C 必須)。
// S2 では実決済は行わない(予告のみ)。煽り・絵文字過多は禁止。🎁は祝意の例外1つまで(§8)。
import { yen } from "@/app/_lib/slots-ui";
import type { Gender } from "@/app/_lib/types";

export function PaymentNotice({
  gender,
  feeMale,
  firstTimeFree = true,
  heading = true,
}: {
  gender: Gender | null;
  feeMale: number;
  firstTimeFree?: boolean; // 初回無料の対象か(男性のみ意味を持つ)
  heading?: boolean;
}) {
  const female = gender === "female";

  return (
    <div className="space-y-2" aria-label="料金とお支払いについて">
      {heading ? (
        <h2 className="font-sans text-[13px] font-bold text-ink-700">
          料金（あなた={female ? "女性" : "男性"}）
        </h2>
      ) : null}

      {female ? (
        <div className="rounded-md border border-secondary-500/40 bg-secondary-100 p-3.5">
          <p className="font-sans text-[15px] font-semibold text-secondary-500">参加無料</p>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-700">
            女性は無料でご参加いただけます。
          </p>
        </div>
      ) : firstTimeFree ? (
        // 初回無料を主役に(金額より大きく) — design-system §4.7C 最重要。
        <div className="rounded-md border border-accent-300 bg-accent-100 p-3.5">
          <p className="font-sans text-[16px] font-bold text-accent-600">
            初回は無料です <span aria-hidden>🎁</span>
          </p>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-700">
            今回のお支払いはありません。次回以降は1回 {yen(feeMale)} です。
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-line-200 bg-bg-surface p-3.5">
          <p className="font-sans text-[15px] font-semibold text-ink-900 tabular-nums">
            {yen(feeMale)} / 回
          </p>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-700">
            成立後にお支払いいただきます。
          </p>
        </div>
      )}

      {/* 共通の必須注記: 「成立後に支払い」「不成立なら課金なし」(誤解防止)。 */}
      <p className="font-sans text-[12px] leading-relaxed text-ink-500">
        {female
          ? "成立後のご参加です。不成立の場合、費用は発生しません。"
          : "お支払いは成立後です。不成立の場合、お支払いは発生しません。"}
      </p>
    </div>
  );
}
