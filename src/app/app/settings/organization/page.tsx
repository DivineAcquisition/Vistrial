import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { ContactDetailsForm } from "@/app/app/settings/organization/contact-form";
import { requireOwnerOrStaff } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage() {
  const { org, isStaff } = await requireOwnerOrStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("working_hours_start, working_hours_end, working_days, owner_contact_name, owner_contact_email, owner_contact_phone")
    .eq("id", org.id)
    .maybeSingle();

  const contact = (
    <ContactDetailsForm
      name={data?.owner_contact_name ?? null}
      email={data?.owner_contact_email ?? null}
      phone={data?.owner_contact_phone ?? null}
    />
  );

  if (!isStaff) {
    return (
      <PageFrame
        title="Workspace"
        description="Who we contact about this business. Everything else here is set up by your Vistrial team."
      >
        {contact}
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Workspace"
      description="Name, timezone, and working hours. Connect apps on Integrations."
    >
      <OrganizationForm
        name={org.name}
        timezone={org.timezone}
        ghlLocationId={org.ghlLocationId}
        salesCycleDays={60}
        baselineLookbackDays={365}
        workingHoursStart={data?.working_hours_start?.slice(0, 5) ?? "08:00"}
        workingHoursEnd={data?.working_hours_end?.slice(0, 5) ?? "18:00"}
        workingDays={data?.working_days ?? [1, 2, 3, 4, 5]}
        transcriptRetentionDays={365}
        callCoachingEmbargoHours={48}
        operatorAgentBatchCap={10}
        surface="workspace"
      />
      <div className="mt-8">{contact}</div>
    </PageFrame>
  );
}
