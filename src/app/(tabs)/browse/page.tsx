"use client";

// U-04 枠一覧 (ホーム / 下部タブ) — wireframes.md U-04, design-system §4.2/§4.7 / s9 §5・§6.2c。
// 開催枠を日時昇順でカード表示。各カード: エリア・日時 / 充足ドット(●確定 ○空き)+残数 /
// 参加条件チップ(20代限定 / 優良バッジ限定) / 料金(女性視点では非表示 / s9 §5)。条件不足の枠は
// 淡色+破線+事実理由(赤=danger にはしない / §8)。上部は段階別ステータスバナー(BrowseStatusBanner)。
//
// 一覧APIは eligibility を含めない(契約§2)ので、条件不足は getMe() のプロフィールから
// クライアント側ヒントとして淡色表示するに留める(確実な可否は U-05 詳細)。
// 料金出し分けは getMe() の Profile.gender を SlotCard に渡して行う(女性に¥2,000を見せない)。

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { SlotCard } from "@/components/slots/SlotCard";
import { SlotCalendar } from "@/components/slots/SlotCalendar";
import { ViewToggle, type SlotView } from "@/components/slots/ViewToggle";
import { BrowseStatusBanner } from "@/components/slots/BrowseStatusBanner";
import { fetchSlots, type SlotDTO } from "@/app/_lib/api-s2";
import { getMe } from "@/app/_lib/api";
import { listHint } from "@/app/_lib/slots-ui";
import { startMillis } from "@/app/_lib/datetime";
import type { MeResponse } from "@/app/_lib/types";

export default function BrowsePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [view, setView] = useState<SlotView>("list"); // 既定リスト(s11 §3.2)

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [slotList, meRes] = await Promise.all([fetchSlots(), getMe()]);
      setSlots(slotList);
      setMe(meRes);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // load is stable for our purposes (only setState deps); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewer = useMemo(() => {
    if (!me?.profile) return null;
    // MeResponse はバッジ情報を持たない。一覧ヒントでは badge=false 扱い(確実な判定はU-05)。
    return { gender: me.profile.gender, age: me.profile.age, hasBadgePremium: false };
  }, [me]);

  const sorted = useMemo(
    () => [...slots].sort((a, b) => startMillis(a.datetimeStart) - startMillis(b.datetimeStart)),
    [slots],
  );

  // 一覧・カレンダーで同じカードを使う(#2 日付主役カード / s11 §3.6)。
  const renderCard = (slot: SlotDTO) => (
    <SlotCard
      slot={slot}
      hint={viewer ? listHint(slot, viewer) : undefined}
      viewerGender={me?.profile?.gender ?? null}
    />
  );

  return (
    <>
      <AppHeader title="枠をさがす" />
      {loading ? (
        <LoadingState data-testid="loading" />
      ) : error ? (
        <main className="mx-auto w-full max-w-[480px] flex-1 px-5 pt-4 md:max-w-3xl md:px-8 lg:max-w-5xl">
          <ErrorState onRetry={load} />
        </main>
      ) : (
        <main className="mx-auto w-full max-w-[480px] flex-1 px-5 pb-10 pt-4 md:max-w-3xl md:px-8 lg:max-w-5xl">
          {/* 段階別ステータスバナー (U-04 / s9 §6.2c)。責めない・案内のトーン・形状併記。 */}
          <BrowseStatusBanner me={me} />

          {sorted.length === 0 ? (
            <EmptyState
              glyph="◇"
              title="枠がありません"
              body="恵比寿 / 池袋 / 銀座で、男女あわせて6名の会を順次公開します。別の条件でもお試しください。"
              data-testid="empty"
            />
          ) : (
            <>
              {/* リスト／カレンダー トグル(#3 / s11 §3.2)。取得ゼロ時は出さない。 */}
              <div className="mb-4 flex justify-center">
                <ViewToggle value={view} onChange={setView} />
              </div>

              {view === "list" ? (
                /* base 1列(現行不変)。md+ 2列 / lg 3列のグリッド。行内でカード高さを揃える(s11視覚§4.1)。 */
                <ul
                  className="grid grid-cols-1 gap-3 md:auto-rows-fr md:grid-cols-2 lg:grid-cols-3"
                  data-testid="slot-list"
                >
                  {sorted.map((slot) => (
                    <li key={slot.id} className="md:h-full">
                      {renderCard(slot)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div data-testid="slot-calendar">
                  <SlotCalendar
                    slots={sorted}
                    isoOf={(s) => s.datetimeStart}
                    keyOf={(s) => s.id}
                    renderCard={renderCard}
                    emptyMonthBody="翌月以降に順次公開します。"
                  />
                </div>
              )}
            </>
          )}
        </main>
      )}
    </>
  );
}
