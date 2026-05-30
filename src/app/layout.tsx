import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "rendez — 東京の合コンマッチング",
  description:
    "日時とエリアを選んで、男女3人ずつ6人で集まる。東京・恵比寿/池袋/銀座。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
