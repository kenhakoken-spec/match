// Shared layout for the three bottom-tab screens (枠をさがす / 応募状況 / マイページ).
// The route group "(tabs)" keeps clean paths (/browse, /applications, /mypage)
// while sharing the persistent BottomTabs nav per design-system.md §4.4.

import { BottomTabs } from "@/components/BottomTabs";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <BottomTabs />
    </div>
  );
}
