import { PageFrame } from "@/components/app/page-frame";
import { ProfileForm } from "@/app/app/settings/profile/profile-form";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileSettingsPage() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("phone, timezone, working_hours_start, working_hours_end, working_days")
    .eq("id", ctx.member.id)
    .maybeSingle();

  return (
    <PageFrame
      title="Profile"
      description="Your name, timezone, working hours, and how we reach you."
    >
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
    </PageFrame>
  );
}
