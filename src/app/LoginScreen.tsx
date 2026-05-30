"use client";

// U-00 スプラッシュ / LINEログイン (STEP0) — wireframes.md U-00.
// Minimal. Quiet editorial logo, one functional copy line, the LINE button,
// and small 利用規約/プライバシー links. No purple gradient, no promo tone.
//
// NOTE: このクライアント本体は元 page.tsx から切り出したもの。page.tsx を
// Server Component の入口ゲート（ReleaseGate）にするため分離した。挙動は不変。

import { useRouter } from "next/navigation";
import { useState } from "react";
import { devLogin } from "./_lib/api";
import { Button } from "@/components/ui/Button";

export function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    // Mock dev-login per contract §2 (POST /api/auth/dev-login). On failure the
    // api client falls back to ok:true so the onboarding flow stays reachable.
    await devLogin();
    router.push("/onboarding");
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
