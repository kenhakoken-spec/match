// =============================================================================
// matching-app — トリガージョブ認証（本人認証 AI 一次判定のトリガー駆動）
//
// 本人認証の AI 判定は「API を同期で叩く」のではなく、モーニングレポートと同様に
// **外部トリガーで起動するジョブ**が処理する（spec 要望2 をトリガー駆動へ再設計）。
//   ① ユーザーは身分証を提出 → status=pending・aiVerdict=null で受けるだけ（AI は呼ばない）。
//   ② トリガージョブ（tools/ai-identity-trigger.mjs）が「判定待ちキュー」を取得し判定。
//   ③ 判定結果をサーバへ書き戻し、サーバ側で 18歳安全弁を効かせて自動承認。
//
// そのジョブ専用エンドポイント（/api/admin/identity/ai-queue, .../ai-verdict）は
// ユーザーセッション Cookie ではなく **共有トークン**（Bearer）で認証する。
// 通常ユーザー/管理者の画面操作からは到達しない（人間の admin 承認は別経路 A-09）。
//
// フェイルクローズ: env.aiTriggerToken() が本番で未設定なら null → 503。
// =============================================================================
import "server-only";
import { aiTriggerToken } from "@/lib/env";

/** トリガー認証の失敗。http.ts の handle() が status/code で JSON 化する。 */
export class TriggerAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "TriggerAuthError";
  }
}

/** `Authorization: Bearer <token>` から token を取り出す（無ければ null）。 */
export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/**
 * トリガージョブのトークンを検証する。
 * - 本番で未設定 → 503 trigger_not_configured（フェイルクローズ）。
 * - トークン不一致/欠如 → 401 unauthorized。
 * 一致したら何も返さず通す（例外を投げない）。
 *
 * タイミング攻撃を避けるため、長さ一致時は定数時間比較する。
 */
export function requireTriggerToken(req: Request): void {
  const expected = aiTriggerToken();
  if (expected === null) {
    throw new TriggerAuthError(
      503,
      "trigger_not_configured",
      "AI trigger token is not configured (set AI_TRIGGER_TOKEN)"
    );
  }
  const provided = extractBearer(req.headers.get("authorization"));
  if (!provided || !safeEqual(provided, expected)) {
    throw new TriggerAuthError(401, "unauthorized", "invalid trigger token");
  }
}

/** 定数時間比較（長さが違えば即 false。秘密値はログに出さない）。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
