import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { InstallSteps } from "@/components/app/install-steps";
import { ProfileForm } from "@/app/(workspace)/app/settings/profile/profile-form";
import {
  DeliveryForm,
  PasswordForm,
  PhotoForm,
  SignOutOthersForm,
} from "@/app/(workspace)/app/settings/profile/personal-forms";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { avatarUrls } from "@/lib/portal/avatars";
import { createClient } from "@/lib/supabase/server";
import { cardTitle } from "@/lib/ui";

export default async function ProfileSettingsPage() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("phone, timezone, working_hours_start, working_hours_end, working_days, avatar_path, notification_delivery")
    .eq("id", ctx.member.id)
    .maybeSingle();
  const photos = await avatarUrls(ctx.org.id, [data?.avatar_path]);
  const photoUrl = data?.avatar_path ? (photos.get(data.avatar_path) ?? null) : null;

  return (
    <PageFrame
      title="Profile"
      description="Your name, photo, timezone, working hours, how we reach you, and your sign-in."
    >
      <h2 className={cardTitle}>Photo</h2>
      <PhotoForm name={ctx.member.displayName} photoUrl={photoUrl} />
      <Panel className="mb-8 space-y-4 p-6">
        <h2 className={cardTitle}>This phone</h2>
        <InstallSteps />
        <Button variant="secondary" size="sm" className="inline-flex" render={<Link href="/app/install" />}>
          Open install instructions
        </Button>
      </Panel>
      <ProfileForm
        displayName={ctx.member.displayName}
        email={ctx.member.email}
        signInEmail={ctx.user.email ?? ctx.member.email}
        phone={data?.phone ?? null}
        timezone={data?.timezone ?? null}
        workingHoursStart={data?.working_hours_start?.slice(0, 5) ?? null}
        workingHoursEnd={data?.working_hours_end?.slice(0, 5) ?? null}
        workingDays={data?.working_days ?? []}
      />
      <h2 className={`${cardTitle} mt-8`}>Account emails</h2>
      <DeliveryForm delivery={data?.notification_delivery === "digest" ? "digest" : "instant"} />
      <h2 className={`${cardTitle} mt-8`}>Security</h2>
      <PasswordForm />
      <SignOutOthersForm />
    </PageFrame>
  );
}
