import { Suspense } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { NavTabs } from "@/components/ui/tabs";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/states";
import { loadReportingPanel } from "@/lib/reporting/load";
import type { ReportingRange } from "@/lib/reporting/range";
import { reportingRangeQuery } from "@/lib/reporting/range";
import {
  formatComputedAt,
  formatCount,
  formatMinutes,
  formatPerHundred,
  formatPct,
  formatSample,
} from "@/lib/reporting/format";
import { goalLine } from "@/lib/profile/goal";
import { loadStatedGoal } from "@/lib/profile/load";
import { helperClass } from "@/lib/ui";
import { FOLLOW_UP_BRANCH_LABELS, HALT_REASON_LABELS } from "@/lib/follow-up/labels";
import { OBJECTION_TYPE_LABELS } from "@/lib/leads/labels";
import type { FollowUpBranch } from "@/lib/follow-up/types";
import type { Enums } from "@/types/database";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function rateOf(value: unknown) {
  const row = asRecord(value);
  return {
    k: num(row.k) ?? 0,
    n: num(row.n) ?? 0,
    perHundred: num(row.per_hundred),
    pct: num(row.pct),
    tooSmall: bool(row.too_small),
    sample: str(row.sample_label) ?? formatSample(num(row.k) ?? 0, num(row.n) ?? 0),
  };
}

function Computed({ payload }: { payload: Record<string, unknown> }) {
  return (
    <p className={helperClass}>
      Last computed {formatComputedAt(str(payload.last_computed_at))} ·{" "}
      {str(payload.source) === "cache" ? "hourly cache" : "computed for this range"}
    </p>
  );
}

function ReportBlocked({ title, payload }: { title: string; payload: Record<string, unknown> }) {
  const faults = Array.isArray(payload.faults)
    ? (payload.faults as Array<{ what?: unknown }>)
        .map((item) => (typeof item.what === "string" ? item.what : null))
        .filter((item): item is string => Boolean(item))
    : [];
  return (
    <Panel className="p-6">
      <SectionHeader title={title} hint="Not displayed." />
      <Notice tone="critical">
        This report is not shown. {faults.length ? faults.join(" ") : "The numbers failed a consistency check."} DA
        has been alerted.
      </Notice>
    </Panel>
  );
}

function PanelFallback({ title }: { title: string }) {
  return (
    <Panel className="p-6">
      <SectionHeader title={title} hint="Loading this panel." />
      <p className="text-sm text-dim">Computing from the database…</p>
    </Panel>
  );
}

export function ReportingPanels({
  orgId,
  range,
  includeTeam,
  includeIngestion = false,
}: {
  orgId: string;
  range: ReportingRange;
  includeTeam: boolean;
  includeIngestion?: boolean;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<PanelFallback title="Outcome" />}>
        <OutcomePanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="Coverage" />}>
        <CoveragePanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="Throughput" />}>
        <ThroughputPanel orgId={orgId} range={range} />
      </Suspense>
      {includeTeam ? (
        <Suspense fallback={<PanelFallback title="Team" />}>
          <TeamPanel orgId={orgId} range={range} />
        </Suspense>
      ) : null}
      <Suspense fallback={<PanelFallback title="Follow-up" />}>
        <FollowUpPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="Objections" />}>
        <ObjectionsPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="Source quality" />}>
        <SourcesPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="Where deals die" />}>
        <TerminalPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="How long they waited" />}>
        <SpeedPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="How ready they were" />}>
        <ReadinessPanel orgId={orgId} range={range} />
      </Suspense>
      <Suspense fallback={<PanelFallback title="What Vistrial actually did" />}>
        <ContributionPanel orgId={orgId} range={range} />
      </Suspense>
      {includeIngestion ? (
        <Suspense fallback={<PanelFallback title="Connection health" />}>
          <IngestionPanel orgId={orgId} range={range} />
        </Suspense>
      ) : null}
    </div>
  );
}

