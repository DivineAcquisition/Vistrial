import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { InstallSteps } from "@/components/app/install-steps";
import { ProfileForm } from "@/app/app/settings/profile/profile-form";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cardTitle } from "@/lib/ui";

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
      <Panel className="flex flex-col gap-4">
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
    </PageFrame>
  );
}
