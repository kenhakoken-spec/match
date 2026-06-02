"use client";

// src/components/slots/ViewToggle.tsx — リスト／カレンダー の2択トグル (s11 §3.2).
// 下部タブ(accent)とは別物。過剰装飾しない: bg-sunken トラックに選択中だけ surface+shadow-sm。
// role=tablist/tab + aria-selected。タップターゲット 40px+。既定はリスト(現行体験を変えない)。
// 色は既存トークンのみ(design-system §7)。

export type SlotView = "list" | "calendar";

export function ViewToggle({
  value,
  onChange,
}: {
  value: SlotView;
  onChange: (v: SlotView) => void;
}) {
  const tabs: { id: SlotView; label: string }[] = [
    { id: "list", label: "リスト" },
    { id: "calendar", label: "カレンダー" },
  ];
  return (
    <div
      role="tablist"
      aria-label="表示の切り替え"
      data-testid="view-toggle"
      className="inline-flex w-full max-w-[16rem] rounded-full bg-bg-sunken p-1"
    >
      {tabs.map((t) => {
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`view-toggle-${t.id}`}
            onClick={() => onChange(t.id)}
            className={[
              "flex h-9 flex-1 items-center justify-center rounded-full font-sans text-[13px] transition-colors",
              selected
                ? "bg-bg-surface font-semibold text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
