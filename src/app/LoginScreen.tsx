"use client";

// U-00 入口 / LINEログイン — HAKO-NIWA(箱庭) のLP兼ログイン (wireframes U-00 / s10-redesign §4)。
//
// S10 全面リデザイン: スクロール型の通常フローLP。固定フッタCTAを廃止し(本文被りの構造的解消)、
// 主CTAをヒーロー内・末尾にも再掲。縦構成:
//   ロックアップ → ヒーロー(タグライン+主見出し明朝+サブ見出し+CSSアトモスフィア+主従CTA+LINE外案内)
//   → 不安解消の価値4カード → ご利用の流れ → 開催について(具体) → 末尾CTA再掲 → 規約。
// ビジュアルは hero-atmosphere(テラコッタ+深緑のradial-gradient / globals.css §9)で「あたたかい庭」
// の空気を出す。画像が一枚も無くても、タイポ+余白+グラデ+カードで品よく成立する。
//
// NOTE: ログインロジック(runLogin/handleLogin/自動再開useEffect/lineLogin呼び出し/error state)は
// 挙動不変で維持。S10 で変えたのはビジュアル・コピー・CTA配置・error文言のみ(s10 §8)。

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lineLogin } from "./_lib/liff-login";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { HeroScene } from "@/components/brand/HeroScene";
import { ConcreteBlock, FlowList, ValueList } from "@/components/brand/LpSections";

