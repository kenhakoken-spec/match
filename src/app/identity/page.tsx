"use client";

// U-12 本人認証 身分証アップロード (STEP0, 必須ゲート) — wireframes.md U-12.
// docType select + front/back image + PII-minimisation copy (REQUIRED):
//   「確認後に削除します」「公開されることはありません」(design-system §4.7 B).
// On submit: upload image(s) → POST /api/identity (status=pending) → status page.
// 「あとで」 makes clear that 応募はできません (skip blocks applying).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceChip } from "@/components/ui/Choice";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { PageBody, StickyFooter } from "@/components/ui/Surface";
import {
  DOC_TYPE_LABELS,
  DOC_TYPE_OPTIONS,
  type IdDocType,
} from "../_lib/types";
import { submitIdentity, uploadIdentityImage } from "../_lib/api";

export default function IdentityUploadPage() {
  const router = useRouter();
  const [docType, setDocType] = useState<IdDocType | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // S11 #6: 表面のみ必須（裏面は廃止）。顔写真付きの表面で年齢・本人確認は足りる。
  const canSubmit = docType !== null && frontFile !== null && !submitting;

  async function handleSubmit() {
    if (!docType || !frontFile) return;
    setSubmitting(true);
    try {
      const { blobRef } = await uploadIdentityImage(frontFile);
      await submitIdentity({ docType, blobRef });
      router.push("/identity/status");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <AppHeader title="本人確認" backHref="/onboarding" />
      <PageBody className="space-y-6">
        <section className="space-y-2">
          <p className="font-sans text-[15px] leading-7 text-ink-700">
            安心してご利用いただくため、本人確認をお願いします。
          </p>
          {/* PII-minimisation note — required for trust (design-system §4.7 B). */}
          <ul className="space-y-1 font-sans text-[13px] leading-relaxed text-ink-500">
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-300">
                ・
              </span>
              年齢確認（18歳以上）を兼ねます
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-300">
                ・
              </span>
              画像は確認後に削除します
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-300">
                ・
              </span>
              公開されることはありません
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">
            身分証の種類
            <span className="ml-1 text-[11px] font-normal text-ink-500">必須</span>
          </h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="身分証の種類" data-testid="doc-type">
            {DOC_TYPE_OPTIONS.map((dt) => (
              <ChoiceChip
                key={dt}
                selected={docType === dt}
                onClick={() => setDocType(dt)}
              >
                {DOC_TYPE_LABELS[dt]}
              </ChoiceChip>
            ))}
          </div>
          <p className="font-sans text-xs text-ink-500">
            顔写真付きの公的書類をご用意ください。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">
            画像をアップロード
            <span className="ml-1 text-[11px] font-normal text-ink-500">必須</span>
          </h2>
          <PhotoPicker
            label="表面を撮影 / 選択"
            capture
            onSelect={setFrontFile}
          />
          <p className="font-sans text-xs leading-relaxed text-ink-500">
            顔写真付きの表面のみで大丈夫です。氏名 / 生年月日 / 顔がはっきり写るように撮影してください。
          </p>
        </section>
      </PageBody>

      <StickyFooter>
        <Button data-testid="identity-submit" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "送信しています…" : "提出する"}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/explore")}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 font-sans text-[13px] text-ink-500 hover:text-ink-700"
        >
          あとで（まず会を見る）
          <span className="text-xs text-ink-300">※ 応募には本人確認が必要です</span>
        </button>
      </StickyFooter>
    </div>
  );
}
