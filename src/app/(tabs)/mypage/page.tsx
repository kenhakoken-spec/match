"use client";

// U-10 マイページ (S1 scope) — wireframes.md U-10.
// Profile summary + 本人確認バッジ + 評価サマリ + edit link, plus quiet section
// rows (本人確認状況 / 通知 / サポート / 退会). Badge/rating are shown quietly,
// never to nag (design-system §4.7 D/E). S2+ rows (支払い履歴 等) are out of S1
// scope but the structure is laid so they slot in later.

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingState } from "@/components/States";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Surface";
import { StarSummary } from "@/components/ui/Stars";
import { StatusPill, VerifiedBadge, PremiumBadge } from "@/components/ui/StatusPill";
import { BadgeProgress } from "@/components/badges/BadgeProgress";
import { getMe } from "@/app/_lib/api";
import { fetchMyBadges, type MyBadgesDTO } from "@/app/_lib/api-badge";
import { fetchMyPayments, type PaymentDTO } from "@/app/_lib/api-payment";
import { formatDateShort } from "@/app/_lib/datetime";
import { AREA_LABELS, type MeResponse } from "@/app/_lib/types";

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  // 優良バッジは補助情報。ページ本体の表示をブロックしないよう別途取得する
  // (取得前/失敗時は単に出さない = 既存表示を壊さない)。
  const [badges, setBadges] = useState<MyBadgesDTO | null>(null);
  // 支払い履歴も補助情報。本体表示をブロックせず別途取得（失敗時は単に出さない）。
  const [payments, setPayments] = useState<PaymentDTO[]>([]);

  useEffect(() => {
    let active = true;
    getMe().then((res) => {
      if (!active) return;
      setMe(res);
      setLoading(false);
    });
    fetchMyBadges().then((res) => {
      if (!active) return;
      setBadges(res);
    });
    fetchMyPayments().then((rows) => {
      if (active) setPayments(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading || !me) {
    return (
      <>
        <AppHeader title="マイページ" />
        <LoadingState />
      </>
    );
  }

  const { profile, identity } = me;
  const verified = identity?.status === "approved";
  const hasPremium = badges?.progress.hasPremium ?? false;

  return (
    <>
      <AppHeader title="マイページ" />
      <main data-testid="mypage" className="mx-auto w-full max-w-[480px] flex-1 space-y-7 px-5 pb-10 pt-5">
        {/* Profile summary card */}
        <Card>
          <div className="flex items-start gap-3.5">
            <div
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-200 bg-bg-sunken text-ink-300"
            >
              {profile?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl">◯</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[20px] leading-tight text-ink-900">
                {profile?.displayName ?? me.user.displayName ?? "未設定"}
                {profile ? (
                  <span className="ml-2 align-middle font-sans text-[14px] text-ink-500">
                    {profile.age}
                  </span>
                ) : null}
              </p>
              {/* 名前の近くに静かに。本人確認済 / 優良 を横並び (design-system
                  §4.7 E)。優良バッジは trust 系 pill + ◆ のみ (金ピカ・煽り無し)。 */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {verified ? <VerifiedBadge /> : null}
                {hasPremium ? (
                  <span data-testid="badge-premium" className="inline-flex">
                    <PremiumBadge />
                  </span>
                ) : null}
              </div>
              {profile ? (
                <div className="mt-2">
                  <StarSummary
                    avg={profile.ratingAvg}
                    count={profile.ratingCount}
                  />
                </div>
              ) : null}
              {profile?.areaPref?.length ? (
                <p className="mt-2 font-sans text-[13px] text-ink-500">
                  希望エリア:{" "}
                  {profile.areaPref.map((a) => AREA_LABELS[a]).join(" / ")}
                </p>
              ) : null}
            </div>
          </div>
          {profile?.bio ? (
            <p className="mt-3 border-t border-line-100 pt-3 font-sans text-[14px] leading-7 text-ink-700">
              {profile.bio}
            </p>
          ) : null}
          <div className="mt-3">
            <ButtonLink href="/profile/edit" variant="secondary">
              プロフィールを編集
            </ButtonLink>
          </div>
        </Card>

        {/* 優良バッジ未取得時のみ、取得に向けた事実の進捗を静かに表示
            (design-system §4.7 E)。取得済み・未ロード時は何も出さない。
            FOMO/煽りはしない (§8)。 */}
        {badges && !hasPremium ? (
          <section>
            <BadgeProgress
              progress={badges.progress}
              data-testid="badge-progress"
            />
          </section>
        ) : null}

        {/* Setting rows. 本人確認状況 is in-scope for S1; others are placed but
            their detail pages arrive in later sprints. */}
        <section>
          <SectionRows
            rows={[
              {
                label: "本人確認",
                href: "/identity/status",
                right: verified ? (
                  <VerifiedBadge />
                ) : identity?.status === "pending" ? (
                  <StatusPill tone="info" glyph="◷">
                    確認中
                  </StatusPill>
                ) : identity?.status === "rejected" ? (
                  <StatusPill tone="warn" glyph="⚠">
                    要再提出
                  </StatusPill>
                ) : (
                  <StatusPill tone="muted" glyph="○">
                    未提出
                  </StatusPill>
                ),
              },
            ]}
          />
        </section>

        {/* お支払い履歴 — 副次情報。事実(日時+金額/無料)を淡々と。煽らない。 */}
        <section className="space-y-2">
          <h2 className="px-1 font-sans text-[13px] font-bold text-ink-700">
            お支払い履歴
          </h2>
          {payments.length === 0 ? (
            <Card>
              <p className="font-sans text-[13px] text-ink-500">
                お支払いの履歴はまだありません。
              </p>
            </Card>
          ) : (
            <div
              data-testid="payment-history"
              className="overflow-hidden rounded-md border border-line-200 bg-bg-surface"
            >
              {payments.map((p, i) => (
                <div
                  key={p.id}
                  className={[
                    "flex items-center justify-between gap-3 px-4 py-3",
                    i > 0 ? "border-t border-line-100" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="font-sans text-[14px] text-ink-900">
                      {p.isFirstFree ? "初回参加（無料）" : "参加費"}
                    </p>
                    <p className="mt-0.5 font-sans text-[12px] tabular-nums text-ink-500">
                      {formatDateShort(p.paidAt ?? p.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-sans text-[14px] font-semibold tabular-nums text-ink-900">
                    {p.amountJpy === 0 ? "無料" : `¥${p.amountJpy.toLocaleString()}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="px-1 font-sans text-[13px] font-bold text-ink-700">
            サポート
          </h2>
          <SectionRows
            rows={[
              { label: "よくある質問", href: "/help", chevron: true },
              { label: "利用規約 / プライバシー", href: "/legal/terms", chevron: true },
            ]}
          />
        </section>

        <section className="space-y-2">
          <SectionRows
            rows={[
              {
                label: "退会する",
                href: "/mypage",
                chevron: true,
                danger: true,
              },
            ]}
          />
          <p className="px-1 font-sans text-xs text-ink-500">
            退会前に確認画面が表示されます。
          </p>
        </section>
      </main>
    </>
  );
}

type Row = {
  label: string;
  href: string;
  right?: React.ReactNode;
  chevron?: boolean;
  danger?: boolean;
};

function SectionRows({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-line-200 bg-bg-surface">
      {rows.map((row, i) => (
        <a
          key={row.label}
          href={row.href}
          className={[
            "flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg-sunken",
            i > 0 ? "border-t border-line-100" : "",
          ].join(" ")}
        >
          <span
            className={[
              "font-sans text-[14px]",
              row.danger ? "text-state-danger" : "text-ink-900",
            ].join(" ")}
          >
            {row.label}
          </span>
          <span className="flex items-center gap-2">
            {row.right}
            {row.chevron ? (
              <span aria-hidden className="text-ink-300">
                ›
              </span>
            ) : null}
          </span>
        </a>
      ))}
    </div>
  );
}
