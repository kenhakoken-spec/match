// /catalog — 画面カタログ（レビュー用）。全画面へワンタップで飛べるリンク集。
// 殿の要望(#7): 本人確認後・会成立後・評価 等のデータ依存画面も含め、実機で全画面を巡れるように。
// データ依存ページはクライアントFALLBACK or ?demo= で状態を再現する。
// noindex（検索除外）。本番でも到達可だが運用上はレビュー専用。
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "画面カタログ（レビュー用）— HAKO-NIWA",
  robots: { index: false, follow: false },
};

type Item = { path: string; label: string; note?: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "入口・LP・オンボーディング",
    items: [
      { path: "/", label: "LP（LINEではじめる）" },
      { path: "/coming-soon", label: "近日公開（リリース待ち）" },
      { path: "/onboarding", label: "オンボーディング（性別→説明）" },
    ],
  },
  {
    title: "本人確認",
    items: [
      { path: "/identity", label: "本人確認 提出（表面のみ）" },
      { path: "/identity/status", label: "本人確認 ステータス（未提出/確認中）" },
      { path: "/identity/status?demo=pending", label: "└ 確認中（demo）" },
      { path: "/identity/status?demo=approved", label: "└ 承認済（demo）" },
      { path: "/identity/status?demo=rejected", label: "└ 却下（demo）" },
    ],
  },
  {
    title: "プロフィール",
    items: [
      { path: "/profile/new", label: "プロフィール登録" },
      { path: "/profile/edit", label: "プロフィール編集" },
      { path: "/profile/photo-guide", label: "写真ガイド" },
    ],
  },
  {
    title: "会（公開プレビュー・未ログインでも見える）",
    items: [
      { path: "/explore", label: "公開 枠一覧（プレビュー）" },
      { path: "/explore/pub_ebisu_01", label: "公開 枠詳細（プレビュー）" },
    ],
  },
  {
    title: "会（ログイン後）",
    items: [
      { path: "/browse", label: "ホーム 枠一覧（応募）" },
      { path: "/slots/seed-slot-normal", label: "枠詳細（応募可否）" },
      { path: "/applications", label: "マイ応募状況" },
      { path: "/payment/seed-slot-normal", label: "決済（男性・¥2,000）" },
    ],
  },
  {
    title: "成立・評価・マイページ",
    items: [
      { path: "/matches/seed-match-pending", label: "成立詳細（会場・メンバー）" },
      { path: "/ratings", label: "評価の一覧" },
      { path: "/ratings/seed-slot-matched", label: "相互評価（3軸＋来なかった報告）" },
      { path: "/mypage", label: "マイページ（評価・バッジ）" },
    ],
  },
  {
    title: "運営 admin（要 admin ログイン）",
    items: [
      { path: "/admin", label: "ダッシュボード" },
      { path: "/admin/slots", label: "枠作成・管理" },
      { path: "/admin/matches", label: "成立確認" },
      { path: "/admin/venues", label: "会場候補" },
      { path: "/admin/badges", label: "バッジ付与状況" },
    ],
  },
  {
    title: "法務",
    items: [
      { path: "/legal/terms", label: "利用規約" },
      { path: "/legal/privacy", label: "プライバシーポリシー" },
      { path: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
    ],
  },
];

export default function CatalogPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="font-serif text-[22px] text-ink-900">画面カタログ</h1>
      <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-500">
        レビュー用。全画面へワンタップで移動できます。データが必要な画面はサンプル表示で確認できます
        （実データは実際の操作・admin ログインで変わります）。
      </p>

      <div className="mt-6 space-y-7">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="font-sans text-[13px] font-bold text-accent-600">{g.title}</h2>
            <ul className="mt-2 divide-y divide-line-100 rounded-md border border-line-200 bg-bg-surface">
              {g.items.map((it) => (
                <li key={it.path}>
                  <Link
                    href={it.path}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-sunken"
                  >
                    <span className="font-sans text-[14px] text-ink-700">{it.label}</span>
                    <span className="font-sans text-[11px] tabular-nums text-ink-300">{it.path}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 font-sans text-xs leading-relaxed text-ink-500">
        ※ admin 画面はログインが必要です。成立・評価などはサンプル ID
        で開きます（実データが無い場合はFALLBACK表示）。本ページは検索除外（noindex）。
      </p>
    </main>
  );
}