export async function OutcomePanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const [payload, goal] = await Promise.all([
    loadReportingPanel(orgId, "outcome", range),
    loadStatedGoal(orgId),
  ]);
  if (payload.blocked === true) {
    return <ReportBlocked title="Clients closed per hundred leads" payload={payload} />;
  }
  const headline = rateOf(payload.headline);
  const maturing = rateOf(payload.maturing);
  const baseline = payload.baseline ? rateOf(payload.baseline) : null;
  const comparison = asRecord(payload.comparison);
  const selfReported = payload.self_reported ? asRecord(payload.self_reported) : null;

  return (
    <Panel className="p-6">
      <SectionHeader
        title="Clients closed per hundred leads"
        hint="Counted by opt-in date. Closed only from recorded revenue. Maturing cohorts are excluded."
      />
      <KpiGrid columns={3}>
        <KpiCard
          label="After activation"
          value={formatPerHundred(headline.perHundred, headline.tooSmall)}
          sub={headline.sample}
        />
        <KpiCard
          label="Baseline"
          value={
            baseline
              ? formatPerHundred(baseline.perHundred, baseline.tooSmall)
              : "No comparison"
          }
          sub={baseline ? `${baseline.sample} · backfilled CRM history` : str(comparison.plain) ?? "Not shown"}
        />
        <KpiCard
          label="Maturing"
          value={formatCount(maturing.n)}
          sub={str(asRecord(payload.maturing).label) ?? maturing.sample}
        />
      </KpiGrid>
      {bool(comparison.shown) && num(comparison.delta_per_hundred) != null ? (
        <p className="mt-4 text-sm text-silver">
          Difference versus backfilled history: {num(comparison.delta_per_hundred)} per hundred.
          {bool(comparison.improved) ? " The after figure is higher." : " The after figure is not higher."}
        </p>
      ) : (
        <p className="mt-4 text-sm text-silver">{str(comparison.plain)}</p>
      )}
      {selfReported ? (
        <p className="mt-2 text-sm text-flag-warning">
          Self-reported prior figures: {String(selfReported.leads_per_month)} leads/month,{" "}
          {String(selfReported.clients_closed_per_month)} clients closed/month. The client&apos;s claim, not a
          Vistrial measurement, and not blended into the rates above.
        </p>
      ) : null}
      {goal ? (
        <p className="mt-2 text-sm text-silver">
          {goalLine(goal, {
            perHundred: headline.perHundred,
            leadsInWindow: headline.n,
            tooSmall: headline.tooSmall,
          })}
        </p>
      ) : null}
      <p className="mt-4 text-sm text-silver">{str(payload.attribution)}</p>
      <p className="mt-1 text-sm text-dim">{str(payload.correlation_caveat)}</p>
      <Computed payload={payload} />
    </Panel>
  );
}

export async function CoveragePanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "coverage", range);
  if (payload.blocked === true) return <ReportBlocked title="Coverage" payload={payload} />;
  const ever = rateOf(payload.ever_touched);
  const within = rateOf(payload.within_window);
  const targetMinutes = num(payload.speed_to_lead_minutes);
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Coverage"
        hint={
          targetMinutes != null
            ? `The operational claim: a human actually reached the lead, and did it inside the ${targetMinutes}-minute target.`
            : "The operational claim: a human actually reached the lead, and did it inside the window."
        }
      />
      <KpiGrid columns={4}>
        <KpiCard label="Ever a human touch" value={formatPct(ever.pct, ever.tooSmall)} sub={ever.sample} />
        <KpiCard
          label="Inside the window"
          value={formatPct(within.pct, within.tooSmall)}
          sub={targetMinutes != null ? `${within.sample} · ${targetMinutes} min target` : within.sample}
        />
        <KpiCard
          label="Median time to first touch"
          value={formatMinutes(num(payload.median_minutes))}
          sub={targetMinutes != null ? `Target ${targetMinutes} min` : undefined}
        />
        <KpiCard
          label="Worst case"
          value={formatMinutes(num(payload.worst_case_minutes))}
          sub={targetMinutes != null ? `Target ${targetMinutes} min` : undefined}
        />
      </KpiGrid>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <KpiCard label="Waiting too long right now" value={formatCount(num(payload.currently_in_breach) ?? 0)} />
        <KpiCard
          label="Went quiet with no human touch"
          value={formatCount(num(payload.ghosted_no_touch) ?? 0)}
          tone="critical"
        />
      </div>
      <Computed payload={payload} />
    </Panel>
  );
}

