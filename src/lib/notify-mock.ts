// =============================================================================
// matching-app — notification (S1 = MOCK / SEC-001, extended for S3)
// 非production(既定): NotificationLog に記録するのみ(実送信しない)。
// 本番(NODE_ENV==="production"): MOCK_NOTIFY の値に関わらず **常にモック無効**
//   (実 LINE push に差し替え)。判定は env.ts に集約(フェイルクローズ)。
// PII最小: payload に lineUserId/誕生日/トークン/カード情報を入れない。
//
// S3 拡張:
//  - 通知の実体は Repository(NotificationLog)に記録する（admin notify が件数を数える）。
//  - MOCK_NOTIFY=1 のとき status=sent で記録するのみ（実 LINE 送信はしない）。
//  - 旧シグネチャ logNotificationMock({userId,type}) は後方互換のため維持
//    （S1 の identity 通知ルートがそのまま呼ぶ）。
// =============================================================================

import "server-only";
import { isMockNotifyEnabled } from "@/lib/env";
import { getRepo } from "@/lib/repo";
import type {
  NotificationLogEntity,
  NotificationTypeValue,
} from "@/lib/repo";

type NotifType = NotificationTypeValue;

interface NotifEntry {
  userId: string;
  type: NotifType;
  createdAt: Date;
}

const g = globalThis as unknown as { __mappNotifLog?: NotifEntry[] };

function legacyLog(): NotifEntry[] {
  if (!g.__mappNotifLog) g.__mappNotifLog = [];
  return g.__mappNotifLog;
}

function isMockNotify(): boolean {
  return isMockNotifyEnabled(); // SEC-001: env.ts 集約(本番は常に false)
}

/**
 * 軽量モック通知（S1 互換）。payload を持たない単純通知（identity_* 等）。
 * MOCK_NOTIFY=1 のときメモリ配列に記録するのみ。本番は LINE 送信に差し替え（S3）。
 */
export function logNotificationMock(input: { userId: string; type: NotifType }): void {
  if (!isMockNotify()) {
    return;
  }
  legacyLog().push({ userId: input.userId, type: input.type, createdAt: new Date() });
}

/** テスト/デバッグ用: 記録済み（軽量）通知の取得。 */
export function getNotificationLogMock(): ReadonlyArray<NotifEntry> {
  return legacyLog();
}

/**
 * S3 通知（payload つき）を **Repository の NotificationLog に記録** する。
 * MOCK_NOTIFY=1（非production既定）: 実 LINE 送信はせず status=sent で記録する
 *   （契約§2: MOCK_NOTIFY=1 は status=sent で記録、実送信なし）。
 * 本番（モック無効）: ここで実 LINE Messaging API push に差し替える（未接続）。
 *   接続までは pending で記録して再送可能に残す（黙って成功扱いにしない）。
 *
 * 戻り値は作成された NotificationLog。
 */
export async function sendNotification(input: {
  userId: string;
  type: NotifType;
  slotId?: string | null;
  matchId?: string | null;
  payload: Record<string, unknown>;
}): Promise<NotificationLogEntity> {
  const repo = getRepo();
  if (isMockNotify()) {
    // モック: 実送信せず sent で記録（監査・件数確認の対象）。
    return repo.notifications.create({
      userId: input.userId,
      type: input.type,
      status: "sent",
      slotId: input.slotId ?? null,
      matchId: input.matchId ?? null,
      payload: input.payload,
    });
  }
  // 本番（モック無効）: 実 LINE push は未接続。なりすまし/誤配信防止のため
  // 黙って sent にせず pending で残す（接続時に send→sent/failed を実装）。
  // TODO(LINEチャネル接続時): LINE Messaging push を実行し sent/failed を確定。
  return repo.notifications.create({
    userId: input.userId,
    type: input.type,
    status: "pending",
    slotId: input.slotId ?? null,
    matchId: input.matchId ?? null,
    payload: input.payload,
    error: "line push not configured",
  });
}
