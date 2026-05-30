// =============================================================================
// matching-app — Blob storage (S1 = MOCK)
// 契約§0: dev では画像アップロードは data: URL かプレースホルダ参照を返す。
// 本番は Vercel Blob(アクセス制限)へ差し替え。身分証は承認後に削除する。
// dev でもサーバーに画像実体を保存しない(メタのみ受けて参照文字列を返す)。
// =============================================================================

import crypto from "node:crypto";

/** プロフィール写真のモックURL(プレースホルダ)。 */
export function mockPhotoUrl(meta: { name: string; type: string }): string {
  const id = crypto.randomBytes(8).toString("hex");
  // 推測困難な参照。実体は保存しない(dev mock)。
  return `https://blob.mock.local/photos/${id}`;
}

/** 身分証画像のモック blobRef(一時参照)。承認後に削除される対象。 */
export function mockIdentityBlobRef(meta: { name: string; type: string }): string {
  const id = crypto.randomBytes(12).toString("hex");
  return `mock-blob://identity/${id}`;
}
