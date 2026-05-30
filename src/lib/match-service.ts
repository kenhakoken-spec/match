// =============================================================================
// matching-app — S3 成立(Match)サービス（route ↔ domain/repo の橋渡し）
// 認証/認可・入力検証は route 側で済ませた前提。副作用のある集約はここに閉じ、
// 判定/文面の純ロジックは domain/match.ts（テスト対象）に委譲する。
// 正典: docs/backend/api-contract-s3.md §1,§2 / docs/backend/matching-logic.md §4,§5
//        / docs/backend/notification.md §2.1,§3
// =============================================================================

import "server-only";
import { buildVenueMessage } from "@/lib/domain/match";
import { getRepo } from "@/lib/repo";
import { sendNotification } from "@/lib/notify-mock";
import { suggestVenuesForSlot } from "@/lib/venue-service";
import type {
  MatchEntity,
  SlotEntity,
  MatchMemberRow,
} from "@/lib/repo";

/**
 * 成立確定（S2 の applyAtomic で枠が filled になった直後に呼ぶ）。
 * 冪等: 既に Match があれば再作成・再通知しない（二重通知の防止）。
 *
 * 手順（matching-logic.md §4 step6-7）:
 *  1. Match を生成（status=pending_venue, matchedAt=now）。slotId 一意で冪等。
 *  2. 6名の Application を applied→accepted に確定。
 *  3. 運営(admin)へ内部通知 match_to_admin を NotificationLog に記録。
 *
 * 通知は外部I/O相当のため、応募処理本体（route）が失敗してもログとして残す。
 * 戻り値は確定した Match。
 */
export async function finalizeMatchOnApply(slotId: string): Promise<MatchEntity> {
  const repo = getRepo();

  // 1. 冪等な Match 生成。
  const existing = await repo.matches.findBySlotId(slotId);
  const match = existing ?? (await repo.matches.createForSlot(slotId));

  // 既に通知済み/会場確定済みなら、確定処理を二重に走らせない。
  // （pending_venue のときだけ accept + admin 通知を行う。）
  if (match.status !== "pending_venue") {
    return match;
  }

  // 2. 6名を accepted に確定。
  await repo.applications.acceptAllActiveBySlot(slotId);

  // 3. 運営内部通知（match_to_admin）。既に同じ match の通知があれば二重送信しない。
  const already = await repo.notifications.listByMatch(match.id, "match_to_admin");
  if (already.length === 0) {
    const slot = await repo.slots.findById(slotId);
    const admins = await listAdmins();
    for (const adminId of admins) {
      await sendNotification({
        userId: adminId,
        type: "match_to_admin",
        slotId,
        matchId: match.id,
        // PII最小: 運用情報のみ（lineUserId/個人名は入れない）。
        payload: {
          kind: "match_to_admin",
          slotId,
          matchId: match.id,
          area: slot?.area ?? null,
          datetimeStart: slot ? slot.datetimeStart.toISOString() : null,
          message: "枠が成立しました。会場を手配してください。",
        },
      });
    }
  }

  // 4. S8 要望2: 成立時に会場候補を自動生成し運営へ通知する（候補出し + 通知の自動化）。
  //    冪等（suggestVenuesForSlot 内で既存候補があれば再生成しない）。失敗は成立本体を
  //    巻き込まない（候補レコメンドは付随処理）ため try/catch でログのみに留める。
  try {
    await suggestVenuesForSlot(slotId, "system");
  } catch {
    // 候補生成の失敗で成立確定を失敗扱いにしない（運営は手動 suggest で再試行可能）。
  }

  return match;
}

/**
 * 運営宛通知の宛先（admin の userId 群）を解決する。
 * Repo に admin 列挙の専用APIが無いため、findById ベースの seed-admin を起点に
 * 既知の admin を集める。実DBでは users.role=admin を引く実装に差し替える想定。
 */
async function listAdmins(): Promise<string[]> {
  const repo = getRepo();
  // seed/dev では admin は "seed-admin"。存在すれば対象に含める。
  const seedAdmin = await repo.users.findById("seed-admin");
  const ids = new Set<string>();
  if (seedAdmin && seedAdmin.role === "admin") ids.add(seedAdmin.id);
  return [...ids];
}

/**
 * 成立メンバー（accepted/applied の有効応募者）の最小情報を解決する。
 * PII最小: userId/displayName/gender のみ（lineUserId は引かない）。
 */
export async function getMatchMembers(slotId: string): Promise<MatchMemberRow[]> {
  const repo = getRepo();
  const apps = await repo.applications.listActiveBySlot(slotId);
  const rows: MatchMemberRow[] = [];
  for (const a of apps) {
    const user = await repo.users.findById(a.userId);
    rows.push({
      userId: a.userId,
      // displayName は表示用のみ。lineUserId は **取得も保持もしない**。
      displayName: user?.displayName ?? null,
      gender: a.gender,
    });
  }
  return rows;
}

/**
 * 6名へ会場確定通知（venue_to_member）を送る。
 * 前提: route 側で「match が venue_set」「会場入力済み」を検証済み。
 *
 * 手順（notification.md §3）:
 *  1. 各メンバーへ venue_to_member を NotificationLog に記録（MOCK は status=sent）。
 *     payload は運用情報のみ（datetimeStart/area/venueName/venueUrl/reservationName/meetingPlace）。
 *     文面 text は buildVenueMessage（純関数）で生成（6要素を含む）。
 *  2. Match を notified に、Slot を confirmed に更新。
 *
 * 戻り値: { notified: 送信件数, recipients: 宛先 userId }。
 */
export async function notifyMatchMembers(
  match: MatchEntity,
  slot: SlotEntity
): Promise<{ notified: number; recipients: string[] }> {
  const repo = getRepo();
  const members = await getMatchMembers(slot.id);

  // 会場文面（6要素）。reservationName は venue_set 時に必須化済み。
  const text = buildVenueMessage({
    datetimeStart: slot.datetimeStart,
    area: slot.area,
    venueName: match.venueName ?? "",
    venueUrl: match.venueUrl,
    reservationName: match.reservationName ?? "",
    meetingPlace: match.meetingPlace,
  });

  const recipients: string[] = [];
  for (const m of members) {
    await sendNotification({
      userId: m.userId,
      type: "venue_to_member",
      slotId: slot.id,
      matchId: match.id,
      // PII最小: 運用情報のみ。lineUserId/個人名/誕生日は入れない（予約名は運用情報として可）。
      payload: {
        kind: "venue_to_member",
        datetimeStart: slot.datetimeStart.toISOString(),
        area: slot.area,
        venueName: match.venueName,
        venueUrl: match.venueUrl,
        reservationName: match.reservationName,
        meetingPlace: match.meetingPlace,
        text,
      },
    });
    recipients.push(m.userId);
  }

  // Match=notified, Slot=confirmed（契約§2）。
  await repo.matches.markNotified(match.id);
  await repo.slots.setStatus(slot.id, "confirmed");

  return { notified: recipients.length, recipients };
}

/**
 * あるユーザーが成立(match)の参加者かを判定する（IDOR防止の要）。
 * accepted/applied のいずれかでその枠に有効応募があれば参加者とみなす。
 */
export async function isMatchParticipant(
  slotId: string,
  userId: string
): Promise<boolean> {
  const repo = getRepo();
  const app = await repo.applications.findBySlotAndUser(slotId, userId);
  return (
    app !== null && (app.status === "applied" || app.status === "accepted")
  );
}
