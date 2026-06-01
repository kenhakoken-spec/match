// /legal/privacy — プライバシーポリシー（標準雛形・本番前に法務確認必須）。
import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "../LegalLayout";

export const metadata: Metadata = {
  title: "プライバシーポリシー — HAKO-NIWA（箱庭）",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="プライバシーポリシー" updatedAt="2026年6月">
      <p>
        HAKO-NIWA（箱庭）（以下「本サービス」）は、利用者の個人情報を適切に取り扱います。本ポリシーは、取得する情報・利用目的・管理方法を定めます。
      </p>

      <LegalSection heading="1. 取得する情報">
        <p>本サービスは、次の情報を取得します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>LINEアカウント情報（識別子・表示名）</li>
          <li>プロフィール情報（性別・生年月日・希望エリア・職種・写真・自己紹介）</li>
          <li>本人確認のための公的身分証の画像（審査目的・後述のとおり審査後に削除）</li>
          <li>会への応募・参加・評価の履歴</li>
          <li>決済に関する情報（決済代行会社が処理。カード番号等は本サービスでは保持しません）</li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. 利用目的">
        <p>本人確認・年齢確認、会のマッチングと運営、料金の決済、品質維持（評価・バッジ）、不正防止、法令対応、サービス改善のために利用します。</p>
      </LegalSection>

      <LegalSection heading="3. 身分証画像の取り扱い（重要）">
        <p>本人確認のために提出された身分証の画像は、審査の目的にのみ利用し、<strong className="text-ink-900">審査の完了後に速やかに削除</strong>します。第三者へ提供しません。</p>
      </LegalSection>

      <LegalSection heading="4. 第三者提供">
        <p>法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。決済・本人確認・通知のため、必要な範囲で外部サービス（決済代行・LINE等）に委託することがあります。</p>
      </LegalSection>

      <LegalSection heading="5. 安全管理">
        <p>個人情報は暗号化等の適切な安全管理措置のもとで取り扱います。アクセス権限を最小化し、機微情報はマッチングに不要な経路から参照しません。</p>
      </LegalSection>

      <LegalSection heading="6. 他の利用者への表示">
        <p>未登録の方が閲覧できる会の情報には、参加者の氏名・写真・連絡先は表示されません。年代・職種・評価などの匿名サマリのみを表示します。</p>
      </LegalSection>

      <LegalSection heading="7. 開示・訂正・削除の請求">
        <p>利用者は、自己の個人情報の開示・訂正・利用停止・削除を請求できます。お問い合わせ窓口（特定商取引法に基づく表記に記載）までご連絡ください。</p>
      </LegalSection>

      <LegalSection heading="8. 改定">
        <p>本ポリシーは、必要に応じて改定されることがあります。重要な変更は本サービス上で通知します。</p>
      </LegalSection>
    </LegalLayout>
  );
}
