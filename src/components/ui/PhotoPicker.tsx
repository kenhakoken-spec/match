"use client";

import { useId, useRef, useState } from "react";

// File / photo picker per design-system.md §4.3 / §4.7 B.
// - Dashed dropzone-style frame (line.200), camera-or-select.
// - Shows a preview once chosen (object URL); no real upload here — the parent
//   handles uploads via the api client (dummy fallback in dev).
// - Tap target generous. Used by U-12 (身分証) and U-02 (プロフィール写真).

export function PhotoPicker({
  label,
  hint,
  onSelect,
  shape = "rect",
  capture,
}: {
  label: string;
  hint?: string;
  onSelect?: (file: File) => void;
  shape?: "rect" | "avatar";
  capture?: boolean; // hint mobile to open the camera for ID capture
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onSelect?.(file);
  }

  const isAvatar = shape === "avatar";

  return (
    <div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" } : {})}
        onChange={handleChange}
        className="sr-only"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={label}
        className={[
          "group relative flex items-center justify-center overflow-hidden border border-dashed border-line-200 bg-bg-sunken transition-colors hover:border-accent-300 hover:bg-accent-100/40",
          isAvatar
            ? "h-28 w-28 rounded-full"
            : "h-40 w-full rounded-md",
        ].join(" ")}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="選択した画像のプレビュー"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-3 text-center">
            <span
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-200 text-ink-500"
            >
              +
            </span>
            <span className="font-sans text-[13px] font-semibold text-ink-700">
              {label}
            </span>
          </span>
        )}
      </button>
      {fileName ? (
        <p className="mt-1.5 truncate font-sans text-xs text-ink-500">
          選択中: {fileName}
        </p>
      ) : hint ? (
        <p className="mt-1.5 font-sans text-xs leading-relaxed text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
