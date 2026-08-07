import { CostHero } from "@/components/portal/cost-hero";
import { PortalShell } from "@/components/portal/shell";
import { WeeklySummaryToggle } from "@/components/portal/weekly-toggle";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { requireClient } from "@/lib/auth";
import { loadPortalDashboard } from "@/lib/db/portal";
import { formatDayLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const session = await requireClient();
  const dashboard = await loadPortalDashboard(session.membership.client_id);

  return (
    <PortalShell
      clientName={dashboard.client.name}
      active="/portal"
      readOnly={session.readOnly}
    >
      <PageHeader
        eyebrow="Client portal"
        title={dashboard.client.name}
        description="One number you can trust: the combined cost of every confirmed appointment in the last complete week."
      />

      <CostHero cost={dashboard.cost} />

      {dashboard.definition ? (
        <div className="mt-10">
          <SectionHeader
            title="Appointment definition"
            hint={`Version ${dashboard.definition.version}, effective ${formatDayLong(dashboard.definition.effective_from)}. This is what a confirmed appointment means.`}
          />
          <Panel className="px-5 py-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-silver">
              {dashboard.definition.criteria}
            </p>
          </Panel>
        </div>
      ) : null}

      <div className="mt-10">
        <SectionHeader title="Notifications" />
        <Panel className="px-5 py-4">
          <WeeklySummaryToggle
            enabled={session.membership.weekly_summary}
            disabled={session.readOnly}
          />
        </Panel>
      </div>
    </PortalShell>
  );
}