async function ThroughputPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "throughput", range);
  if (payload.blocked === true) return <ReportBlocked title="Throughput" payload={payload} />;
  const sources = Array.isArray(payload.leads_in_by_source) ? payload.leads_in_by_source : [];
  const funnel = Array.isArray(payload.close_rate_by_stage) ? payload.close_rate_by_stage : [];
  const show = rateOf(payload.show_rate);
  return (
    <Panel className="p-6">
      <SectionHeader title="Throughput" hint="Leads in this range, and what happened to their calls." />
      <KpiGrid columns={4}>
        <KpiCard label="Calls booked" value={formatCount(num(payload.calls_booked) ?? 0)} />
        <KpiCard label="Held" value={formatCount(num(payload.calls_held) ?? 0)} />
        <KpiCard label="No-showed" value={formatCount(num(payload.calls_no_showed) ?? 0)} />
        <KpiCard label="Show rate" value={formatPct(show.pct, show.tooSmall)} sub={show.sample} />
      </KpiGrid>
      <div className="mt-6">
        <DataTable
          columns={[
            { key: "source", label: "Source" },
            { key: "n", label: "Leads", align: "right" },
          ]}
          rows={sources.map((row) => {
            const item = asRecord(row);
            return { source: str(item.source) ?? "(none)", n: formatCount(num(item.n) ?? 0) };
          })}
          empty="No leads in this range."
        />
      </div>
      <div className="mt-6">
        <DataTable
          columns={[
            { key: "stage", label: "Stage" },
            { key: "n", label: "Leads", align: "right" },
            { key: "rate", label: "Closed / 100", align: "right" },
            { key: "sample", label: "Sample", align: "right" },
          ]}
          rows={funnel.map((row) => {
            const item = asRecord(row);
            const rate = rateOf(item);
            return {
              stage: str(item.stage) ?? "",
              n: formatCount(num(item.n) ?? rate.n),
              rate: formatPerHundred(rate.perHundred, rate.tooSmall),
              sample: rate.sample,
            };
          })}
        />
      </div>
      <Computed payload={payload} />
    </Panel>
  );
}

async function TeamPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "team", range);
  if (payload.blocked === true) return <ReportBlocked title="Team" payload={payload} />;
  const operators = Array.isArray(payload.operators) ? payload.operators : [];
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Team workload"
        hint="Coverage and activity, not a ranking. Close rate is omitted on purpose."
      />
      <DataTable
        columns={[
          { key: "name", label: "Person" },
          { key: "role", label: "Role" },
          { key: "leads", label: "Leads worked", align: "right" },
          { key: "touches", label: "Touches", align: "right" },
          { key: "calls", label: "Calls held", align: "right" },
          { key: "closes", label: "Closes recorded", align: "right" },
          { key: "median", label: "Median first touch", align: "right" },
        ]}
        rows={operators.map((row) => {
          const item = asRecord(row);
          return {
            name: str(item.display_name) ?? "Unknown",
            role: str(item.role) ?? "",
            leads: formatCount(num(item.leads_worked) ?? 0),
            touches: formatCount(num(item.touches_logged) ?? 0),
            calls: formatCount(num(item.calls_held) ?? 0),
            closes: formatCount(num(item.closes) ?? 0),
            median: formatMinutes(num(item.median_first_touch_minutes)),
          };
        })}
        empty="No operators in this workspace."
      />
      <Computed payload={payload} />
    </Panel>
  );
}

