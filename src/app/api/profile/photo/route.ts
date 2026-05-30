// POST /api/profile/photo — 写真アップロード(multipart file)。dev=モックURL。
// 本人のみ。契約§2: Res { photoUrl }。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError, readUploadedFile } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { mockPhotoUrl } from "@/lib/blob-mock";

export const dynamic = "force-dynamic";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  return handle(async () => {
    const authed = await requireUser();
    const file = await readUploadedFile(req);
    if (!file) {
      return jsonError(400, "no_file", "file field is required");
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return jsonError(400, "bad_file_type", "unsupported image type");
    }
    if (file.size > MAX_BYTES) {
      return jsonError(400, "file_too_large", "image exceeds 8MB");
    }

    // dev: 実体は保存せずモックURLを生成。
    const photoUrl = mockPhotoUrl(file);

    const repo = getRepo();
    // プロフィール未作成でも写真URLは保持できるよう、存在時のみ反映。
    // (プロフィール作成は PUT /api/profile が担う)
    await repo.profiles.setPhotoUrl(authed.id, photoUrl);

    return jsonOk({ photoUrl });
  });
}
