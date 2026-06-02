"use client";

// /line-debug — LINEログイン失敗の原因を実データで確定する一時診断ページ。
// id_token の payload(aud/iss/exp/sub)をクライアントでデコード表示し、
// サーバ /api/auth/line の応答(status/body)も見る。値の機微部分は伏せる。
// 原因確定後に削除する。

import { useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

// JWT payload を検証せずデコード（診断目的。aud/iss/exp の確認のみ）。
function decodePayload(jwt: string): Record<string, unknown> | null {
  try {
    const p = jwt.split(".")[1];
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function LineDebugPage() {
  const [lines, setLines] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    (async () => {
      const push = (k: string, v: unknown) =>
        setLines((p) => [...p, [k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")]]);

      push("NEXT_PUBLIC_LIFF_ID", LIFF_ID || "(未設定!)");
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: LIFF_ID });
        push("liff.init", "OK");
        push("isInClient", liff.isInClient());
        push("isLoggedIn", liff.isLoggedIn());
        push("os", String(liff.getOS?.() ?? ""));
        push("lineVersion", String(liff.getLineVersion?.() ?? ""));

        if (!liff.isLoggedIn()) {
          push("→", "未ログイン。下のボタンでログイン");
          setLines((p) => [...p, ["__needlogin", "1"]]);
          return;
        }

        const idt = liff.getIDToken() ?? "";
        push("idToken length", idt.length);
        push("idToken segments", idt.split(".").length);
        // payload デコード（aud/iss/exp/sub の確認＝失敗原因の核心）
        const payload = decodePayload(idt);
        if (payload) {
          push("token.aud (audience)", payload.aud);
          push("token.iss", payload.iss);
          push("token.exp", payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : "");
          push("token.exp 切れ?", payload.exp ? Number(payload.exp) * 1000 <= Date.now() : "?");
          push("token.sub 先頭", String(payload.sub ?? "").slice(0, 8));
        } else {
          push("payload decode", "失敗（id_tokenが不正形式）");
        }

        // サーバ交換（実際の /api/auth/line を叩き、status と body を見る）
        try {
          const res = await fetch("/api/auth/line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idt }),
            cache: "no-store",
          });
          push(">>> exchange status", res.status);
          push(">>> exchange body", (await res.text()).slice(0, 200));
        } catch (e) {
          push(">>> exchange", "fetch err " + (e instanceof Error ? e.message : "?"));
        }

        // verify API の生応答（401の真因＝verifyが何を返すか）。
        try {
          const vr = await fetch("/api/_debug-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idt }),
            cache: "no-store",
          });
          const vj = await vr.json();
          push("=== verify生応答 ===", "");
          push("verifyStatus", vj.verifyStatus);
          push("verify_error", vj.verify_error);
          push("verify_error_description", vj.verify_error_description);
          push("verify_aud", vj.verify_aud);
          push("audMatchesChannel", vj.audMatchesChannel);
          push("channelIdValue", vj.channelIdValue);
        } catch (e) {
          push("verify生応答", "err " + (e instanceof Error ? e.message : "?"));
        }
      } catch (e) {
        push("FATAL", e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function doLogin() {
    const liff = (await import("@line/liff")).default;
    liff.login();
  }

  const needLogin = lines.some(([k]) => k === "__needlogin");

  return (
    <main style={{ padding: 16, fontFamily: "monospace", maxWidth: 520, fontSize: 12 }}>
      <h1 style={{ fontSize: 15, marginBottom: 12 }}>LINEログイン診断 v3（aud確認）</h1>
      {lines
        .filter(([k]) => k !== "__needlogin")
        .map(([k, v], i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #eee" }}>
            <span style={{ minWidth: 150, color: "#888" }}>{k}</span>
            <span style={{ wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
      {needLogin ? (
        <button
          onClick={doLogin}
          style={{ marginTop: 16, padding: "10px 16px", background: "#C2703D", color: "#fff", border: 0, borderRadius: 6, fontSize: 14 }}
        >
          ログイン実行
        </button>
      ) : null}
      <p style={{ marginTop: 12, color: "#aaa", fontSize: 11 }}>
        一時診断。token.aud と exchange status/body を開発者に伝えてください。
      </p>
    </main>
  );
}
