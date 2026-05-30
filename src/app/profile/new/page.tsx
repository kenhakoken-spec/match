// U-02 プロフィール登録 (STEP1) — shown after identity approved.
// Uses the shared ProfileForm in "create" mode.

import { ProfileForm } from "@/components/ProfileForm";

export default function ProfileNewPage() {
  return <ProfileForm mode="create" />;
}
