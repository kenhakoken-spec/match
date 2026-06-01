// /legal/tokushoho — 特定商取引法に基づく表記（決済があるため必要・本番前に法務確認必須）。
import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "../LegalLayout";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 — HAKO-NIWA（箱庭）",
};

// 事業者情報は正式決定後に確定する。現状はプレースホルダ（[ ]）。
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-line-100 py-2">
      <span className="font-sans text-[13px] text-ink-500">{label}</span>
      <span className="font-sans text-[14px] text-ink-700">{value}</span>
    </div>
  );
}

export default function TokushohoPage() {
  return (
    <LegalLayout title="特定商取引法に基づく表記" updatedAt="2026年6月">
      <p>本ページは特定商取引法第11条に基づく表記です。事業者情報は正式決定後に確定します（[ ] はプレースホルダ）。</p>

      <LegalSection heading="事業者">
        <div>
          <Row label="販売事業者" value="［事業者名を記載］" />
          <Row label="運営責任者" value="［氏名を記載］" />
          <Row label="所在地" value="［住所を記載。請求があれば遅滞なく開示します］" />
          <Row label="連絡先" value="［メールアドレス／電話番号を記載］" />
        </div>
      </LegalSection>

      <LegalSection heading="料金・対価">
        <div>
          <Row label="参加費（男性）" value="1回 ¥2,000（税込）。初回は無料。" />
          <Row label="参加費（女性）" value="無料" />
          <Row label="不成立時" value="課金されません" />
          <Row label="違約金" value="当日キャンセル・無断欠席が確定した場合 ¥5,000（税込）" />
        </div>
      </LegalSection>

      <LegalSection heading="支払方法・時期">
        <div>
          <Row label="支払方法" value="クレジットカード（決済代行会社を利用）" />
          <Row label="支払時期" value="会の成立時に課金（男性・有料回のみ）。違約金は確定時。" />
        </div>
      </LegalSection>

      <LegalSection heading="役務の提供時期">
        <p>会の成立後、運営者が会場を手配し、開催日時・会場を参加者へ通知します。役務（会への参加機会の提供）は通知された開催日に提供されます。</p>
      </LegalSection>

      <LegalSection heading="キャンセル・返金">
        <p>会の不成立の場合は課金されません。成立後のキャンセルの取り扱い・返金条件は［正式決定後に記載］。当日キャンセル・無断欠席には違約金が発生します。</p>
      </LegalSection>

      <LegalSection heading="動作環境">
        <p>LINE（LIFF）が動作するスマートフォン環境を推奨します。</p>
      </LegalSection>
    </LegalLayout>
  );
}
