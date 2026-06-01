"use client";

// U-00 スプラッシュ / LINEログイン (STEP0) — wireframes.md U-00.
// Minimal. Quiet editorial logo, one functional copy line, the LINE button,
// and small 利用規約/プライバシー links. No purple gradient, no promo tone.
//
// NOTE: このクライアント本体は元 page.tsx から切り出したもの。page.tsx を
// Server Component の入口ゲート（ReleaseGate）にするため分離した。挙動は不変。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lineLogin } from "./_lib/liff-login";
import { Button } from "@/components/ui/Button";

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
    } else if (
      result.error === "redirecting_to_line_login" ||
      result.error === "relogin_for_id_token"
    ) {
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
      qs.includes("code=") || qs.includes("liff.state") || qs.includes("liffRetry");
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
    <main className="flex min-h-[100dvh] flex-col justify-between px-6 pb-10 pt-16">
      <div className="pt-8">
        {/* Editorial mark — a small drawn diamond, not a glossy SaaS logo. */}
        <div
          aria-hidden
          className="mb-6 flex h-11 w-11 items-center justify-center rounded-md border border-line-200 text-accent-500"
        >
          <span className="text-lg leading-none">◇</span>
        </div>
        <p className="font-serif text-[22px] font-semibold tracking-tight text-ink-900">
          rendez
        </p>
        <p className="mt-1 font-sans text-[13px] tracking-wide text-ink-500">
          東京・恵比寿 / 池袋 / 銀座
        </p>

        <h2 className="mt-10 font-serif text-[28px] leading-[1.35] text-ink-900">
          3対3で、会いにいく。
        </h2>
        <p className="mt-4 max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700">
          男女3人ずつ、計6人で集まる新しい合コン。アプリ内のやり取りはありません。
          会場はこちらで手配します。
        </p>
      </div>

      <div className="space-y-4">
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
      </div>
    </main>
  );
}