// エラーコード→ユーザー向け日本語(s10 §8.2)。原因＋「次の一手」を必ず添える。
// 責めない・煽らない・感嘆符なし(design-system §0)。環境要因が主なので赤(danger)にはしない(§8.2)。
function errorMessage(code: string | undefined): string {
  if (!code)
    return "ログインに失敗しました。もう一度「LINEではじめる」を押してお試しください。";
  if (code.startsWith("token_exchange_failed"))
    return "LINEの確認に失敗しました。少し時間をおいて、もう一度「LINEではじめる」を押してください。";
  if (code === "no_id_token")
    return "LINEの確認情報を取得できませんでした。お手数ですが、スマホのLINEアプリ内からこのページを開いて、もう一度お試しください。";
  if (code.startsWith("liff_init_failed"))
    return "LINE連携の準備に失敗しました。通信環境をご確認のうえ、スマホのLINEアプリ内から開き直してお試しください。";
  return "ログインに失敗しました。もう一度「LINEではじめる」を押してお試しください。";
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

  // 主CTA(LINEではじめる)。ヒーローと末尾で再掲するため共通化(挙動は同一の handleLogin)。
  // testid はヒーロー側を canonical(login-button)とし、末尾は別 testid にして衝突を避ける。
  const primaryCta = (testid: string) => (
    <Button data-testid={testid} onClick={handleLogin} disabled={loading}>
      {loading ? "接続しています…" : "LINEではじめる"}
    </Button>
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-6 pb-12 pt-16 md:max-w-3xl md:px-8 lg:max-w-5xl">
      <BrandLockup />

      {/* ヒーロー(ファーストビュー)。relative isolate で z-index を閉じ、背後にアトモスフィア。
          CTAはこの前景の中＝固定ではないので本文に被らない(s10 §4.5/§5.2)。 */}
      <section className="relative isolate mt-10 overflow-hidden">
        <div className="hero-atmosphere" aria-hidden />

        {/* base: Hero絵→コピー の縦並び(現行不変)。md+: 2カラム(左コピー / 右Hero)。
            DOM順は現行(Hero→コピー)のまま維持し、md+ で order を入れ替える(base を1pxも変えない / s11視覚§3.2)。 */}
        <div className="relative pb-2 pt-2 md:grid md:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] md:items-center md:gap-8">
          {/* 主役級ビジュアル(#8 / s11 §4.2)。ロックアップとタグラインの間=ファーストビュー最初の絵。
              枠線/影なし(空グラデが地に溶ける)。アトモスフィアと二重で温度を出す。aria-label済。
              md+ では右カラム(order-2)で堂々と大きく。 */}
          <div className="relative mb-8 overflow-hidden rounded-lg md:order-2 md:mb-0">
            <HeroScene className="block h-auto w-full" />
            {/* 極薄ヴィネット(内側の暗まり ink-900 6%)で絵を締める(s11視覚§6.3)。装飾のみ。
                これ以上濃くしない(暗い額縁はSaaS臭)。グレイン/アニメは入れない。 */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_40px_rgba(43,38,34,0.06)]"
            />
          </div>

          {/* 左カラム(コピー＋CTA)。md+ は order-1。 */}
          <div className="md:order-1">
            {/* タグライン(小さなキャッチ・字間広め)。主見出しを引き立てる(s10 §2.4)。 */}
            <p className="font-sans text-[13px] font-bold tracking-[0.08em] text-accent-600">
              みんなが出会える場所
            </p>
            {/* 主見出し(明朝・display強化 / s10 §2.4)。PC で明朝の主見出しを大きく効かせる(s11視覚§3.2)。 */}
            <h1 className="mt-3 font-serif text-[32px] leading-[1.3] tracking-[-0.01em] text-ink-900 md:text-[40px] md:leading-[1.15] lg:text-[44px]">
              会って、はじまる。
            </h1>

            {/* サブ見出し＝3秒で「誰のための/何が違う」を出す。グラデ上でも可読性を確保するため
                白面カードに載せAAを担保(s10 §2.3/§4.5)。md+ は左カラム幅に追従(max-w 解除)。 */}
            <div className="mt-5 rounded-md border border-line-200 bg-bg-surface/70 p-4 shadow-sm backdrop-blur-[2px]">
              <p className="max-w-[20rem] font-sans text-[15px] leading-7 text-ink-700 md:max-w-none">
                男女あわせて6名、はじめましての席。やり取りは要りません。本人確認を済ませた人と、会うことに集中できます。会場の手配までおまかせで。
              </p>
            </div>

            {/* エラー表示は主CTAの直上(押した場所の近くで結果が見える / s10 §8.2)。
                state/warn 系の淡い橙地。赤(danger)にはしない。 */}
            {error ? (
              <p
                role="alert"
                className="mt-5 rounded-md border border-state-warn/45 bg-[#F7EFD9] px-3 py-2 font-sans text-[13px] leading-relaxed text-state-warn"
              >
                {error}
              </p>
            ) : null}

            {/* 主従CTA(ヒーロー内)。md+ はボタン群だけ幅を抑え間延び/押しにくさを防ぐ(s11視覚§3.2)。 */}
            <div className="mt-5 space-y-3 md:max-w-[20rem]">
              {primaryCta("login-button")}
              <ButtonLink href="/explore" variant="secondary" data-testid="explore-cta">
                会を見てみる
              </ButtonLink>
            </div>

            {/* LINE外案内を常設(エラーが無くても / s10 §8.1)。押す前に前提を理解できる。 */}
            <p className="mt-3 font-sans text-[13px] leading-relaxed text-ink-500">
              スマホのLINEで開くと、そのまま進めます。
            </p>
          </div>
        </div>
      </section>

      {/* 不安解消の価値4カード → ご利用の流れ → 開催について(具体)。
          md+ は「流れ｜開催」を横2カラムにして縦の冗長感を減らす(s11視覚§3.4)。base は縦のまま不変。 */}
      <ValueList />
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
        <FlowList />
        <ConcreteBlock />
      </div>

      {/* 末尾CTA(再掲)。スクロールしきった人を取りこぼさない。淡い accent 地で締める(s10 §4.2)。
          md+ は中央に幅を抑えてボタンの間延びを防ぐ(s11視覚§3.4)。 */}
      <section className="mt-12 rounded-lg border border-line-200 bg-accent-100/60 p-6 md:mx-auto md:max-w-[520px]">
        <h2 className="text-center font-serif text-[18px] leading-snug text-ink-900">
          まずは、のぞいてみませんか。
        </h2>
        <div className="mt-4 space-y-3">
          {primaryCta("login-button-bottom")}
          <ButtonLink
            href="/explore"
            variant="secondary"
            data-testid="explore-cta-bottom"
          >
            会を見てみる
          </ButtonLink>
        </div>
      </section>

      {/* 規約・特商法(小さく)。 */}
      <div className="mt-8 space-y-2">
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
