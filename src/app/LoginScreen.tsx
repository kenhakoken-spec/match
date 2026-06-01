"use client";

// U-00 入口 / LINEログイン — HAKO-NIWA(箱庭) のLP兼ログイン (wireframes U-00 / s9 §3.2)。
// 縦構成: ロックアップ → ヒーロー(タグライン+主見出し明朝+箱庭SVG添景) → 価値5点 →
// ご利用の流れ → 固定フッタの2導線(LINEではじめる / 会を見てみる) → 規約。
// 画像が一枚も無くても、タイポ+余白+最小SVGで品よく成立する(s9 §3.4: 枠だけ残る事故ゼロ)。
//
// NOTE: ログインロジック(runLogin/handleLogin/自動再開useEffect/error)は挙動不変で維持。
// S9 で変えたのはビジュアルとコピー、および副CTA(会を見てみる→/explore)の追加のみ。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lineLogin } from "./_lib/liff-login";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BrandMotif } from "@/components/brand/BrandMotif";
import { FlowList, ValueList } from "@/components/brand/LpSections";

// エラーコード→ユーザー向け日本語（原因が分かるように。煽らない静かな文言）。
function errorMessage(code: string | undefined): string {
  if (!code) return "ログインに失敗しました。もう一度お試しください。";
  if (code.startsWith("token_exchange_failed"))
    return "LINEの確認に失敗しました（トークン検証エラー）。時間をおいて再度お試しください。";
  if (code === "no_id_token")
    return "LINEのIDトークンを取得できませんでした。LINEアプリ内から開いているかご確認ください。";
  if (code.startsWith("liff_init_failed"))
    return "LINE連携の初期化に失敗しました。LINEアプリ内から開いてお試しください。";
  return "ログインに失敗しました。もう一度お試しください。";
}

export function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  async function runLogin() {
    setLoading(true);
    setError(null);
    // LINE(LIFF) ログインを試みる。NEXT_PUBLIC_LIFF_ID があれば LIFF で
    // id_token を取得しサーバ検証(/api/auth/line)、無ければ dev-login にフォールバック。
    // liff.login() はLINEログインへリダイレクトするため、その場合は戻ってこない。
    const result = await lineLogin();
    if (result.ok) {
      router.push("/onboarding");
    } else if (result.error === "redirecting_to_line_login") {
      // LINEログインへ遷移中。ボタンは押下状態のまま（戻ってきたら自動再開）。
      return;
    } else {
      // 失敗。理由を表示して再試行できるようにする。
      setError(errorMessage(result.error));
      setLoading(false);
    }
  }

  // LINE同意から戻った直後（LIFFのcode/state や liffRetry が付く）は、ボタンを
  // 押し直さなくても自動でログインを続行する。1度だけ。
  useEffect(() => {
    if (startedRef.current) return;
    if (typeof window === "undefined") return;
    const qs = window.location.search;
    const returnedFromLine =
      qs.includes("code=") || qs.includes("liff.state");
    if (returnedFromLine) {
      startedRef.current = true;
      void runLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogin() {
    startedRef.current = true;
    void runLogin();
  }

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-44 pt-16">
      <div className="pt-8">
        <BrandLockup />

        {/* ヒーロー: タグライン → 主見出し(明朝) → 箱庭の添景SVG → 説明 */}
        <p className="mt-10 font-sans text-[18px] font-bold leading-snug text-accent-600">
          みんなが出会える場所
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-[1.35] text-ink-900">
          3対3で、会いにいく。
        </h1>

        {/* 写真の代替＝箱庭の添景。写真が無くても常に描画され、枠だけ残る事故が起きない。 */}
        <div className="mt-7 flex justify-center">
          <BrandMotif
            name="garden-plot"
            accent="#C2703D"
            className="h-auto w-full max-w-[20rem] text-line-200"
          />
        </div>

        <p className="mt-7 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
          男女3人ずつ、計6人で会う、安心できる出会いの場です。
          会場はこちらで手配します。
        </p>

        <ValueList />
        <FlowList />
      </div>

      {/* 固定フッタ: 主導線(LINEではじめる) + 副導線(会を見てみる) + 規約。 */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-app space-y-3 border-t border-line-200 bg-bg-surface px-6 pb-5 pt-3 shadow-md">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-state-warn/45 bg-[#F7EFD9] px-3 py-2 text-center font-sans text-[13px] leading-relaxed text-state-warn"
          >
            {error}
          </p>
        ) : null}
        <Button data-testid="login-button" onClick={handleLogin} disabled={loading}>
          {loading ? "接続しています…" : "LINEではじめる"}
        </Button>
        <ButtonLink href="/explore" variant="secondary" data-testid="explore-cta">
          会を見てみる
        </ButtonLink>
        <p className="text-center font-sans text-xs leading-relaxed text-ink-500">
          続行すると{" "}
          <a href="/legal/terms" className="text-accent-500 underline">
            利用規約
          </a>{" "}
          /{" "}
          <a href="/legal/privacy" className="text-accent-500 underline">
            プライバシー
          </a>{" "}
          に同意したものとみなします
        </p>
        <p className="text-center font-sans text-xs leading-relaxed text-ink-500">
          <a href="/legal/tokushoho" className="text-accent-500 underline">
            特定商取引法に基づく表記
          </a>
        </p>
      </div>
    </main>
  );
}
