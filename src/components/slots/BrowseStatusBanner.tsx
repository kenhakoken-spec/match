// src/components/slots/BrowseStatusBanner.tsx — /browse 上部の段階別ステータスバナー
// (U-04 / s9 §6.2c・§6.2d)。「応募できるか」を淡色で明示し、できない理由と次の一手を出す。
//
// 段階(viewer 状態)で文言・形状・アクションを出し分け。赤(danger)にしない・形状併記(§5/§8)。
//   本人確認 未提出 → ◷ 「本人確認をすると、会に応募できます」     [本人確認へ進む]→/identity
//   審査中(pending)  → ◷ 「本人確認を確認中です。完了すると応募できます」[状況を見る]→/identity/status
//   承認・プロフ未   → ✓ 「プロフィールを登録すると、会に応募できます」 [プロフィール登録へ]→/profile/new
//   却下(rejected)   → ⚠ 「本人確認をもう一度お願いします」          [再提出する]→/identity
//   承認・プロフ済   → バナー無し。ただし初回のみ「準備ができました。…」(§6.2d)を一度だけ。
//
// ユーザー語彙は「応募」で統一(「予約」は会場のみ / s9 §6.2d)。

"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import type { MeResponse } from "@/app/_lib/types";

type Tone = "info" | "verified" | "warn";
type Stage = {
  glyph: string;
  pillTone: Tone;
  pillLabel: string;
  text: string;
  actionHref: string;
  actionLabel: string;
};

// 承認+プロフ完了の「準備ができました」を一度だけ出すためのフラグ(端末ローカル)。
const READY_SEEN_KEY = "hakoniwa.browse.readySeen";

function stageFor(me: MeResponse): Stage | null {
  const idStatus = me.identity?.status ?? null; // null = 未提出
  const hasProfile = me.profile !== null;

  if (idStatus === null) {
    return {
      glyph: "◷",
      pillTone: "info",
      pillLabel: "未確認",
      text: "本人確認をすると、会に応募できます",
      actionHref: "/identity",
      actionLabel: "本人確認へ進む",
    };
  }
  if (idStatus === "pending") {
    return {
      glyph: "◷",
      pillTone: "info",
      pillLabel: "確認中",
      text: "本人確認を確認中です。完了すると応募できます",
      actionHref: "/identity/status",
      actionLabel: "状況を見る",
    };
  }
  if (idStatus === "rejected") {
    return {
      glyph: "⚠",
      pillTone: "warn",
      pillLabel: "要再提出",
      text: "本人確認をもう一度お願いします",
      actionHref: "/identity",
      actionLabel: "再提出する",
    };
  }
  // approved
  if (!hasProfile) {
    return {
      glyph: "✓",
      pillTone: "verified",
      pillLabel: "確認済",
      text: "プロフィールを登録すると、会に応募できます",
      actionHref: "/profile/new",
      actionLabel: "プロフィール登録へ",
    };
  }
  return null; // 承認 + プロフ済 → ステータスバナーは出さない。
}

export function BrowseStatusBanner({ me }: { me: MeResponse | null }) {
  // 承認+プロフ済の初回のみ「準備ができました」を出す(§6.2d)。マウント後にローカル確認。
  const ready = me?.identity?.status === "approved" && me?.profile !== null;
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    try {
      if (window.localStorage.getItem(READY_SEEN_KEY)) return;
      window.localStorage.setItem(READY_SEEN_KEY, "1");
      setShowReady(true);
    } catch {
      // localStorage 不可なら出さない(静かにスキップ)。
    }
  }, [ready]);

  if (!me) return null;

  if (showReady) {
    return (
      <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-secondary-500/40 bg-secondary-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusPill tone="verified" glyph="✓">
            準備完了
          </StatusPill>
          <p className="min-w-0 font-sans text-[13px] leading-snug text-ink-700">
            準備ができました。ホームの会から応募できます。
          </p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setShowReady(false)}
            aria-label="閉じる"
            className="min-h-[44px] px-2 font-sans text-[13px] text-ink-500 hover:text-ink-700"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  const stage = stageFor(me);
  if (!stage) return null;

  // 淡色・責めない。却下(warn)でも accent.100 ではなく中立地で落ち着かせる。
  const ground =
    stage.pillTone === "warn"
      ? "border-line-200 bg-bg-sunken"
      : "border-line-200 bg-bg-sunken";

  return (
    <div
      data-testid="browse-status-banner"
      className={["mb-5 flex items-center justify-between gap-3 rounded-md border px-4 py-3", ground].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-2">
        <StatusPill tone={stage.pillTone} glyph={stage.glyph}>
          {stage.pillLabel}
        </StatusPill>
        <p className="min-w-0 font-sans text-[13px] leading-snug text-ink-700">
          {stage.text}
        </p>
      </div>
      <div className="shrink-0">
        <ButtonLink href={stage.actionHref} variant="secondary">
          {stage.actionLabel}
        </ButtonLink>
      </div>
    </div>
  );
}