async function FollowUpPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "follow_up", range);
  if (payload.blocked === true) return <ReportBlocked title="Follow-up" payload={payload} />;
  const edit = Array.isArray(payload.median_edit_distance_by_branch)
    ? payload.median_edit_distance_by_branch
    : [];
  const reply = Array.isArray(payload.reply_rate_by_branch_position)
    ? payload.reply_rate_by_branch_position
    : [];
  const halt = Array.isArray(payload.halt_reasons) ? payload.halt_reasons : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="Follow-up" hint="Draft volume, how much operators change, replies, and why sequences stop." />
      <KpiGrid columns={4}>
        <KpiCard label="Generated" value={formatCount(num(payload.generated) ?? 0)} />
        <KpiCard label="Approved" value={formatCount(num(payload.approved) ?? 0)} />
        <KpiCard label="Rejected" value={formatCount(num(payload.rejected) ?? 0)} />
        <KpiCard label="Sent" value={formatCount(num(payload.sent) ?? 0)} />
      </KpiGrid>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DataTable
          columns={[
            { key: "branch", label: "Branch" },
            { key: "median", label: "Median edit distance", align: "right" },
            { key: "n", label: "n", align: "right" },
          ]}
          rows={edit.map((row) => {
            const item = asRecord(row);
            const branch = str(item.branch) as FollowUpBranch | null;
            return {
              branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
              median: formatCount(Math.round(num(item.median_edit_distance) ?? 0)),
              n: formatCount(num(item.n) ?? 0),
            };
          })}
          empty="No drafts in this range."
        />
        <DataTable
          columns={[
            { key: "reason", label: "Halt reason" },
            { key: "n", label: "n", align: "right" },
          ]}
          rows={halt.map((row) => {
            const item = asRecord(row);
            const reason = str(item.halt_reason) as Enums<"follow_up_halt_reason"> | null;
            return {
              reason: reason && reason in HALT_REASON_LABELS ? HALT_REASON_LABELS[reason] : reason,
              n: formatCount(num(item.n) ?? 0),
            };
          })}
          empty="No halted sequences."
        />
      </div>
      <div className="mt-6">
        <DataTable
          columns={[
            { key: "branch", label: "Branch" },
            { key: "pos", label: "Position", align: "right" },
            { key: "rate", label: "Reply rate", align: "right" },
            { key: "sample", label: "Sample", align: "right" },
          ]}
          rows={reply.map((row) => {
            const item = asRecord(row);
            const rate = rateOf(item.reply_rate);
            const branch = str(item.branch) as FollowUpBranch | null;
            return {
              branch: branch && branch in FOLLOW_UP_BRANCH_LABELS ? FOLLOW_UP_BRANCH_LABELS[branch] : branch,
              pos: formatCount(num(item.sequence_position) ?? 0),
              rate: formatPct(rate.pct, rate.tooSmall),
              sample: rate.sample,
            };
          })}
          empty="No sent drafts to measure replies."
        />
      </div>
      <Computed payload={payload} />
    </Panel>
  );
}

