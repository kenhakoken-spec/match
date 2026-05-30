// =============================================================================
// POST /api/admin/venues/[id]/choose — 候補を採用(chosen)し会場を確定する。
//   要望2: 殿が候補から1つ選ぶ → chosen 化 → Match.setVenue で会場確定。
//   既存の会場確定フロー（POST /api/admin/matches/[id]/venue → Match.setVenue）と整合
//   （同じ repo.matches.setVenue を通す＝status=venue_set / confirmedAt=now）。
//   role=admin を **サーバ側で** 検証（requireAdmin）。
//
//   予約名(reservationName)は別途 admin 入力（必須）。会場名/URLは省略時に候補から転記。
//   venueUrl は http(s) のみ許可（XSS スキーム対策）。店名/予約名はサニタイズ。
//
//   - 候補が無い → 404。
//   - 候補が suggested 以外（既に chosen/rejected）→ 409 candidate_not_suggestable。
//   - 枠の Match が無い → 404 match_not_found。
//   - Match が notified/canceled（確定不可）→ 409 match_not_settable。
//   Req: { reservationName, venueName?, venueUrl?, meetingPlace? }
//   Res: { candidate: VenueCandidateDTO, match: AdminMatchDetailDTO }
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { chooseVenueCandidate } from "@/lib/venue-service";
import { toVenueCandidateDTO, toAdminMatchDetailDTO } from "@/lib/serializers";
import { getMatchMembers } from "@/lib/match-service";
import { sanitizeText } from "@/lib/validation";

export const dynamic = "force-dynamic";

// venueUrl: http/https のみ許可（javascript: 等のスキームを弾く）。空文字は null 扱い。
const venueUrlSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .max(2048, "venueUrl too long")
      .refine(
        (s) => s === "" || /^https?:\/\//i.test(s),
        "venueUrl must be an http(s) URL"
      )
  );

const chooseSchema = z.object({
  reservationName: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, "reservationName is required")
        .max(200, "reservationName too long")
    ),
  venueName: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(1).max(200, "venueName too long"))
    .optional(),
  venueUrl: venueUrlSchema.optional().nullable(),
  meetingPlace: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(280, "meetingPlace too long"))
    .optional()
    .nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const input = chooseSchema.parse(body); // 不正は handle が 400 に変換。

    const result = await chooseVenueCandidate(params.id, {
      reservationName: input.reservationName,
      venueName: input.venueName,
      // 空文字 venueUrl は null に正規化（候補から転記したくない明示クリア）。
      venueUrl:
        input.venueUrl === undefined
          ? undefined
          : input.venueUrl === ""
          ? null
          : input.venueUrl,
      meetingPlace: input.meetingPlace ?? null,
    });

    if (result.error === "candidate_not_found") {
      return jsonError(404, "not_found", "venue candidate not found");
    }
    if (result.error === "match_not_found") {
      return jsonError(404, "match_not_found", "match not found for slot");
    }
    if (result.error === "candidate_not_suggestable") {
      return jsonError(
        409,
        "candidate_not_suggestable",
        "candidate is not in suggested state"
      );
    }
    if (result.error === "match_not_settable") {
      return jsonError(
        409,
        "match_not_settable",
        "match cannot accept a venue (notified or canceled)"
      );
    }
    if (!result.candidate || !result.match) {
      return jsonError(500, "internal_error", "venue choose failed");
    }

    // 確定後の Match を admin 詳細 DTO で返す（既存 venue ルートと同じ返却形）。
    const repo = getRepo();
    const slot = await repo.slots.findById(result.match.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }
    const [counts, members] = await Promise.all([
      repo.applications.countActiveByGender(result.match.slotId),
      getMatchMembers(result.match.slotId),
    ]);

    return jsonOk({
      candidate: toVenueCandidateDTO(result.candidate),
      match: toAdminMatchDetailDTO(result.match, slot, counts, members),
    });
  });
}
