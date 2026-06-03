"use client";

// Shared profile form for U-02 (登録) and U-03 (編集) — wireframes.md U-02 + S12 刷新.
// Same layout; only the footer label differs ("この内容で登録する" / "変更を保存").
//
// S12 刷新:
//  - #8 写真→アイコン: 写真アップロードを廃し、プリセットアイコン(10種)から選ぶ。
//  - #6 職業フリー入力: enum 選択ではなく自由入力(最大40字・任意)。
//  - #1 性別重複排除: 登録(create)では性別UIを出さない(onboardingで取得済み=
//    sessionStorage の値、または既存 gender を内部で使う)。編集(edit)では変更可。
//
// Required(刷新後): アイコン / 表示名 / 性別(内部で確定) / 生年月日 / 希望エリア1つ以上.
// 18+ は CLIENT 側でブロック(inline)＋サーバ 400 code:"under_age" も surface する
// (design-system §4.3, contract §2)。gender は 3対3 判定の根幹なので、登録でも
// 値は必須(ただし入力UIは onboarding に一本化)。

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";
import { ChoiceChip, SegmentedChoice } from "@/components/ui/Choice";
import { FieldError, FieldLabel, TextArea, TextField } from "@/components/ui/Field";
import { ProfileIconPicker } from "@/components/profile/ProfileIcon";
import { PageBody, StickyFooter } from "@/components/ui/Surface";
import {
  AREA_LABELS,
  AREA_ORDER,
  GENDER_LABELS,
  type Area,
  type Gender,
  type ProfileDTO,
} from "@/app/_lib/types";
import { ApiCallError, saveProfile } from "@/app/_lib/api";
import { isAdult, parseBirthdate, toBirthdateString } from "@/app/_lib/date";
import { getOnboardingGender } from "@/app/_lib/onboarding-gender";
import { isValidIconKey, type IconKey } from "@/lib/icons";

