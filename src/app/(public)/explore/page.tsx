"use client";

// 公開 枠一覧 (S8 要望1: 「まず見える→制限→登録を促す」)。未ログインでも閲覧可。
// GET /api/public/slots（認証不要・PIIなし）。各カードから /explore/[id] へ。
// 予約はできない設計を体現するため、フッタに「登録して参加」CTA を常設(→ U-00 /)。
// design-system §0/§8 準拠(編集的・煽らない)。

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { fetchPublicSlots } from "@/app/_lib/api-public";
import { startMillis } from "@/app/_lib/datetime";
import { PublicSlotCard } from "@/components/public/PublicSlotCard";
import { SlotCalendar } from "@/components/slots/SlotCalendar";
import { ViewToggle, type SlotView } from "@/components/slots/ViewToggle";
import { RegisterCta } from "@/components/public/RegisterCta";
import type { PublicSlotDTO } from "@/lib/types";

export default function ExplorePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slots, setSlots] = useState<PublicSlotDTO[]>([]);
  const [view, setView] = useState<SlotView>("list"); // 既定リスト(s11 §3.2)

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setSlots(await fetchPublicSlots());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...slots].sort(
    (a, b) => startMillis(a.datetimeStart) - startMillis(b.datetimeStart),
  );

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title="開催予定の会" serif />
      {loading ? (
        <LoadingState data-testid="loading" />
      ) : error ? (
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      ) : (
        <main className="flex-1 px-5 pb-28 pt-4">
          <p className="mb-5 font-sans text-[14px] leading-relaxed text-ink-700">
            登録しなくても、どんな会が開かれているかご覧いただけます。参加には登録が必要です。
          </p>

          {sorted.length === 0 ? (
            <EmptyState
              glyph="◇"
              title="公開中の会はありません"
              body="恵比寿 / 池袋 / 銀座で、男女3対3の会を順次公開します。"
              data-testid="empty"
            />
          ) : (
            <>
              {/* リスト／カレンダー トグル(#3 / s11 §3.2)。取得ゼロ時は出さない。 */}
              <div className="mb-4 flex justify-center">
                <ViewToggle value={view} onChange={setView} />
              </div>

              {view === "list" ? (
                <ul className="space-y-3" data-testid="public-slot-list">
                  {sorted.map((slot) => (
                    <li key={slot.id}>
                      <PublicSlotCard slot={slot} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div data-testid="slot-calendar">
                  <SlotCalendar
                    slots={sorted}
                    isoOf={(s) => s.datetimeStart}
                    keyOf={(s) => s.id}
                    renderCard={(slot) => <PublicSlotCard slot={slot} />}
                    emptyMonthBody="翌月以降に順次公開します。"
                  />
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* 予約はできない＝登録導線を常設(固定フッタ)。 */}
      <div className="sticky bottom-0 space-y-2 border-t border-line-200 bg-bg-surface px-5 py-3 shadow-md">
        <RegisterCta note="気になる会があれば、登録すると応募できます。" />
      </div>
    </div>
  );
}
