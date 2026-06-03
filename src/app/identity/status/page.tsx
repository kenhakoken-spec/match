"use client";

// U-13 本人認証 審査中 / 結果（承認・却下）(STEP0) — wireframes.md U-13.
// Three states from IdentityVerification.status:
//   pending  → ◷ "確認中" (state/info)
//   approved → ✓ "確認済" (verified) → プロフィール登録へ
//   rejected → ⚠ "要再提出" (state/WARN, NOT danger — never blame) + 理由 + 再提出
// Status comes from GET /api/identity (dummy fallback = pending).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LoadingState } from "@/components/States";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { PageBody } from "@/components/ui/Surface";
import { getIdentity } from "../../_lib/api";
import type { IdentityStatus } from "../../_lib/types";

const DEFAULT_REJECT_REASONS = [
  "画像が不鮮明でした",
  "顔写真が確認できませんでした",
];

// S11 #1: 「未提出」を pending(確認中) と区別する。identity レコードが無い(API null)＝
// まだ提出していない状態。型 IdentityStatus は変えず、画面ローカルで notSubmitted を足す。
type ViewStatus = IdentityStatus | "notSubmitted";

export default function IdentityStatusPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ViewStatus>("notSubmitted");
  const [rejectReason, setRejectReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Dev/demo aid: `?demo=approved|rejected|pending` lets reviewers and
    // screenshots see each state without a live backend. Production behaviour
    // (no query) is unchanged — status comes from GET /api/identity.
    const demo =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("demo")
        : null;
    if (demo === "approved" || demo === "rejected" || demo === "pending") {
      setStatus(demo);
      setRejectReason(null);
      setLoading(false);
      return;
    }
    getIdentity().then((res) => {
      if (!active) return;
      // res が null = identity レコード無し = 未提出。pending(確認中)と区別する。
      setStatus(res?.status ?? "notSubmitted");
      setRejectReason(res?.rejectReason ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
        <AppHeader title="本人確認" backHref="/onboarding" />
        <LoadingState label="状況を確認しています" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <AppHeader title="本人確認" backHref="/onboarding" />
      <PageBody className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {status === "notSubmitted" ? (
            <StateBlock
              glyph="◇"
              pill={
                <StatusPill tone="muted" glyph="◇">
                  未提出
                </StatusPill>
              }
              title="本人確認がまだです"
              body={
                <>
                  会に応募するには、本人確認（年齢確認）が必要です。
                  <br />
                  顔写真付きの身分証で、かんたんに済みます。
                </>
              }
              note={
                <>
                  確認が済むまで、開催予定の会はご覧いただけます。
                </>
              }
            />
          ) : null}

          {status === "pending" ? (
            <StateBlock
              glyph="◷"
              pill={
                <StatusPill tone="info" glyph="◷">
                  確認中
                </StatusPill>
              }
              title="確認中です"
              body={
                <>
                  通常 1〜2 営業日で完了します。
                  <br />
                  結果は LINE とこの画面でお知らせします。
                </>
              }
              note={
                <>
                  審査中は会への応募はできません。
                  <br />
                  審査中でも、開催予定の会はご覧いただけます。
                </>
              }
            />
          ) : null}

          {status === "approved" ? (
            <StateBlock
              glyph="✓"
              pill={
                <StatusPill tone="verified" glyph="✓">
                  確認済
                </StatusPill>
              }
              title="確認が完了しました"
              body={
                <>
                  ご協力ありがとうございます。
                  <br />
                  続けてプロフィールを登録しましょう。
                </>
              }
            />
          ) : null}

          {status === "rejected" ? (
            <StateBlock
              glyph="⚠"
              // 却下は warn（注意）であって danger（エラー）にしない（§4.7 B / §5）。
              pill={
                <StatusPill tone="warn" glyph="⚠">
                  要再提出
                </StatusPill>
              }
              title="確認できませんでした"
              body={
                <div className="mt-1 w-full text-left">
                  <p className="mb-1.5 font-sans text-[13px] font-semibold text-ink-700">
                    理由
                  </p>
                  <ul className="space-y-1 font-sans text-[14px] leading-relaxed text-ink-700">
                    {(rejectReason
                      ? [rejectReason]
                      : DEFAULT_REJECT_REASONS
                    ).map((r) => (
                      <li key={r} className="flex gap-2">
                        <span aria-hidden className="text-state-warn">
                          ・
                        </span>
                        {r}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink-500">
                    お手数ですが、もう一度ご提出ください。
                  </p>
                </div>
              }
            />
          ) : null}
        </div>

        <div className="space-y-2 pt-6">
          {status === "notSubmitted" ? (
            <>
              <Button onClick={() => router.push("/identity")}>
                本人確認を提出する
              </Button>
              <Button variant="secondary" onClick={() => router.push("/explore")}>
                まず会を見てみる
              </Button>
            </>
          ) : null}
          {status === "approved" ? (
            <Button onClick={() => router.push("/profile/new")}>
              プロフィール登録へ
            </Button>
          ) : null}
          {status === "rejected" ? (
            <Button onClick={() => router.push("/identity")}>
              もう一度提出する
            </Button>
          ) : null}
          {status === "pending" ? (
            <>
              {/* 「まず見せる」方針(s9 §6.2b): 会を見てみる(/explore)を主に格上げ。 */}
              <Button onClick={() => router.push("/explore")}>会を見てみる</Button>
              <Button variant="secondary" onClick={() => router.push("/browse")}>
                ホームへ
              </Button>
            </>
          ) : null}
        </div>
      </PageBody>
    </div>
  );
}

function StateBlock({
  glyph,
  pill,
  title,
  body,
  note,
}: {
  glyph: string;
  pill: React.ReactNode;
  title: string;
  body: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full border border-line-200 bg-bg-surface text-2xl text-ink-700"
      >
        {glyph}
      </span>
      {pill}
      <h2 className="font-serif text-[20px] text-ink-900">{title}</h2>
      <div className="max-w-[18rem] font-sans text-[14px] leading-7 text-ink-700">
        {body}
      </div>
      {note ? (
        <p className="mt-1 font-sans text-xs text-ink-500">※ {note}</p>
      ) : null}
    </div>
  );
}
