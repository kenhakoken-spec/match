"use client";

// U-03 プロフィール編集 — same layout as U-02, footer label "変更を保存".
// Loads the current profile via GET /api/me (dummy fallback in dev) and seeds
// the shared ProfileForm in "edit" mode.

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ProfileForm } from "@/components/ProfileForm";
import { LoadingState } from "@/components/States";
import { getMe } from "@/app/_lib/api";
import type { ProfileDTO } from "@/app/_lib/types";

export default function ProfileEditPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);

  useEffect(() => {
    let active = true;
    getMe().then((me) => {
      if (!active) return;
      setProfile(me.profile);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader title="プロフィール編集" backHref="/mypage" />
        <LoadingState />
      </div>
    );
  }

  return <ProfileForm mode="edit" initial={profile} />;
}
