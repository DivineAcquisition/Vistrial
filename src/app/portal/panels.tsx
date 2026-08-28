import { SourceConnectionCard } from "@/components/sources/source-connection-card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCount, formatMinutes, formatPct, formatSample } from "@/lib/reporting/format";
import { costPerUnit, formatCostUsd } from "@/lib/sources/costs";
import type { SourceCardModel } from "@/lib/sources/catalog";
import { helperClass } from "@/lib/ui";

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

function Unconnected({
  title,
  payload,
  source,
  now,
}: {
  title: string;
  payload: Record<string, unknown>;
  source: SourceCardModel | null;
  now: string;
}) {
  return (
    <Panel className="p-6">
      <SectionHeader title={title} hint="This section is optional. The rest of the portal still works from the CRM." />
      <EmptyState
        bare
        kind="unconfigured"
        title={str(payload.unlocks) ?? "Connect this source to add the section."}
        detail={str(payload.basis) === "not connected" ? "Not connected. Figures here would be missing, not zero." : str(payload.basis) ?? undefined}
      />
      {source ? (
        <div className="mt-6">
          <SourceConnectionCard source={source} now={now} />
        </div>
      ) : null}
    </Panel>
  );
}

export function AdoptionPanel({ payload }: { payload: Record<string, unknown> }) {
  const logging = rateOf(payload.outcome_logging);
  const briefs = rateOf(payload.briefs_opened_before_calls);
  const drafts = asRecord(payload.drafts);
  const members = Array.isArray(payload.members) ? payload.members : [];
  const used = members.filter((row) => asRecord(row).used === true);
  const unused = members.filter((row) => asRecord(row).used !== true);
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Is the team using it"
        hint="Usage, not a ranking. Close rates by person are not on this page."
      />
      <p className={helperClass}>{str(payload.basis)}</p>
      <KpiGrid columns={4}>
        <KpiCard
          label="Outcome logging"
          value={formatPct(logging.pct, logging.tooSmall)}
          sub={logging.sample}
        />
        <KpiCard
          label="Briefs opened before calls"
          value={formatPct(briefs.pct, briefs.tooSmall)}
          sub={briefs.sample}
        />
        <KpiCard label="Drafts approved" value={formatCount(num(drafts.approved) ?? 0)} />
        <KpiCard label="Drafts rejected" value={formatCount(num(drafts.rejected) ?? 0)} />
      </KpiGrid>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm text-white">Used it this period</h3>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
            ]}
            rows={used.map((row) => {
              const item = asRecord(row);
              return { name: str(item.name) ?? "—", role: str(item.role) ?? "—" };
            })}
            empty="Nobody used the system in this range."
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm text-white">Has not used it this period</h3>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
            ]}
            rows={unused.map((row) => {
              const item = asRecord(row);
              return { name: str(item.name) ?? "—", role: str(item.role) ?? "—" };
            })}
            empty="Everyone with an operator seat used it in this range."
          />
        </div>
      </div>
    </Panel>
  );
}

