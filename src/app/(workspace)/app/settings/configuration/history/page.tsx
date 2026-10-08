import { HistoryView } from "@/components/config/history-view";
import { PageFrame } from "@/components/app/page-frame";
import { requireStaff } from "@/lib/auth/gates";
import { loadHistory } from "@/lib/config/screens";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Configuration history" };

export default async function ConfigurationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireStaff();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: layer } = await supabase
    .from("config_layers")
    .select("id")
    .eq("level", "workspace")
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  const entries = layer ? await loadHistory(supabase, layer.id) : [];

  return (
    <PageFrame
      title="Configuration history"
      description="Every change to this workspace's own settings: what changed, who changed it, when, and why."
      breadcrumbs={[
        ...advancedSettingsBreadcrumbs("Configuration", "/app/settings/configuration"),
        { label: "History", href: "/app/settings/configuration/history" },
      ]}
    >
      <div className="max-w-4xl">
        {layer ? (
          <HistoryView
            entries={entries}
            layerId={layer.id}
            basePath="/app/settings/configuration/history"
            compare={{ a: Number(params.a) || undefined, b: Number(params.b) || undefined }}
            canRollback={ctx.org.status !== "closed"}
            timeZone={ctx.org.timezone}
          />
        ) : null}
      </div>
    </PageFrame>
  );
}
