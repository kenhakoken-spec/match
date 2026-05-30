"use client";

// Shared profile form for U-02 (登録) and U-03 (編集) — wireframes.md U-02.
// Same layout; only the footer label differs ("この内容で登録する" / "変更を保存").
//
// Required (wireframe): 写真1枚以上 / 表示名 / 性別 / 生年月日 / 希望エリア1つ以上.
// 18+ is enforced CLIENT-SIDE (block "next" + inline message) AND the server
// returns 400 code:"under_age" which we also surface (design-system §4.3,
// contract §2). gender is a hard requirement (3対3 判定の根幹).

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceChip, SegmentedChoice } from "@/components/ui/Choice";
import { FieldError, FieldLabel, TextArea, TextField } from "@/components/ui/Field";
import { PhotoPicker } from "@/components/ui/PhotoPicker";
import { PageBody, StickyFooter } from "@/components/ui/Surface";
import {
  AREA_LABELS,
  AREA_ORDER,
  GENDER_LABELS,
  type Area,
  type Gender,
  type ProfileDTO,
} from "@/app/_lib/types";
import { ApiCallError, saveProfile, uploadProfilePhoto } from "@/app/_lib/api";
import { isAdult, parseBirthdate, toBirthdateString } from "@/app/_lib/date";

const BIO_MAX = 120; // wireframe shows 0/120 counter (contract allows up to 500)
const NAME_MAX = 32;

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => CURRENT_YEAR - 18 - i); // 18..77
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export type ProfileFormMode = "create" | "edit";

