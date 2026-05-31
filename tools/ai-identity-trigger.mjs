// =============================================================================
// matching-app — 本人認証 AI 一次判定 トリガージョブ（API同期でなくトリガー駆動）
//
// 殿の指示: Haiku は Anthropic API では動かさない。モーニングレポートと同じく
//   「トリガーで起動したジョブ」が判定して書き戻す方式にする。
//
// このスクリプトがその「トリガージョブ」本体:
//   1. GET  /api/admin/identity/ai-queue        … 判定待ちキューを取得（Bearer 認証）
//   2. judge(item)                              … 各項目を判定（下記「判定シーム」）
//   3. POST /api/admin/identity/:id/ai-verdict  … 判定結果を書き戻す（Bearer 認証）
//      → サーバ側で 18歳安全弁付きの自動承認（ok かつ 18+ のみ approve）。
//
// 起動方法（トリガー駆動の例）:
//   - ローカル/デモ: tools/ai-identity-trigger-run.sh（本番ビルドを起動してから実行）
//   - 本番: cron / スケジューラ / Claude Code の定期ジョブ等から
//       AI_TRIGGER_BASE_URL=https://<deploy> AI_TRIGGER_TOKEN=<secret> \
//         node tools/ai-identity-trigger.mjs
//
// 環境変数:
//   AI_TRIGGER_BASE_URL  対象アプリの URL（既定 http://127.0.0.1:3000）
//   AI_TRIGGER_TOKEN     Bearer トークン（未設定時は開発既定 dev-ai-trigger-token）
//
// セキュリティ: トークン・blobRef・birthdate 等はログに出さない（件数と判定種別のみ）。
// =============================================================================

const BASE = (process.env.AI_TRIGGER_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const TOKEN = process.env.AI_TRIGGER_TOKEN || "dev-ai-trigger-token";
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const log = (m) => console.log("AITRIG " + m);

function ageFromBirthdate(iso) {
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ---- 判定シーム ----------------------------------------------------------
// ここが「Haiku 判定」の差し込み口。**Anthropic API を同期で叩く実装ではなく**、
// トリガーで起動したこのジョブのコンテキストで判定する。
//   - 現状（スキャフォールド）: 決定的ルール（haiku-verify.ts のモックと同じ規則）。
//       ① 18歳未満 → ng（年齢の安全弁。サーバ側でも二重チェックされる）
//       ② blobRef に blurry/unreadable/noface を含む → review（運営確認）
//       ③ それ以外 → ok（明白OK＝自動承認候補）
//   - 本番: この関数の中で、トリガー実行主体（Claude Code 等のエージェント）が
//       blobRef の画像を取得して ①18歳以上か ②顔写真の有無 ③記載読取 を判断し、
//       { verdict, reason } を返すように差し替える。reason には PII/画像生データ/
//       秘密値を入れない（人間可読の要約のみ）。判定不能は安全側の "review"。
function judge(item) {
  const age = ageFromBirthdate(item.birthdate);
  if (age === null) {
    return { verdict: "review", reason: "AI(trigger): 生年月日を判定できず要確認。" };
  }
  if (age < 18) {
    return { verdict: "ng", reason: "AI(trigger): 記載の生年月日が18歳未満のため不可。" };
  }
  const ref = String(item.blobRef || "").toLowerCase();
  if (ref.includes("blurry") || ref.includes("unreadable") || ref.includes("noface")) {
    return {
      verdict: "review",
      reason: "AI(trigger): 画像が不鮮明、または顔写真が確認できないため要確認。",
    };
  }
  return {
    verdict: "ok",
    reason: `AI(trigger): 18歳以上・顔写真あり・記載読取良好(docType=${item.docType})。`,
  };
}
// -------------------------------------------------------------------------

async function main() {
  // 1. キュー取得
  let items = [];
  try {
    const res = await fetch(`${BASE}/api/admin/identity/ai-queue`, { headers: AUTH });
    if (!res.ok) {
      log(`queue HTTP ${res.status} — 中断（トークン/設定を確認）`);
      process.exit(res.status === 401 || res.status === 503 ? 2 : 1);
    }
    const j = await res.json();
    items = j.items || [];
  } catch (e) {
    log("queue fetch エラー: " + String(e).split("\n")[0]);
    process.exit(1);
  }
  log(`queue=${items.length} 件`);

  // 2-3. 各項目を判定 → 書き戻し
  const tally = { ok: 0, review: 0, ng: 0, approved: 0, failed: 0 };
  for (const item of items) {
    const { verdict, reason } = judge(item);
    try {
      const res = await fetch(
        `${BASE}/api/admin/identity/${encodeURIComponent(item.id)}/ai-verdict`,
        {
          method: "POST",
          headers: { ...AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ verdict, reason }),
        }
      );
      if (!res.ok) {
        tally.failed++;
        log(`writeback HTTP ${res.status} for one item`);
        continue;
      }
      const out = await res.json();
      tally[verdict]++;
      if (out.autoApproved) tally.approved++;
    } catch (e) {
      tally.failed++;
      log("writeback エラー: " + String(e).split("\n")[0]);
    }
  }

  log(
    `done ok=${tally.ok} review=${tally.review} ng=${tally.ng} ` +
      `autoApproved=${tally.approved} failed=${tally.failed}`
  );
}

main();
