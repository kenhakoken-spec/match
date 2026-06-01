"use client";

// 公開 枠詳細 (S8 要望1: 参加者の「すごさ」を匿名サマリで見せ、登録を促す)。未ログイン可。
// GET /api/public/slots/[id]（認証不要）。参加者は PublicMemberDTO(職種/年代band/多軸評価
// /優良バッジ のみ、氏名/写真/lineUserId 無し)。応募はできず「登録して参加」へ誘導(→ /)。
// design-system §0/§8(編集的・煽らない) / §4.7D・E(評価・バッジ) 準拠。

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { ButtonLink } from "@/components/ui/Button";
import { FillDots } from "@/components/slots/FillDots";
import { SlotConditionChips } from "@/components/slots/SlotConditionChips";
import { fetchPublicSlotDetail } from "@/app/_lib/api-public";
import { areaLabel, yen } from "@/app/_lib/slots-ui";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { PublicMemberCard } from "@/components/public/PublicMemberCard";
import { RegisterCta } from "@/components/public/RegisterCta";
import type { PublicSlotDetailDTO } from "@/lib/types";

export default function ExploreDetailPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [detail, setDetail] = useState<PublicSlotDetailDTO | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    setNotFound(false);
    try {
      const res = await fetchPublicSlotDetail(params.id);
      if (res.notFound) {
        setNotFound(true);
      } else {
        setDetail(res.detail);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="会の詳細" backHref="/explore" />
        <LoadingState />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="会の詳細" backHref="/explore" />
        <main className="flex-1 px-5 pt-4">
          <EmptyState
            glyph="◇"
            title="この会は見つかりませんでした"
            body="公開が終了したか、URLが正しくない可能性があります。"
            action={
              <ButtonLink href="/explore" variant="secondary">
                一覧に戻る
              </ButtonLink>
            }
          />
        </main>
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="会の詳細" backHref="/explore" />
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      </div>
    );
  }

  const memberCount = detail.members.length;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title="会の詳細" backHref="/explore" />

      <main className="flex-1 px-5 pb-28 pt-4">
        {/* 見出し: エリア・日時・人数・条件チップ */}
        <header>
          <h1 className="font-serif text-[22px] text-ink-900">{areaLabel(detail.area)}エリア</h1>
          <p className="mt-1 font-sans text-[15px] tabular-nums text-ink-700">
            {formatDateShort(detail.datetimeStart)} {formatTime(detail.datetimeStart)}〜
          </p>
          <p className="mt-0.5 font-sans text-[13px] text-ink-500">3 対 3（男女各3名）</p>
          <div className="mt-2.5">
            <SlotConditionChips conditions={detail.conditions} />
          </div>
        </header>

        {/* 募集状況 */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">募集状況</h2>
          <div className="mt-2 rounded-md border border-line-200 bg-bg-surface p-4">
            <FillDots
              filled={detail.filled}
              capacityPerGender={detail.capacityPerGender}
              variant="detail"
            />
          </div>
        </section>

        {/* 料金(公開時点では男性料金の事実のみ。女性無料は登録後の詳細で案内) */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">参加費</h2>
          <p className="mt-2 font-sans text-[14px] text-ink-700">
            男性 <span className="font-semibold tabular-nums">{yen(detail.feeMale)}</span>
            <span className="ml-2 text-ink-500">（女性は無料です）</span>
          </p>
        </section>

        {/* 参加予定メンバー(匿名サマリ＝すごさ)。氏名・写真は登録後に表示。 */}
        <section className="mt-6">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">参加予定のメンバー</h2>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-500">
            {memberCount > 0
              ? "お名前と写真は登録後に表示されます。"
              : "まだ参加予定のメンバーはいません。"}
          </p>
          {memberCount > 0 ? (
            <ul className="mt-3 space-y-3">
              {detail.members.map((m, i) => (
                <PublicMemberCard key={i} member={m} />
              ))}
            </ul>
          ) : null}
        </section>
      </main>

      {/* 予約はできない＝登録導線(固定フッタ)。 */}
      <div className="sticky bottom-0 space-y-2 border-t border-line-200 bg-bg-surface px-5 py-3 shadow-md">
        <RegisterCta note="この会に参加するには登録が必要です。" />
      </div>
    </div>
  );
}