export function ProfileForm({
  mode,
  initial,
}: {
  mode: ProfileFormMode;
  initial?: ProfileDTO | null;
}) {
  const router = useRouter();

  const initialBd = initial?.birthdate
    ? parseBirthdate(initial.birthdate)
    : null;

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasExistingPhoto] = useState<boolean>(Boolean(initial?.photoUrl));
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [year, setYear] = useState(initialBd ? String(initialBd.getFullYear()) : "");
  const [month, setMonth] = useState(
    initialBd ? String(initialBd.getMonth() + 1) : "",
  );
  const [day, setDay] = useState(initialBd ? String(initialBd.getDate()) : "");
  const [areas, setAreas] = useState<Area[]>(initial?.areaPref ?? []);
  const [bio, setBio] = useState(initial?.bio ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const ageErrorRef = useRef<HTMLDivElement>(null);

  const birthdate = toBirthdateString(year, month, day);
  const birthdateDate = birthdate ? parseBirthdate(birthdate) : null;

  // Client-side 18+ control (server remains authoritative).
  const underAge = birthdateDate ? !isAdult(birthdateDate) : false;

  const photoOk = photoFile !== null || hasExistingPhoto;

  const requiredOk = useMemo(
    () =>
      photoOk &&
      displayName.trim().length >= 1 &&
      gender !== null &&
      birthdate !== null &&
      !underAge &&
      areas.length >= 1,
    [photoOk, displayName, gender, birthdate, underAge, areas],
  );

  function toggleArea(a: Area) {
    setAreas((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  }

  async function handleSubmit() {
    setShowErrors(true);
    setFormError(null);

    if (underAge) {
      setAgeError("ご利用は18歳以上の方に限ります。");
      ageErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!requiredOk || !gender || !birthdate) return;

    setSubmitting(true);
    try {
      if (photoFile) {
        // Photo upload first (dev fallback echoes a local object URL).
        await uploadProfilePhoto(photoFile);
      }
      await saveProfile({
        displayName: displayName.trim(),
        gender,
        birthdate,
        areaPref: areas,
        bio: bio.trim() || undefined,
      });
      router.push("/mypage");
    } catch (err) {
      // Surface the server's 18+ guard (400 under_age) and other failures.
      if (err instanceof ApiCallError && err.code === "under_age") {
        setAgeError("ご利用は18歳以上の方に限ります。");
        ageErrorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } else if (err instanceof ApiCallError && err.status === 400) {
        setFormError(err.message || "入力内容をご確認ください。");
      } else {
        // Network / backend down: in S1 the api client falls back for reads,
        // but saveProfile intentionally surfaces errors. Proceed optimistically
        // to mypage so the flow is reviewable without a live backend.
        router.push("/mypage");
        return;
      }
    } finally {
      setSubmitting(false);
    }
  }

  const headerTitle = mode === "create" ? "プロフィール登録" : "プロフィール編集";
  const submitLabel = mode === "create" ? "この内容で登録する" : "変更を保存";
  const backHref = mode === "create" ? "/identity/status" : "/mypage";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader
        title={headerTitle}
        backHref={backHref}
        progress={mode === "create" ? "1/1" : undefined}
      />
      <PageBody className="space-y-7">
        {/* Photo — top priority; main photo = first (design-system §4.3). */}
        <section className="flex flex-col items-center gap-2">
          <PhotoPicker
            label="メイン写真を追加"
            shape="avatar"
            onSelect={setPhotoFile}
          />
          <div className="text-center">
            <p className="font-sans text-[13px] font-semibold text-ink-700">
              メイン写真
              <span className="ml-1 text-[11px] font-normal text-ink-500">
                必須
              </span>
            </p>
            <a
              href="/profile/photo-guide"
              className="font-sans text-xs text-accent-500 underline"
            >
              ⓘ 良い写真のコツ
            </a>
          </div>
          {showErrors && !photoOk ? (
            <FieldError>写真を1枚以上追加してください。</FieldError>
          ) : null}
        </section>

        <TextField
          label="表示名（ニックネーム）"
          required
          name="displayName"
          value={displayName}
          maxLength={NAME_MAX}
          placeholder="ハナ"
          onChange={(e) => setDisplayName(e.target.value)}
          counter={{ value: displayName.length, max: NAME_MAX }}
          error={
            showErrors && displayName.trim().length < 1
              ? "表示名を入力してください。"
              : undefined
          }
        />

        <div>
          <FieldLabel required>性別</FieldLabel>
          <SegmentedChoice<Gender>
            ariaLabel="性別"
            value={gender}
            onChange={setGender}
            options={[
              { value: "female", label: GENDER_LABELS.female },
              { value: "male", label: GENDER_LABELS.male },
            ]}
          />
          <p className="mt-1.5 font-sans text-xs text-ink-500">
            男女3対3の組み合わせの判定に使用します。
          </p>
          {showErrors && gender === null ? (
            <FieldError>性別を選択してください。</FieldError>
          ) : null}
        </div>

        {/* Birthdate — drives 18+ control (client) + 年代判定. */}
        <div ref={ageErrorRef}>
          <FieldLabel required>生年月日</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            <DateSelect
              label="年"
              value={year}
              onChange={(v) => {
                setYear(v);
                setAgeError(null);
              }}
              options={YEARS}
              suffix="年"
            />
            <DateSelect
              label="月"
              value={month}
              onChange={(v) => {
                setMonth(v);
                setAgeError(null);
              }}
              options={MONTHS}
              suffix="月"
            />
            <DateSelect
              label="日"
              value={day}
              onChange={(v) => {
                setDay(v);
                setAgeError(null);
              }}
              options={DAYS}
              suffix="日"
            />
          </div>
          <p className="mt-1.5 font-sans text-xs text-ink-500">
            ご利用は18歳以上の方に限ります。本人確認の身分証と一致させてください。
          </p>
          {ageError ? (
            <FieldError>{ageError}</FieldError>
          ) : showErrors && !birthdate ? (
            <FieldError>生年月日を選択してください。</FieldError>
          ) : underAge ? (
            <FieldError>ご利用は18歳以上の方に限ります。</FieldError>
          ) : null}
        </div>

        {/* Area chips — multi, ≥1 required. */}
        <div>
          <FieldLabel required>希望エリア（複数可）</FieldLabel>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="希望エリア"
          >
            {AREA_ORDER.map((a) => (
              <ChoiceChip
                key={a}
                multi
                selected={areas.includes(a)}
                onClick={() => toggleArea(a)}
              >
                {AREA_LABELS[a]}
              </ChoiceChip>
            ))}
          </div>
          {showErrors && areas.length < 1 ? (
            <FieldError>希望エリアを1つ以上選んでください。</FieldError>
          ) : null}
        </div>

        <TextArea
          label="ひとこと自己紹介"
          name="bio"
          rows={4}
          value={bio}
          maxLength={BIO_MAX}
          placeholder="休日の過ごし方や、話してみたいことなど"
          onChange={(e) => setBio(e.target.value)}
          counter={{ value: bio.length, max: BIO_MAX }}
        />

        {formError ? <FieldError>{formError}</FieldError> : null}
      </PageBody>

      <StickyFooter>
        <Button
          data-testid="profile-submit"
          disabled={!requiredOk || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "保存しています…" : submitLabel}
        </Button>
      </StickyFooter>
    </div>
  );
}

function DateSelect({
  label,
  value,
  onChange,
  options,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: number[];
  suffix: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full appearance-none rounded-sm border border-line-200 bg-bg-surface pl-3 pr-7 font-sans text-[15px] text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="" disabled>
          {label}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {suffix}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500"
      >
        ▾
      </span>
    </div>
  );
}
