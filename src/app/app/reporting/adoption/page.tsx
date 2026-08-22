import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { DataTable } from "@/components/ui/data-table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMinutes } from "@/lib/profile/leak";
import { loadAdoptionWatch, requireProfileAccess } from "@/lib/profile/load";
import { asArray, asRecord, bool, num, str } from "@/lib/profile/parse";
import { btnSecondary, btnSizeSm, helperClass } from "@/lib/ui";

type Rate = { k: number; n: number; pct: number | null; tooSmall: boolean; sample: string };

function rate(value: unknown): Rate {
  const row = asRecord(value);
  return {
    k: num(row.k) ?? 0,
    n: num(row.n) ?? 0,
    pct: num(row.pct),
    tooSmall: bool(row.too_small),
    sample: str(row.sample_label) ?? "0 of 0",
  };
}

function rateText(value: Rate): string {
  if (value.n === 0) return "Nothing to measure";
  if (value.tooSmall || value.pct === null) return `${value.sample}, too few for a rate`;
  return `${value.pct}%`;
}

function trend(now: Rate, before: Rate): string | undefined {
  if (now.pct === null || before.pct === null) return undefined;
  const delta = Math.round((now.pct - before.pct) * 10) / 10;
  if (delta === 0) return "level on last week";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} on last week`;
}

export default async function AdoptionWatchPage() {
  const ctx = await requireProfileAccess();
  const watch = await loadAdoptionWatch(ctx.org.id);

  if (!bool(watch.activated)) {
    return (
      <PageFrame
        title="Adoption"
        description="Whether the team is actually using the system."
      >
        <Panel className="px-6 py-6">
          <p className="text-sm font-medium text-white">This workspace is not live yet.</p>
          <p className={helperClass}>
            There is nothing to watch until activation sets the line between baseline and measured.
          </p>
          <div className="mt-4">
            <Link href="/app/settings/business-profile" className={`${btnSecondary} ${btnSizeSm}`}>
              Open the activation gate
            </Link>
          </div>
        </Panel>
      </PageFrame>
    );
  }

  const touchNow = rate(asRecord(watch.human_touch).this_week);
  const touchBefore = rate(asRecord(watch.human_touch).previous_week);
  const logNow = rate(asRecord(watch.outcome_logging).this_week);
  const logBefore = rate(asRecord(watch.outcome_logging).previous_week);
  const drafts = asRecord(watch.drafts);
  const alarms = asArray(watch.alarms);
  const members = asArray(watch.members);
  const median = num(watch.median_minutes_to_first_touch);
  const window = num(watch.configured_window_minutes);
  const days = num(watch.days_live) ?? 0;

  return (
    <PageFrame
      title="Adoption"
      description={
        bool(watch.in_first_fortnight)
          ? `Day ${days}. The first fortnight is where a team either changes how it works or quietly does not.`
          : `Day ${days} since this workspace went live.`
      }
    >
      <div className="space-y-6">
        {alarms.length > 0 ? (
          <Panel className="border-flag-warning/40 px-6 py-6">
            <h2 className="text-sm font-semibold text-white">Said plainly</h2>
            <ul className="mt-3 space-y-3 text-sm text-flag-warning">
              {alarms.map((item, index) => (
                <li key={str(asRecord(item).key) ?? index}>{str(asRecord(item).plain)}</li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <div>
          <KpiGrid columns={3}>
            <KpiCard
              label="Leads in the last 24 hours"
              value={String(num(watch.leads_ingested_24h) ?? 0)}
              tone={(num(watch.leads_ingested_24h) ?? 0) === 0 ? "critical" : "neutral"}
              sub={`${num(watch.leads_ingested_7d) ?? 0} this week`}
            />
            <KpiCard
              label="Leads getting a human touch"
              value={rateText(touchNow)}
              sub={trend(touchNow, touchBefore)}
            />
            <KpiCard
              label="Calls with an outcome logged"
              value={rateText(logNow)}
              sub={trend(logNow, logBefore)}
              tone={logNow.pct !== null && logNow.pct < 50 ? "warning" : "neutral"}
            />
          </KpiGrid>
        </div>

        <div>
          <KpiGrid columns={3}>
            <KpiCard
              label="Median time to first touch"
              value={median === null ? "Not measurable" : formatMinutes(median)}
              tone={median !== null && window !== null && median > window ? "warning" : "neutral"}
              sub={window === null ? undefined : `window is ${formatMinutes(window)}`}
            />
            <KpiCard label="Drafts approved" value={String(num(drafts.approved) ?? 0)} />
            <KpiCard
              label="Drafts rejected"
              value={String(num(drafts.rejected) ?? 0)}
              tone={(num(drafts.rejected) ?? 0) > (num(drafts.approved) ?? 0) ? "warning" : "neutral"}
            />
          </KpiGrid>
        </div>

        <Panel className="px-6 py-6">
          <h2 className="text-sm font-semibold text-white">Who has used the system this week</h2>
          <p className={helperClass}>
            Outcome logging is the leading indicator. If leads are arriving and nobody is recording
            what happened, every number here understates what your team actually did.
          </p>
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "name", label: "Member" },
                { key: "role", label: "Role" },
                { key: "touches", label: "Touches", align: "right" },
                { key: "outcomes", label: "Outcomes", align: "right" },
                { key: "approvals", label: "Approvals", align: "right" },
                { key: "state", label: "" },
              ]}
              rows={members.map((item) => {
                const row = asRecord(item);
                const touches = num(row.touches) ?? 0;
                const outcomes = num(row.outcomes) ?? 0;
                const approvals = num(row.approvals) ?? 0;
                const idle = touches === 0 && outcomes === 0 && approvals === 0;
                return {
                  name: str(row.name) ?? "—",
                  role: str(row.role) ?? "—",
                  touches: String(touches),
                  outcomes: String(outcomes),
                  approvals: String(approvals),
                  state: idle ? (
                    <StatusBadge label="Nothing this week" tone="warning" />
                  ) : (
                    <StatusBadge label="Working" tone="good" />
                  ),
                };
              })}
              empty="Nobody active on this workspace."
            />
          </div>
        </Panel>
      </div>
    </PageFrame>
  );
}
