import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid, Trend } from "@/components/ui/kpi-card";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMinutes } from "@/lib/profile/leak";
import { assertProductScope } from "@/lib/product-scope-guard";
import { loadAdoptionWatch, requireProfileAccess } from "@/lib/profile/load";
import { asArray, asRecord, bool, num, str } from "@/lib/profile/parse";
import {
  cardTitle,
  helperClass,
} from "@/lib/ui";

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

function trendOf(now: Rate, before: Rate, higherIsBetter: boolean) {
  if (now.pct === null || before.pct === null) return undefined;
  const delta = Math.round((now.pct - before.pct) * 10) / 10;
  return (
    <Trend
      direction={delta === 0 ? "flat" : delta > 0 ? "up" : "down"}
      value={delta === 0 ? "level" : `${Math.abs(delta)} pts`}
      comparison="on last week"
      isGood={delta === 0 ? undefined : delta > 0 === higherIsBetter}
    />
  );
}

export default async function AdoptionWatchPage() {
  assertProductScope("extraPortal");
  const ctx = await requireProfileAccess();
  const watch = await loadAdoptionWatch(ctx.org.id);

  if (!bool(watch.activated)) {
    return (
      <PageFrame
        title="Adoption"
        description="Whether the team is actually using the system."
      >
        <EmptyState
          kind="unconfigured"
          title="This workspace is not live yet."
          detail="There is nothing to watch until activation sets the line between baseline and measured."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/settings/business-profile">Open the activation gate</Link>
            </Button>
          }
        />
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
          <Notice tone="warning" title="Said plainly">
            <ul className="space-y-2">
              {alarms.map((item, index) => (
                <li key={str(asRecord(item).key) ?? index}>{str(asRecord(item).plain)}</li>
              ))}
            </ul>
          </Notice>
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
              trend={trendOf(touchNow, touchBefore, true)}
            />
            <KpiCard
              label="Calls with an outcome logged"
              value={rateText(logNow)}
              trend={trendOf(logNow, logBefore, true)}
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

        <Panel className="p-6">
          <h2 className={cardTitle}>Who has used the system this week</h2>
          <p className={helperClass}>
            Outcome logging is the leading indicator. Mobile versus desktop per person is how you
            see a team logging from memory at a desk instead of from the phone after the call.
          </p>
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "name", label: "Member" },
                { key: "role", label: "Role", hideOnMobile: true },
                { key: "mobile", label: "Mobile", align: "right" },
                { key: "desktop", label: "Desktop", align: "right" },
                { key: "outcomes", label: "Outcomes", align: "right", hideOnMobile: true },
                { key: "state", label: "" },
              ]}
              rows={members.map((item) => {
                const row = asRecord(item);
                const touches = num(row.touches) ?? 0;
                const mobile = num(row.mobile_touches) ?? 0;
                const desktop = num(row.desktop_touches) ?? 0;
                const outcomes = num(row.outcomes) ?? 0;
                const approvals = num(row.approvals) ?? 0;
                const idle = touches === 0 && outcomes === 0 && approvals === 0;
                const loggedMobile = bool(row.logged_outcome_from_mobile);
                const role = str(row.role) ?? "—";
                const deskOnly = touches > 0 && mobile === 0;
                return {
                  name: str(row.name) ?? "—",
                  role,
                  mobile: String(mobile),
                  desktop: String(desktop),
                  outcomes: String(outcomes),
                  state: idle ? (
                    <StatusBadge label="Nothing this week" tone="warning" />
                  ) : role === "setter" && !loggedMobile ? (
                    <StatusBadge label="Not trained on phone" tone="warning" />
                  ) : deskOnly ? (
                    <StatusBadge label="Desk only" tone="warning" />
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