export function AdsPanel({
  payload,
  sources,
  now,
}: {
  payload: Record<string, unknown>;
  sources: SourceCardModel[];
  now: string;
}) {
  if (payload.connected !== true) {
    return (
      <Panel className="p-6">
        <SectionHeader
          title="Ad spend"
          hint="This section is optional. The rest of the portal still works from the CRM."
        />
        <EmptyState
          bare
          kind="unconfigured"
          title={str(payload.unlocks) ?? "Connect ad spend to see cost per client."}
          detail="Not connected. Figures here would be missing, not zero."
        />
        <div className="mt-6 space-y-6">
          {sources.map((source) => (
            <SourceConnectionCard key={source.kind} source={source} now={now} />
          ))}
        </div>
      </Panel>
    );
  }
  const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
  const unattributed = asRecord(payload.unattributed);
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Cost per client by campaign"
        hint={str(payload.attribution_basis) ?? undefined}
      />
      <p className={helperClass}>{str(payload.basis)}</p>
      <p className="mt-2 text-sm text-silver">
        Platform-reported conversions and CRM lead counts measure different things with different
        attribution windows. Both are shown. The gap is named, not papered over. Unattributed CRM
        leads stay unattributed. Modeled or estimated conversions are not shown as measured outcomes.
      </p>
      <DataTable
        columns={[
          { key: "campaign", label: "Campaign" },
          { key: "spend", label: "Spend", align: "right" },
          { key: "platformLeads", label: "Platform leads (reported)", align: "right", hideOnMobile: true },
          { key: "platformPurchases", label: "Platform conversions (reported)", align: "right", hideOnMobile: true },
          { key: "crmLeads", label: "CRM leads", align: "right" },
          { key: "gap", label: "Gap", align: "right" },
          { key: "cpl", label: "Cost / lead", align: "right" },
          { key: "cpb", label: "Cost / booked", align: "right" },
          { key: "cpc", label: "Cost / client", align: "right" },
        ]}
        rows={campaigns.map((row) => {
          const item = asRecord(row);
          const spend = num(item.spend_cents) ?? 0;
          const crmLeads = num(item.crm_leads) ?? 0;
          const platformLeads = num(item.platform_leads) ?? 0;
          const crmBooked = num(item.crm_booked) ?? 0;
          const crmClients = num(item.crm_clients) ?? 0;
          const perLead = costPerUnit({ spendCents: spend, count: crmLeads });
          const perBooked = costPerUnit({ spendCents: spend, count: crmBooked });
          const perClient = costPerUnit({ spendCents: spend, count: crmClients });
          return {
            campaign: `${str(item.platform) ?? ""} ${str(item.campaign_name) ?? "(unnamed)"}`,
            spend: formatCostUsd(spend, false),
            platformLeads: formatCount(platformLeads),
            platformPurchases: formatCount(num(item.platform_purchases) ?? 0),
            crmLeads: formatCount(crmLeads),
            gap: formatCount(Math.abs(platformLeads - crmLeads)),
            cpl: formatCostUsd(perLead.cents, perLead.tooSmall),
            cpb: formatCostUsd(perBooked.cents, perBooked.tooSmall),
            cpc: `${formatCostUsd(perClient.cents, perClient.tooSmall)} (${perClient.n} CRM net closes)`,
          };
        })}
        empty="No campaign spend in this range."
      />
      <p className="mt-4 text-sm text-silver">
        Unattributed CRM leads: {formatCount(num(unattributed.crm_leads) ?? 0)}, of which{" "}
        {formatCount(num(unattributed.crm_clients) ?? 0)} closed. They are not distributed across
        campaigns.
      </p>
      <div className="mt-6 space-y-6">
        {sources.map((item) => (
          <SourceConnectionCard key={item.kind} source={item} now={now} />
        ))}
      </div>
    </Panel>
  );
}

export function ProcessorPanel({
  payload,
  sources,
  now,
}: {
  payload: Record<string, unknown>;
  sources: SourceCardModel[];
  now: string;
}) {
  if (payload.connected !== true) {
    return (
      <Panel className="p-6">
        <SectionHeader title="Payments" hint="Refunds, chargebacks, and failed payments do not reliably appear in a CRM." />
        <EmptyState
          bare
          kind="unconfigured"
          title={str(payload.unlocks) ?? "Connect Stripe or Commas."}
          detail="A closed deal that refunded later is not a closed deal. Missing connection is missing, not zero."
        />
        <div className="mt-6 space-y-6">
          {sources.map((source) => (
            <SourceConnectionCard key={source.kind} source={source} now={now} />
          ))}
        </div>
      </Panel>
    );
  }
  return (
    <Panel className="p-6">
      <SectionHeader title="Payments" hint={str(payload.basis) ?? undefined} />
      <KpiGrid columns={4}>
        <KpiCard label="Sales recorded" value={formatCount(num(payload.sales) ?? 0)} />
        <KpiCard label="Refunds" value={formatCount(num(payload.refunds) ?? 0)} tone="warning" />
        <KpiCard label="Chargebacks" value={formatCount(num(payload.chargebacks) ?? 0)} tone="critical" />
        <KpiCard label="Failed payments" value={formatCount(num(payload.failed) ?? 0)} />
      </KpiGrid>
      <p className="mt-4 text-sm text-silver">
        Unmatched processor events (no lead): {formatCount(num(payload.unmatched) ?? 0)}. They stay
        visible rather than being guessed onto a lead.
      </p>
      <div className="mt-6 space-y-6">
        {sources.map((source) => (
          <SourceConnectionCard key={source.kind} source={source} now={now} />
        ))}
      </div>
    </Panel>
  );
}

export function CalendarPanel({
  payload,
  source,
  now,
}: {
  payload: Record<string, unknown>;
  source: SourceCardModel | null;
  now: string;
}) {
  if (payload.connected !== true) {
    return (
      <Unconnected
        title="Capacity"
        payload={payload}
        source={source}
        now={now}
      />
    );
  }
  const idle = num(payload.idle_minutes);
  const available = num(payload.available_minutes);
  return (
    <Panel className="p-6">
      <SectionHeader title="Capacity" hint={str(payload.basis) ?? undefined} />
      <KpiGrid columns={4}>
        <KpiCard
          label="Available hours"
          value={available == null ? "Not measured" : formatHours(available)}
          sub={available == null ? "Requires calendar availability blocks" : undefined}
        />
        <KpiCard label="Booked" value={formatHours(num(payload.booked_minutes) ?? 0)} />
        <KpiCard label="No-show time" value={formatHours(num(payload.no_show_minutes) ?? 0)} />
        <KpiCard
          label="Idle time"
          value={idle == null ? "Not measured" : formatHours(idle)}
          tone={idle != null && idle > 0 ? "warning" : "neutral"}
        />
      </KpiGrid>
      {source ? (
        <div className="mt-6">
          <SourceConnectionCard source={source} now={now} />
        </div>
      ) : null}
    </Panel>
  );
}