export async function ObjectionsPanel({
  orgId,
  range,
  hideMemberBreakdown = false,
}: {
  orgId: string;
  range: ReportingRange;
  hideMemberBreakdown?: boolean;
}) {
  const payload = await loadReportingPanel(orgId, "objections", range);
  if (payload.blocked === true) return <ReportBlocked title="Objections" payload={payload} />;
  if (bool(payload.too_small)) {
    return (
      <Panel className="p-6">
        <SectionHeader title="Objections" />
        <EmptyState
          bare
          title="Not enough objections to treat as a finding"
          detail={str(payload.suppressed_plain) ?? undefined}
        />
        <Computed payload={payload} />
      </Panel>
    );
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="Objections" hint="Exact language matters more than the category label." />
      <div className="space-y-6">
        {rows.map((row) => {
          const item = asRecord(row);
          const type = str(item.type) as Enums<"objection_type"> | null;
          const rate = rateOf(item.lost_rate);
          const quotes = Array.isArray(item.quotes) ? item.quotes : [];
          const members = Array.isArray(item.by_member) ? item.by_member : [];
          return (
            <div key={str(item.type) ?? "objection"} className="border-t border-white/10 pt-4">
              <p className="text-sm font-medium text-white">
                {type && type in OBJECTION_TYPE_LABELS ? OBJECTION_TYPE_LABELS[type] : type} · {formatCount(num(item.n) ?? 0)}
              </p>
              <p className="mt-1 text-sm text-dim">
                Lost correlation: {formatPct(rate.pct, rate.tooSmall)} ({rate.sample})
              </p>
              <ul className="mt-2 space-y-1 text-sm text-silver">
                {quotes.map((quote) => (
                  <li key={String(quote)}>&ldquo;{String(quote)}&rdquo;</li>
                ))}
              </ul>
              {members.length > 0 && !hideMemberBreakdown ? (
                <p className="mt-2 text-xs text-dim">
                  Across the team:{" "}
                  {members
                    .map((member) => {
                      const rec = asRecord(member);
                      return `${str(rec.display_name)} (${num(rec.n) ?? 0})`;
                    })
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <Computed payload={payload} />
    </Panel>
  );
}

export async function SourcesPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "sources", range);
  if (payload.blocked === true) return <ReportBlocked title="Source quality" payload={payload} />;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const flag = payload.high_readiness_low_close ? asRecord(payload.high_readiness_low_close) : null;
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Source quality"
        hint="Volume, readiness, show rate, and clients per hundred leads. High readiness with low closes is a fit problem."
      />
      {flag?.source ? (
        <p className="mb-4 text-sm text-flag-warning">
          {String(flag.source)}
          {flag.campaign ? ` / ${String(flag.campaign)}` : ""} is producing high readiness scores and a lower close
          rate than the workspace.
        </p>
      ) : null}
      <DataTable
        columns={[
          { key: "source", label: "Source" },
          { key: "campaign", label: "Campaign" },
          { key: "n", label: "Leads", align: "right" },
          { key: "ready", label: "Avg readiness", align: "right" },
          { key: "show", label: "Show rate", align: "right" },
          { key: "close", label: "Per 100", align: "right" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          const show = rateOf(item.show_rate);
          const close = rateOf(item.clients_per_hundred);
          return {
            source: str(item.source) ?? "(none)",
            campaign: str(item.campaign) ?? "(none)",
            n: formatCount(num(item.n) ?? 0),
            ready: num(item.avg_readiness_trunc) == null ? "\u2014" : String(num(item.avg_readiness_trunc)),
            show: formatPct(show.pct, show.tooSmall),
            close: formatPerHundred(close.perHundred, close.tooSmall),
          };
        })}
        empty="No sources in this range."
      />
      <Computed payload={payload} />
    </Panel>
  );
}

export async function TerminalPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "terminal", range);
  if (payload.blocked === true) return <ReportBlocked title="Where deals die" payload={payload} />;
  if (bool(payload.too_small)) {
    return (
      <Panel className="p-6">
        <SectionHeader title="Where deals die" />
        <EmptyState title="Not enough terminal outcomes" detail={str(payload.suppressed_plain) ?? undefined} />
        <Computed payload={payload} />
      </Panel>
    );
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="Where deals die" hint="Terminal outcomes by cause, not a single lost bucket." />
      <DataTable
        columns={[
          { key: "cause", label: "Cause" },
          { key: "n", label: "Leads", align: "right" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          return {
            cause: (str(item.cause) ?? "").replaceAll("_", " "),
            n: formatCount(num(item.n) ?? 0),
          };
        })}
        empty="No terminal outcomes in this range."
      />
      <Computed payload={payload} />
    </Panel>
  );
}

export async function SpeedPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "speed", range);
  if (payload.blocked === true) return <ReportBlocked title="How long they waited" payload={payload} />;
  if (bool(payload.too_small)) {
    return (
      <Panel className="p-6">
        <SectionHeader title="What waiting costs" />
        <EmptyState title="Not enough mature leads" detail={str(payload.suppressed_plain) ?? undefined} />
        <Computed payload={payload} />
      </Panel>
    );
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return (
    <Panel className="p-6">
      <SectionHeader
        title="What waiting costs"
        hint={str(payload.correlation_caveat) ?? "This workspace's own data, not an industry statistic."}
      />
      <DataTable
        columns={[
          { key: "bucket", label: "Time to first human touch" },
          { key: "n", label: "Leads", align: "right" },
          { key: "rate", label: "Closed / 100", align: "right" },
          { key: "sample", label: "Sample", align: "right" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          const rate = rateOf(item.close_rate);
          return {
            bucket: (str(item.bucket) ?? "").replaceAll("_", " "),
            n: formatCount(num(item.n) ?? 0),
            rate: formatPerHundred(rate.perHundred, rate.tooSmall),
            sample: rate.sample,
          };
        })}
      />
      <Computed payload={payload} />
    </Panel>
  );
}

async function ReadinessPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "readiness", range);
  if (payload.blocked === true) return <ReportBlocked title="Readiness" payload={payload} />;
  const rows = Array.isArray(payload.distribution) ? payload.distribution : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="Readiness" hint="Latest score distribution and how many leads were scored more than once." />
      <KpiCard
        className="mb-4 max-w-xs"
        label="Leads with score movement"
        value={formatCount(num(payload.leads_with_score_movement) ?? 0)}
      />
      <DataTable
        columns={[
          { key: "label", label: "Score band" },
          { key: "n", label: "Leads", align: "right" },
        ]}
        rows={rows.map((row) => {
          const item = asRecord(row);
          return { label: str(item.label) ?? "", n: formatCount(num(item.n) ?? 0) };
        })}
        empty="No scored leads in this range."
      />
      <Computed payload={payload} />
    </Panel>
  );
}

