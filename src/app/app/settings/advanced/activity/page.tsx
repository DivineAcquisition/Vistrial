import { PageFrame } from "@/components/app/page-frame";
import { ActivityLog } from "@/app/app/settings/advanced/activity-log";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { SETTINGS_SECTIONS } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";

export default async function AdvancedActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; person?: string }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("settings_activity")
    .select("id, created_at, actor_label, actor_kind, section, action, from_value, to_value, actor_member_id")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (params.section && (SETTINGS_SECTIONS as readonly string[]).includes(params.section)) {
    query = query.eq("section", params.section);
  }
  if (params.person) {
    query = query.eq("actor_member_id", params.person);
  }

  const [{ data: rows }, { data: members }] = await Promise.all([
    query,
    supabase.from("org_members").select("id, display_name").eq("org_id", ctx.org.id).order("display_name"),
  ]);

  return (
    <PageFrame
      title="Activity log"
      description="Every configuration change, connect or disconnect, member change, bulk re-score, sequence halt, and agent write. Read-only."
    >
      <ActivityLog
        rows={rows ?? []}
        members={members ?? []}
        section={params.section ?? ""}
        person={params.person ?? ""}
      />
    </PageFrame>
  );
}
