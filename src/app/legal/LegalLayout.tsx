// 法務ページ共通レイアウト。AppHeader + 読みやすい本文コンテナ。
// design-system: 生成りオフホワイト地・明朝見出し×ゴシック本文・細ボーダー。
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title={title} backHref="/" serif />
      <main className="flex-1 px-5 pb-20 pt-4">
        <p className="mb-4 font-sans text-xs text-ink-500">最終更新: {updatedAt}</p>
        <div className="legal-body space-y-5 font-sans text-[14px] leading-relaxed text-ink-700">
          {children}
        </div>
        <p className="mt-10 rounded-md border border-line-200 bg-bg-sunken px-4 py-3 font-sans text-xs leading-relaxed text-ink-500">
          ※ 本ページは標準的な雛形です。<strong className="text-ink-700">本番公開前に弁護士等による法務確認が必須</strong>です。
          事業者情報・連絡先・金額・返金条件などは正式決定後に確定します。
        </p>
      </main>
    </div>
  );
}

// 法務本文の節見出し。
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-serif text-[17px] text-ink-900">{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