const BIO_MAX = 120; // wireframe shows 0/120 counter (contract allows up to 500)
const NAME_MAX = 32;
const OCCUPATION_MAX = 40; // S12 #6: 自由入力の最大文字数(schema occupationText と一致)

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

  // S12 #8: 写真ではなくアイコン。既存 iconKey があれば初期選択。
  const [iconKey, setIconKey] = useState<IconKey | null>(
    isValidIconKey(initial?.iconKey) ? initial!.iconKey : null,
  );
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [year, setYear] = useState(initialBd ? String(initialBd.getFullYear()) : "");
  const [month, setMonth] = useState(
    initialBd ? String(initialBd.getMonth() + 1) : "",
  );
  const [day, setDay] = useState(initialBd ? String(initialBd.getDate()) : "");
  const [areas, setAreas] = useState<Area[]>(initial?.areaPref ?? []);
  const [bio, setBio] = useState(initial?.bio ?? "");
  // S12 #6: 職業の自由入力(任意)。
  const [occupationText, setOccupationText] = useState(
    initial?.occupationText ?? "",
  );

  // sessionStorage 読み取り後か(SSRハイドレーション不一致回避＋未取得案内の出し分け)。
  const [genderResolved, setGenderResolved] = useState(mode !== "create");

  // 登録(create)時のみ、オンボーディングで先行入力した性別を内部で反映(s9 §4.4 / S12 #1)。
  // 登録画面では性別UIを出さない(重複排除)。sessionStorage はクライアントのみ →
  // マウント後に読む(SSRのハイドレーション不一致回避)。既に値があれば上書きしない。
  // 最終的に Profile.gender が正。
  useEffect(() => {
    if (mode !== "create") return;
    if (!initial?.gender) {
      const pre = getOnboardingGender();
      if (pre) setGender((cur) => cur ?? pre);
    }
    setGenderResolved(true);
    // 初回マウント時のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const ageErrorRef = useRef<HTMLDivElement>(null);

  const birthdate = toBirthdateString(year, month, day);
  const birthdateDate = birthdate ? parseBirthdate(birthdate) : null;

  // Client-side 18+ control (server remains authoritative).
  const underAge = birthdateDate ? !isAdult(birthdateDate) : false;

  const iconOk = iconKey !== null;
  // 登録では gender は onboarding 由来で内部確定。値が無い場合のみ要求(後述の inline 案内)。
  const genderOk = gender !== null;

  const requiredOk = useMemo(
    () =>
      iconOk &&
      displayName.trim().length >= 1 &&
      genderOk &&
      birthdate !== null &&
      !underAge &&
      areas.length >= 1,
    [iconOk, displayName, genderOk, birthdate, underAge, areas],
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
    if (!requiredOk || !gender || !birthdate || !iconKey) return;

    setSubmitting(true);
    try {
      await saveProfile({
        displayName: displayName.trim(),
        gender,
        birthdate,
        areaPref: areas,
        bio: bio.trim() || undefined,
        iconKey,
        occupationText: occupationText.trim() || undefined,
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
    // 外枠は全幅。本文(PageBody)とフッタ(StickyFooter)が各自 480px 中央を担保する
    // (s11-visual: 帯は全幅・中身は 480px。ここで max-w を付けると帯まで縮むため付けない)。
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader
        title={headerTitle}
        backHref={backHref}
        progress={mode === "create" ? "1/1" : undefined}
      />
      <PageBody className="space-y-7">
        {/* アイコン選択 — 最上位(写真の置換 / S12 #8)。線画10種から1つ選ぶ。 */}
        <section className="flex flex-col items-center gap-3">
          <div className="text-center">
            <p className="font-sans text-[13px] font-semibold text-ink-700">
              アイコン
              <span className="ml-1 text-[11px] font-normal text-ink-500">
                必須
              </span>
            </p>
            <p className="mt-0.5 font-sans text-xs text-ink-500">
              お好きなものを1つ選んでください。写真の登録は不要です。
            </p>
          </div>
          <div className="w-full">
            <ProfileIconPicker value={iconKey} onChange={setIconKey} />
          </div>
          {showErrors && !iconOk ? (
            <FieldError>アイコンを選んでください。</FieldError>
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

        {/* 性別: 登録(create)では出さない(onboardingで取得済み / S12 #1 重複排除)。
            編集(edit)では後から変更可。 */}
        {mode === "edit" ? (
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
              男女の組み合わせの判定に使用します。
            </p>
            {showErrors && gender === null ? (
              <FieldError>性別を選択してください。</FieldError>
            ) : null}
          </div>
        ) : genderResolved && gender === null ? (
          // 登録で onboarding の性別が取得できていない例外時の導線(直接遷移などの保険)。
          // ボタンは未充足で無効のため、理由と戻り口を常時提示する。
          <div className="rounded-md border border-state-warn/45 bg-[#F7EFD9] p-3.5">
            <p className="font-sans text-[14px] font-semibold text-state-warn">
              性別が未設定です
            </p>
            <p className="mt-1 font-sans text-[13px] text-ink-700">
              最初の「性別の選択」からやり直してください。男女のバランス調整に使用します。
            </p>
            <a
              href="/onboarding"
              className="mt-2 inline-block font-sans text-[13px] font-semibold text-accent-600 underline"
            >
              性別の選択へ
            </a>
          </div>
        ) : null}

        {/* 職業（自由入力・任意 / S12 #6） */}
        <TextField
          label="職業"
          name="occupationText"
          value={occupationText}
          maxLength={OCCUPATION_MAX}
          placeholder="例）IT・エンジニア / 看護師 / 大学生"
          onChange={(e) => setOccupationText(e.target.value)}
          counter={{ value: occupationText.length, max: OCCUPATION_MAX }}
          hint="自由に入力できます。マッチした相手にのみ表示されます。"
        />

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
          hint="マッチが成立した相手にのみ表示されます。"
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
