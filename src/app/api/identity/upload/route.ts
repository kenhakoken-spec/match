// POST /api/identity/upload — 身分証画像アップロード(multipart file)→一時参照。
// dev=モックblobRef。本人のみ。契約§2: Res { blobRef }。
// dev でもサーバーに画像実体を溜めない(メタのみ→参照文字列)。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError, readUploadedFile } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { mockIdentityBlobRef } from "@/lib/blob-mock";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 12 * 1024 * 1024; // 12MB

export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireUser(); // 本人のみ(セッション必須)
    const file = await readUploadedFile(req);
    if (!file) {
      return jsonError(400, "no_file", "file field is required");
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return jsonError(400, "bad_file_type", "unsupported image type");
    }
    if (file.size > MAX_BYTES) {
      return jsonError(400, "file_too_large", "image exceeds 12MB");
    }
    // 一時 blobRef を返すのみ。承認後に削除される対象。
    const blobRef = mockIdentityBlobRef(file);
    return jsonOk({ blobRef });
  });
}