async function ContributionPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "contribution", range);
  if (payload.blocked === true) return <ReportBlocked title="What Vistrial actually did" payload={payload} />;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="What this product actually did" hint={str(payload.attribution) ?? undefined} />
      <ul className="space-y-2 text-sm text-silver">
        {items.map((item) => {
          const rec = asRecord(item);
          return (
            <li key={str(rec.claim) ?? JSON.stringify(rec)}>
              {str(rec.claim)}
              {num(rec.n) != null ? `: ${formatCount(num(rec.n))}` : ""}
              {num(rec.of) != null ? ` of ${formatCount(num(rec.of))}` : ""}
              {str(rec.note) ? ` — ${str(rec.note)}` : ""}
            </li>
          );
        })}
      </ul>
      <Computed payload={payload} />
    </Panel>
  );
}

async function IngestionPanel({ orgId, range }: { orgId: string; range: ReportingRange }) {
  const payload = await loadReportingPanel(orgId, "ingestion", range);
  if (payload.blocked === true) return <ReportBlocked title="Connection health" payload={payload} />;
  const types = Array.isArray(payload.by_type) ? payload.by_type : [];
  return (
    <Panel className="p-6">
      <SectionHeader title="Are leads arriving?" hint={str(payload.note) ?? undefined} />
      <KpiGrid columns={3}>
        <KpiCard label="Arrived" value={formatCount(num(payload.received) ?? 0)} />
        <KpiCard label="Processed" value={formatCount(num(payload.processed) ?? 0)} />
        <KpiCard label="Stuck" value={formatCount(num(payload.dead) ?? 0)} />
      </KpiGrid>
      <div className="mt-4">
        <DataTable
          columns={[
            { key: "type", label: "Event" },
            { key: "n", label: "n", align: "right" },
          ]}
          rows={types.map((row) => {
            const item = asRecord(row);
            return { type: str(item.event_type) ?? "", n: formatCount(num(item.n) ?? 0) };
          })}
          empty="Nothing arrived in this range."
        />
      </div>
      <Computed payload={payload} />
    </Panel>
  );
}

/**
 * The reporting views. These are separate pages, so they are tabs rather than
 * a set of links crowded into the header's action slot.
 */
export function ReportingTabs({
  range,
  activeHref,
}: {
  range: ReportingRange;
  activeHref: string;
}) {
  const query = reportingRangeQuery(range);
  return (
    <NavTabs
      label="Reporting views"
      activeHref={activeHref}
      items={[
        // The two range-aware views carry the selected range across with them.
        { href: `/app/reporting${query ? `?${query}` : ""}`, label: "Team" },
        { href: `/portal${query ? `?${query}` : ""}`, label: "Portal" },
        { href: "/app/reporting/coaching", label: "Coaching" },
      ]}
    />
  );
}

/** Taking the figures out of the product. */
export function ReportingExports({
  range,
  client,
}: {
  range: ReportingRange;
  client?: boolean;
}) {
  const query = reportingRangeQuery(range);
  return (
    <>
      {client ? null : (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/portal?${query}`}>Review summary</Link>
        </Button>
      )}
      <Button asChild variant="secondary" size="sm">
        <Link href={`/app/reporting/export/csv?${query}`}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </Link>
      </Button>
    </>
  );
}

export { PanelFallback };
