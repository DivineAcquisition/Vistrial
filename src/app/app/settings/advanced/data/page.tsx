import { PageFrame } from "@/components/app/page-frame";
import { DataPrivacyForms } from "@/app/app/settings/advanced/data-forms";
import { AdvancedWriteLock } from "@/components/app/advanced-write-lock";
import { requireOwner } from "@/lib/auth/gates";
import { connectedProcessors } from "@/lib/settings/processors";
import { loadAdvancedAccess } from "@/lib/settings/org";
import { createClient } from "@/lib/supabase/server";

export default async function AdvancedDataPage() {
  const ctx = await requireOwner();
  const access = await loadAdvancedAccess(ctx);
  const supabase = await createClient();
  const [{ data: org }, { data: profile }, { data: connection }, { data: members }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, transcript_retention_days, sms_emergencies_enabled")
      .eq("id", ctx.org.id)
      .maybeSingle(),
    supabase.from("business_profiles").select("aggregate_opt_out").eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("ghl_connections").select("status").eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
  ]);

  const userIds = [...new Set((members ?? []).map((row) => row.user_id))];
  const { count: pushCount } =
    userIds.length > 0
      ? await supabase
          .from("notification_push_subscriptions")
          .select("id", { count: "exact", head: true })
          .in("user_id", userIds)
      : { count: 0 };

  return (
    <PageFrame
      title="Data and privacy"
      description="Retention, export, deletion, aggregate opt-out, and the processors this workspace uses."
    >
      <AdvancedWriteLock locked={!access.writable}>
        <DataPrivacyForms
          orgName={org?.name ?? ctx.org.name}
          transcriptRetentionDays={org?.transcript_retention_days ?? 365}
          aggregateOptOut={profile?.aggregate_opt_out ?? false}
          processors={connectedProcessors({
            crmConnected: connection?.status === "active",
            smsEmergenciesEnabled: org?.sms_emergencies_enabled ?? false,
            hasPushSubscriptions: (pushCount ?? 0) > 0,
          })}
        />
      </AdvancedWriteLock>
    </PageFrame>
  );
}
