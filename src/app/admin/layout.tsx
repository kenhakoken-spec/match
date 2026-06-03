// Admin shell (PC 想定 / design-system §7: admin は別途簡素に).
// 左ナビ + 主コンテンツの 2 ペイン。admin は広いビューポート前提なので app-shell の
// 480px 制約は使わず full-width にする(layout.tsx の app-shell は全体に掛かるが、
// admin 配下は自前で横いっぱいに広げる)。トーンは本体と同じ温かいニュートラル。

import Link from "next/link";
import { redirect } from "next/navigation";
import { optionalUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/slots", label: "枠管理", active: true },
  { href: "/admin/slots", label: "本人審査" },
  { href: "/admin/matches", label: "成立確認" },
  { href: "/admin/matches", label: "会場入力" },
  { href: "/admin/venues", label: "会場候補" },
  { href: "/admin/badges", label: "バッジ付与状況" },
  { href: "/admin/slots", label: "ユーザー管理" },
];

// S11(qa中): admin 配下を **サーバ側で認可ガード**。未ログイン/非adminは
// 管理UIを一切描画せずトップへリダイレクト（従来はサブページがクライアント描画で
// 管理画面の構造が露出していた。書き込みAPIは401で保護済みだがUIごと隠す）。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await optionalUser();
  if (!user || user.role !== "admin") {
    redirect("/");
  }
  return (
    <div className="min-h-[100dvh] w-full bg-bg-base lg:grid lg:grid-cols-[220px_1fr]">
      {/* 左ナビ */}
      <aside className="border-b border-line-200 bg-bg-surface lg:min-h-[100dvh] lg:border-b-0 lg:border-r">
        <div className="px-5 py-4">
          <p className="font-serif text-[18px] text-ink-900">運営 admin</p>
          <p className="font-sans text-[12px] text-ink-500">HAKO-NIWA（箱庭）</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map((item, i) => (
            <Link
              key={`${item.label}-${i}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={[
                "shrink-0 rounded-sm px-3 py-2 font-sans text-[13px] transition-colors",
                item.active
                  ? "bg-accent-100 font-semibold text-accent-600"
                  : "text-ink-700 hover:bg-bg-sunken",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* 主コンテンツ */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
