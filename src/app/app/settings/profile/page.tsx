import { PageFrame } from "@/components/app/page-frame";
import { ProfileForm } from "@/app/app/settings/profile/profile-form";
import { getAuthContext } from "@/lib/auth/session";

export default async function ProfileSettingsPage() {
  const ctx = await getAuthContext();

  return (
    <PageFrame title="Profile" description="Your name, email, and password.">
      <ProfileForm
        displayName={ctx.member.displayName}
        email={ctx.member.email}
        signInEmail={ctx.user.email ?? ctx.member.email}
      />
    </PageFrame>
  );
}
