import { PageFrame } from "@/components/app/page-frame";
import { ScribeQuality, type QualityRunRow } from "@/app/(workspace)/app/agents/simulator/scribe-quality";
import { SimulatorControls } from "@/app/(workspace)/app/agents/simulator/simulator-controls";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { SCENARIO_LABEL, SIMULATION_SCENARIOS } from "@/lib/live/simulator";
import { QUALITY_TEMPLATES } from "@/lib/scribe/quality/samples";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent simulator" };

/**
 * Platform Admin only. Fake agent activity for rehearsing the live screens.
 * It refuses to run anywhere but a workspace marked for testing, and every
 * run it makes is labelled as a simulation.
 */
export default async function SimulatorPage() {
  const ctx = await requirePlatformAdmin();
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [{ data }, { data: quality }] = await Promise.all([
    admin.from("organizations").select("is_test_workspace").eq("id", ctx.org.id).maybeSingle(),
    admin
      .from("scribe_quality_runs")
      .select("id, template_slug, created_at, passed, extract_model, metrics")
      .order("created_at", { ascending: false })
      .limit(9),
  ]);
  const runs: QualityRunRow[] = ((quality ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    template: String(row.template_slug),
    createdAt: String(row.created_at),
    passed: row.passed === true,
    model: (row.extract_model as string | null) ?? null,
    metrics: (row.metrics ?? {}) as QualityRunRow["metrics"],
  }));
  const isTest = (data as { is_test_workspace?: boolean } | null)?.is_test_workspace === true;

  return (
    <PageFrame
      title="Agent simulator"
      description="Plays scripted agent runs so the live screens can be checked end to end. Nothing leaves Vistrial."
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: "/app/agents/simulator", label: "Simulator" },
      ]}
    >
      <SimulatorControls
        workspaceName={ctx.org.name}
        isTest={isTest}
        scenarios={SIMULATION_SCENARIOS.map((id) => ({ id, label: SCENARIO_LABEL[id] }))}
      />
      <ScribeQuality templates={[...QUALITY_TEMPLATES]} runs={runs} />
    </PageFrame>
  );
}
