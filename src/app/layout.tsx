import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HAKO-NIWA（箱庭）— みんなが出会える場所",
  description:
    "HAKO-NIWA（箱庭）は、安心できる場でゆっくり出会うためのサービス。日時とエリアを選んで、男女3人ずつ6人で集まる。東京・恵比寿/池袋/銀座。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // S11(qa NEW-5): maximumScale=1 はピンチズームを禁じ WCAG 1.4.4 に抵触するため撤去。
  // 弱視ユーザーが拡大できるようにする。
  themeColor: "#FBF7F0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
