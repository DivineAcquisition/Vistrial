import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { Notice } from "@/components/ui/states";
import { ReportingRangeForm } from "@/app/app/reporting/range-form";
import {
  CoveragePanel,
  ObjectionsPanel,
  OutcomePanel,
  SourcesPanel,
  SpeedPanel,
  TerminalPanel,
} from "@/app/app/reporting/panels";
import { ClientSummaryForm } from "@/app/app/reporting/client-summary-form";
import { PortalScheduleForm } from "@/app/portal/schedule-form";
import { AdoptionPanel } from "@/app/portal/panels";
import { requirePortalAccess } from "@/lib/portal/access";
import { loadPortalRpc, loadPortalSchedule } from "@/lib/portal/load";
import { previousEqualRange } from "@/lib/portal/range";
import { buildPortalSummary } from "@/lib/portal/summary";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange, reportingRangeQuery } from "@/lib/reporting/range";
import { helperClass } from "@/lib/ui";

const SOURCE_ERRORS: Record<string, string> = {
  oauth_denied: "The authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start again from this page.",
  oauth_failed: "The connection could not be completed.",
};

const SOURCE_CONNECTED: Record<string, string> = {
  meta_ads: "Meta Ads is connected. Cost per client uses CRM net closes, not platform purchase counts.",
  google_ads: "Google Ads is connected with the read-only scope. Cost per client uses CRM net closes.",
  stripe: "Stripe is connected read-only. Refunds and chargebacks will un-close a deal.",
  calendar: "Calendar is connected. Only availability and booking metadata are stored.",
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePortalAccess();
  const params = await searchParams;
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);

  if (!activatedAt) {
    return (
      <PageFrame
      title="Portal"
      description="Nothing to show until the workspace is activated."
      >
        <p className={helperClass}>
          Activation is a deliberate step. This surface has nothing honest to say before that line.
        </p>
      </PageFrame>
    );
  }

  const previous = previousEqualRange(range, activatedAt);
  const [schedule, outcome, coverage, sourcesPanel, terminal, speed, previousOutcome, previousCoverage, adoption] =
    await Promise.all([
      loadPortalSchedule(ctx.org.id),
      loadReportingPanel(ctx.org.id, "outcome", range),
      loadReportingPanel(ctx.org.id, "coverage", range),
      loadReportingPanel(ctx.org.id, "sources", range),
      loadReportingPanel(ctx.org.id, "terminal", range),
      loadReportingPanel(ctx.org.id, "speed", range),
      previous ? loadReportingPanel(ctx.org.id, "outcome", previous) : Promise.resolve(null),
      previous ? loadReportingPanel(ctx.org.id, "coverage", previous) : Promise.resolve(null),
      loadPortalRpc(ctx.org.id, "portal_adoption", range),
    ]);

  const summary = buildPortalSummary({
    outcome: outcome as never,
    previousOutcome: previousOutcome as never,
    coverage: coverage as never,
    previousCoverage: previousCoverage as never,
    sources: sourcesPanel as never,
    terminal: terminal as never,
    speed: speed as never,
  });
  const query = reportingRangeQuery(range);
  const sourceError = typeof params.source_error === "string" ? params.source_error : "";
  const sourceConnected = typeof params.source_connected === "string" ? params.source_connected : "";

  return (
    <PageFrame
      title="Portal"
      description="How many leads became clients, whether the team is using this, where deals are dying, and what to do about it."
    >
      {sourceError ? (
        <Notice tone="warning" className="mb-6">
          {SOURCE_ERRORS[sourceError] ?? SOURCE_ERRORS.oauth_failed}
        </Notice>
      ) : null}
      {sourceConnected && SOURCE_CONNECTED[sourceConnected] ? (
        <Notice tone="success" className="mb-6">
          {SOURCE_CONNECTED[sourceConnected]}
        </Notice>
      ) : null}
      <ReportingRangeForm range={range} action="/portal" />

      <section className="space-y-8">
        <SectionHeader title="Is it working" hint="Clients closed per hundred leads, coverage, and speed. Sample sizes sit beside every rate." />
        <OutcomePanel orgId={ctx.org.id} range={range} />
        <CoveragePanel orgId={ctx.org.id} range={range} />
        <SpeedPanel orgId={ctx.org.id} range={range} />
      </section>

      <section className="space-y-8">
        <AdoptionPanel payload={adoption} />
      </section>

      <section className="space-y-8">
        <SectionHeader title="Where money is leaking" hint="Each cause has a different fix. Lumping them as lost hides which one to work on." />
        <TerminalPanel orgId={ctx.org.id} range={range} />
        <ObjectionsPanel orgId={ctx.org.id} range={range} hideMemberBreakdown />
        <SourcesPanel orgId={ctx.org.id} range={range} />
      </section>

      <section>
        <Panel className="p-6">
          <SectionHeader
            title="What to do about it"
            hint="Review before export. If the period was uneventful, the copy says so."
          />
          <ClientSummaryForm summary={summary} query={query} action={`/portal/export/pdf?${query}`} />
        </Panel>
      </section>

      <section>
        <Panel className="p-6">
          <SectionHeader title="Email this report" hint="The cheapest referral mechanism the product has is a PDF that gets forwarded." />
          <PortalScheduleForm
            cadence={schedule.cadence}
            enabled={schedule.enabled}
            lastSentAt={schedule.lastSentAt}
            lastError={schedule.lastError}
          />
        </Panel>
      </section>
    </PageFrame>
  );
}