function formatHours(minutes: number): string {
  const tenths = Math.ceil((minutes / 60) * 10) / 10;
  return `${tenths.toFixed(1)} h`;
}

export function FormsPanel({
  payload,
  source,
  now,
}: {
  payload: Record<string, unknown>;
  source: SourceCardModel | null;
  now: string;
}) {
  if (payload.connected !== true) {
    return (
      <Unconnected
        title="Form drop-off"
        payload={payload}
        source={source}
        now={now}
      />
    );
  }
  const rows = Array.isArray(payload.abandoned_by_question) ? payload.abandoned_by_question : [];
  const tooSmall = bool(payload.too_small);
  const top = tooSmall ? null : rows[0] ? asRecord(rows[0]) : null;
  return (
    <Panel className="p-6">
      <SectionHeader title="Form drop-off" hint={str(payload.basis) ?? undefined} />
      <KpiGrid columns={3}>
        <KpiCard label="Started" value={formatCount(num(payload.started) ?? 0)} />
        <KpiCard label="Completed" value={formatCount(num(payload.completed) ?? 0)} />
        <KpiCard
          label="Question that loses people"
          value={tooSmall ? "Sample too small" : str(top?.question_key) ?? "—"}
          sub={top && !tooSmall ? formatCount(num(top.abandoned) ?? 0) : undefined}
        />
      </KpiGrid>
      {tooSmall ? (
        <EmptyState
          bare
          className="mt-4"
          title="Not enough started sessions to treat drop-off as a finding"
        />
      ) : (
        <div className="mt-6">
          <DataTable
            columns={[
              { key: "question", label: "Question" },
              { key: "n", label: "Abandoned", align: "right" },
            ]}
            rows={rows.map((row) => {
              const item = asRecord(row);
              return {
                question: str(item.question_key) ?? "(unspecified)",
                n: formatCount(num(item.abandoned) ?? 0),
              };
            })}
            empty="No abandon events in this range."
          />
        </div>
      )}
      {source ? (
        <div className="mt-6">
          <SourceConnectionCard source={source} now={now} />
        </div>
      ) : null}
    </Panel>
  );
}

export function RecorderPanel({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  if (payload.connected !== true) {
    return (
      <Panel className="p-6">
        <SectionHeader title="Call recorder metadata" hint="Coverage truth when outcome logging is thin." />
        <EmptyState
          bare
          kind="unconfigured"
          title={str(payload.unlocks) ?? "Connect a recorder to see calls made versus outcomes logged."}
          detail="Missing is missing, not zero. Recorders are connected from operator Integrations."
        />
      </Panel>
    );
  }
  const members = Array.isArray(payload.members) ? payload.members : [];
  const connect = rateOf(payload.connect_rate);
  return (
    <Panel className="p-6">
      <SectionHeader
        title="Calls made versus outcomes logged"
        hint={str(payload.basis) ?? undefined}
      />
      <KpiGrid columns={4}>
        <KpiCard label="Calls made" value={formatCount(num(payload.calls_made) ?? 0)} />
        <KpiCard label="Outcomes logged" value={formatCount(num(payload.outcomes_logged) ?? 0)} />
        <KpiCard
          label="Gap"
          value={formatCount(num(payload.gap) ?? 0)}
          tone={(num(payload.gap) ?? 0) > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Connect rate"
          value={formatPct(connect.pct, connect.tooSmall)}
          sub={connect.sample}
        />
      </KpiGrid>
      <div className="mt-6">
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "made", label: "Made", align: "right" },
            { key: "logged", label: "Logged", align: "right" },
            { key: "connect", label: "Connect rate", align: "right", hideOnMobile: true },
            { key: "duration", label: "Median duration", align: "right" },
          ]}
          rows={members.map((row) => {
            const item = asRecord(row);
            const rate = rateOf(item.connect_rate);
            return {
              name: str(item.name) ?? "—",
              made: formatCount(num(item.made) ?? 0),
              logged: formatCount(num(item.logged) ?? 0),
              connect: `${formatPct(rate.pct, rate.tooSmall)} (${rate.sample})`,
              duration: formatMinutes(
                num(item.median_duration_seconds) == null
                  ? null
                  : (num(item.median_duration_seconds) ?? 0) / 60
              ),
            };
          })}
          empty="No recorder activity in this range."
        />
      </div>
    </Panel>
  );
}

export function SourceHealthList({
  sources,
  now,
}: {
  sources: SourceCardModel[];
  now: string;
}) {
  return (
    <div className="space-y-6">
      {sources.map((source) => (
        <SourceConnectionCard key={source.kind} source={source} now={now} />
      ))}
    </div>
  );
}

export { StatusBadge };
