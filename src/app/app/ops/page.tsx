import { PageFrame } from "@/components/app/page-frame";
import { AgentRouteControls } from "@/app/app/ops/agent-route-controls";
import { OpsControls } from "@/app/app/ops/ops-controls";
import { OpsActivity } from "@/app/app/ops/ops-activity";
import { VerificationControls } from "@/app/app/ops/verification-controls";
import { DataTable } from "@/components/ui/data-table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { parseActivityFilters, activityFiltersHref } from "@/lib/activity/filters";
import { loadOpsActivity } from "@/lib/activity/load";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import { loadOpsSystemState } from "@/lib/ops/load";
import { DA_CONSOLE_LINKS } from "@/lib/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cardTitle, helperClass } from "@/lib/ui";
import Link from "next/link";

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 36e5);
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const activityFilters = parseActivityFilters(params);
  const [state, activity] = await Promise.all([
    loadOpsSystemState(getSupabaseAdmin()),
    loadOpsActivity(activityFilters),
  ]);
  const { volumes, engagement, deadRows } = state.notifications;
  const fatigued = volumes.filter((row) => row.fatigue).length;
  const failing = volumes.filter((row) => row.failingPush).length;
  const unresolved = volumes.filter((row) => row.unresolvedBreaches > 0).length;
  const openAlerts = state.alerts.length;
  const overdueJobs = state.jobs.filter((job) => job.overdue).length;
  const calibration = state.calibration ?? {};
  const calClients = Array.isArray(calibration.clients) ? calibration.clients : [];
  const stopped = calClients.filter((row) => {
    const rec = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    return rec.stopped_predicting === true;
  });
  const holdoutOff = calClients.filter((row) => {
    const rec = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    return rec.holdout_disabled === true;
  });

  return (
    <PageFrame
      title="System"
      description="Jobs, alerts, and ingestion. Yours, not theirs."
    >
      <Panel className="mb-8 p-6">
        <h2 className={cardTitle}>Console</h2>
        <p className={helperClass}>These stay off the client app. Open them from here.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {DA_CONSOLE_LINKS.filter((item) => item.href !== "/app/ops").map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block text-sm text-brand-200 hover:underline">
                {item.label}
              </Link>
              <p className={helperClass}>{item.description}</p>
            </li>
          ))}
        </ul>
      </Panel>
      {stopped.length > 0 ? (
        <Notice tone="critical" className="mb-6">
          {stopped.length === 1
            ? "One client’s score has stopped predicting who closes. That product is quietly failing while the queue still looks orderly."
            : `${stopped.length} clients have scores that have stopped predicting who closes. That product is quietly failing while the queue still looks orderly.`}
        </Notice>
      ) : null}

      {state.anythingWrong ? (
        <Notice tone="critical" className="mb-6">
          Something is wrong. Read the open alerts and overdue jobs before anything else.
        </Notice>
      ) : (
        <Notice tone="success" className="mb-6">
          No overdue jobs, no open alerts, ingestion is moving.
        </Notice>
      )}

      <OpsActivity
        key={activityFiltersHref(activityFilters, "/app/ops")}
        initial={activity}
        filters={activityFilters}
        clients={(state.orgs ?? []).map((org) => ({
          id: org.id,
          name: org.name,
        }))}
      />

      <Panel className="mb-8 p-6">
        <h2 className={cardTitle}>Calibration health</h2>
        <p className={helperClass}>
          A client whose score has stopped predicting sits at the top. Holdout off means the
          numbers cannot be trusted as validation.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Calibration health by workspace"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "flag", label: "Status" },
              { key: "holdout", label: "Holdout" },
              { key: "n", label: "Holdout resolved", align: "right" },
            ]}
            rows={calClients.map((row) => {
              const rec = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
              const name = typeof rec.name === "string" ? rec.name : "Workspace";
              const stoppedPredicting = rec.stopped_predicting === true;
              const disabled = rec.holdout_disabled === true;
              const tooSmall = rec.holdout_too_small === true;
              return {
                org: name,
                flag: stoppedPredicting ? (
                  <StatusBadge label="score not predicting" tone="critical" />
                ) : disabled ? (
                  <StatusBadge label="holdout off" tone="warning" />
                ) : tooSmall ? (
                  <StatusBadge label="holdout too small" tone="warning" />
                ) : (
                  <StatusBadge label="predicting" tone="good" />
                ),
                holdout: disabled ? "off" : `${String(rec.holdout_percent ?? "")}%`,
                n: String(rec.holdout_n ?? 0),
              };
            })}
            empty="No workspaces."
          />
        </div>
        {holdoutOff.length > 0 ? (
          <p className={`mt-3 ${helperClass}`}>
            Holdout disabled: {holdoutOff.map((row) => (row as { name?: string }).name).join(", ")}.
          </p>
        ) : null}
      </Panel>

      <KpiGrid>
        <KpiCard label="Environment" value={state.env} />
        <KpiCard
          label="Error rate (24h)"
          value={state.sampleTotal ? `${Math.round(state.errorRate * 1000) / 10}%` : "—"}
          tone={state.errorRate > 0.05 ? "critical" : "neutral"}
        />
        <KpiCard
          label="DB"
          value={state.latestHealth ? (state.latestHealth.db_ok ? "up" : "down") : "—"}
          tone={state.latestHealth && !state.latestHealth.db_ok ? "critical" : "neutral"}
        />
        <KpiCard
          label="DB connections"
          value={
            state.runtime.connectionsActive == null
              ? "—"
              : `${state.runtime.connectionsActive}/${state.runtime.connectionsTotal ?? "—"}`
          }
          tone={(state.runtime.slowQueries ?? 0) > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Extraction fail (24h)"
          value={state.extractionN ? `${Math.round(state.extractionFailRate * 100)}%` : "—"}
          tone={state.extractionFailRate > 0.2 ? "critical" : "neutral"}
        />
        <KpiCard
          label="Notify fail (24h)"
          value={state.notificationN ? `${Math.round(state.notificationFailRate * 100)}%` : "—"}
          tone={state.notificationFailRate > 0.05 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Open alerts"
          value={openAlerts}
          tone={openAlerts ? "critical" : "neutral"}
        />
        <KpiCard
          label="Ingest backlog"
          value={state.ingest.unprocessed}
          tone={state.ingest.unprocessed ? "warning" : "neutral"}
        />
        <KpiCard
          label="Events on unlinked locations"
          value={state.ingest.awaitingLocationLink.events}
          tone={state.ingest.awaitingLocationLink.events ? "critical" : "neutral"}
        />
        <KpiCard
          label="Overdue jobs"
          value={overdueJobs}
          tone={overdueJobs ? "critical" : "neutral"}
        />
        <KpiCard
          label="Last verified restore"
          value={
            state.hoursSinceRestore === null
              ? "never"
              : state.hoursSinceRestore < 24
                ? `${Math.round(state.hoursSinceRestore)}h`
                : `${Math.round(state.hoursSinceRestore / 24)}d`
          }
          tone={!state.restore || (state.hoursSinceRestore ?? 999) > 24 * 40 ? "warning" : "neutral"}
        />
        <KpiCard label="Model spend (30d, est.)" value={usd(state.spend.totalUsd)} />
        <KpiCard
          label="Fatigue flags"
          value={fatigued}
          tone={fatigued ? "warning" : "neutral"}
        />
      </KpiGrid>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Open alerts</h2>
        <p className={helperClass}>
          Every row names what to check first. These route to DA, never to a client.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Open operational alerts"
            columns={[
              { key: "sev", label: "Severity" },
              { key: "title", label: "Alert" },
              { key: "check", label: "Check first" },
              { key: "when", label: "Fired" },
            ]}
            rows={state.alerts.map((row) => ({
              sev: <StatusBadge label={row.severity} tone={row.severity === "critical" ? "critical" : "warning"} />,
              title: row.title,
              check: row.check_first,
              when: new Date(row.fired_at).toLocaleString(),
            }))}
            empty="No open alerts."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Scheduled jobs</h2>
        <p className={helperClass}>
          A job that did not run is worse than a job that failed. Last success is what this table
          watches.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Job heartbeats"
            columns={[
              { key: "job", label: "Job" },
              { key: "cron", label: "Schedule" },
              { key: "success", label: "Last success" },
              { key: "flag", label: "" },
            ]}
            rows={state.jobs.map((row) => ({
              job: row.job_name,
              cron: row.cronExpr,
              success: ago(row.last_success_at),
              flag: row.overdue ? <StatusBadge label="did not run" tone="critical" /> : "",
            }))}
            empty="Job catalog is empty."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Ingestion by workspace</h2>
        <div className="mt-4">
          <DataTable
            caption="Ingestion backlog by workspace"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "backlog", label: "Unprocessed", align: "right" },
              { key: "state", label: "State" },
            ]}
            rows={state.orgHealth.map((row) => ({
              org: row.name,
              backlog: String(row.unprocessed),
              state: row.inactive ? (
                <StatusBadge label="inactive" tone="neutral" />
              ) : row.stale ? (
                <StatusBadge label="stale" tone="critical" />
              ) : (
                <StatusBadge label="ok" tone="good" />
              ),
            }))}
            empty="No workspaces."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Model spend</h2>
        <p className={helperClass}>
          Estimated from extraction token logs, operator-agent runs, and verification token logs at
          published Anthropic list prices. Drafting tokens are not stored yet. Verification cost is
          not folded into generation.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Estimated model spend by workspace"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "extraction", label: "Extraction", align: "right" },
              { key: "agent", label: "Operator agent", align: "right" },
              { key: "verification", label: "Verification", align: "right" },
              { key: "usd", label: "Est. USD", align: "right" },
            ]}
            rows={state.spend.byOrg.map((row) => ({
              org: row.orgName,
              extraction: usd(row.extractionUsd),
              agent: usd(row.agentUsd),
              verification: usd(row.verificationUsd),
              usd: usd(row.estimatedUsd),
            }))}
            empty="No model usage in the last 30 days."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Estimated model spend by day"
            columns={[
              { key: "day", label: "Day" },
              { key: "usd", label: "Est. USD", align: "right" },
            ]}
            rows={state.spend.trend.map((row) => ({
              day: row.day,
              usd: usd(row.usd),
            }))}
            empty="No daily trend yet."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Spend by agent and workspace"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "agent", label: "Agent" },
              { key: "runs", label: "Runs", align: "right" },
              { key: "usd", label: "Est. USD", align: "right" },
            ]}
            rows={state.agentSpend.map((row) => ({
              org: row.orgName,
              agent: row.agentId,
              runs: String(row.runs),
              usd: usd(row.estimatedUsd),
            }))}
            empty="No agent spend yet."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Escalation rate by agent"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "agent", label: "Agent" },
              { key: "rate", label: "Escalation rate", align: "right" },
              { key: "n", label: "Escalations", align: "right" },
            ]}
            rows={state.escalationRates.map((row) => ({
              org: row.orgName,
              agent: row.agentId,
              rate: `${Math.round(row.rate * 1000) / 10}%`,
              n: String(row.escalations),
            }))}
            empty="No escalations. A step that escalates constantly is a routing error."
          />
        </div>
        <div className="mt-6">
          <AgentRouteControls
            routes={state.modelRoutes}
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Verification</h2>
        <p className={helperClass}>
          Four measures of the verifier itself. A layer nobody has audited manufactures false
          confidence. Turn a task off when accuracy is poor rather than keeping it.
        </p>
        {state.verification.injected.catchRate !== null &&
        state.verification.injected.catchRate < state.verification.injectedCatchAlertThreshold ? (
          <Notice tone="critical" className="mt-4">
            Injected-fault catch rate is below {Math.round(state.verification.injectedCatchAlertThreshold * 100)}%.
            Turn the failing task off.
          </Notice>
        ) : null}
        <div className="mt-4">
          <KpiGrid>
            <KpiCard
              label="Sample missed faults (7d avg)"
              value={
                state.verification.sampleAudits.missedFaultAverage == null
                  ? "—"
                  : String(Math.round(state.verification.sampleAudits.missedFaultAverage * 10) / 10)
              }
              tone={
                (state.verification.sampleAudits.missedFaultAverage ?? 0) > 0 ? "warning" : "neutral"
              }
            />
            <KpiCard
              label="Injected catch rate"
              value={
                state.verification.injected.catchRate == null
                  ? "—"
                  : `${Math.round(state.verification.injected.catchRate * 100)}%`
              }
              tone={
                state.verification.injected.catchRate != null &&
                state.verification.injected.catchRate < state.verification.injectedCatchAlertThreshold
                  ? "critical"
                  : "neutral"
              }
            />
            <KpiCard
              label="False positives (7d)"
              value={state.verification.falsePositives.count7d}
              tone={state.verification.falsePositives.count7d ? "warning" : "neutral"}
            />
          </KpiGrid>
        </div>
        <div className="mt-4">
          <DataTable
            caption="Verification pass rate by task"
            columns={[
              { key: "task", label: "Task" },
              { key: "enabled", label: "Enabled" },
              { key: "n", label: "Model n (7d)", align: "right" },
              { key: "pass", label: "Pass rate", align: "right" },
            ]}
            rows={state.verification.tasks.map((row) => ({
              task: row.task,
              enabled: row.enabled ? (
                <StatusBadge label="on" tone="good" />
              ) : (
                <StatusBadge label="off" tone="critical" />
              ),
              n: String(row.modelN),
              pass:
                row.passRate == null
                  ? "—"
                  : `${Math.round(row.passRate * 1000) / 10}%${
                      row.passRate >= state.verification.passRateAlertThreshold && row.modelN >= 20
                        ? " (near 100%)"
                        : ""
                    }`,
            }))}
            empty="No verification tasks."
          />
        </div>
        <div className="mt-4">
          <DataTable
            caption="Latest injected-fault suite"
            columns={[
              { key: "type", label: "Fault" },
              { key: "caught", label: "Caught" },
              { key: "when", label: "When" },
            ]}
            rows={state.verification.injected.lastResults.map((row) => ({
              type: row.faultType,
              caught: row.caught ? (
                <StatusBadge label="caught" tone="good" />
              ) : (
                <StatusBadge label="missed" tone="critical" />
              ),
              when: new Date(row.createdAt).toLocaleString(),
            }))}
            empty="Injected suite has not run yet."
          />
        </div>
        <div className="mt-6">
          <VerificationControls
            tasks={state.verification.tasks}
            pendingAudits={state.verification.sampleAudits.pending}
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Backups and retention</h2>
        <p className={helperClass}>
          Last verified restore:{" "}
          {state.restore
            ? `${new Date(state.restore.finished_at).toLocaleString()} (${state.restore.duration_ms}ms, ${state.restore.verified ? "verified" : "unverified"})`
            : "no drill recorded"}
          . Last retention run:{" "}
          {state.lastRetention
            ? `${new Date(state.lastRetention.started_at).toLocaleString()} ${state.lastRetention.dry_run ? "(dry-run)" : ""} purged ${JSON.stringify(state.lastRetention.deleted)}`
            : "never"}
          . Slow queries in last sample: {state.runtime.slowQueries ?? "—"}.
        </p>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Current incidents</h2>
        <div className="mt-4">
          <DataTable
            caption="Open incidents"
            columns={[
              { key: "kind", label: "Kind" },
              { key: "title", label: "Title" },
              { key: "status", label: "Status" },
              { key: "client", label: "Client told" },
            ]}
            rows={state.incidents.map((row) => ({
              kind: row.kind,
              title: row.title,
              status: row.status,
              client: row.client_notified_at ? "yes" : "no",
            }))}
            empty="No open incidents."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Lifecycle</h2>
        <p className={helperClass}>
          Export, halt, offboard, and delete. Deletion requires typing the workspace name and leaves
          a surviving record.
        </p>
        <div className="mt-4">
          <OpsControls
            orgs={state.orgs.map((org) => ({ id: org.id, name: org.name, slug: org.slug }))}
          />
        </div>
      </Panel>

      <div className="mt-8">
      <KpiGrid>
        <KpiCard label="Workspaces" value={volumes.length} />
        <KpiCard label="Silent push failures" value={failing} tone={failing ? "critical" : "neutral"} />
        <KpiCard
          label="Unresolved breaches"
          value={unresolved}
          tone={unresolved ? "warning" : "neutral"}
        />
      </KpiGrid>
      </div>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Volume per client</h2>
        <p className={helperClass}>
          Overflow summaries or more than 50 pushes a day flag fatigue. Repeated speed-to-lead
          without a first touch is an adoption conversation, not a config tweak.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Notification volume by workspace"
            columns={[
              { key: "org", label: "Workspace" },
              { key: "total", label: "7-day volume", align: "right" },
              { key: "push", label: "Push", align: "right" },
              { key: "dead", label: "Dead", align: "right" },
              { key: "unresolved", label: "Open breaches", align: "right" },
              { key: "flags", label: "Flags" },
            ]}
            rows={volumes.map((row) => ({
              org: row.orgName,
              total: String(row.total),
              push: String(row.push),
              dead: String(row.dead),
              unresolved: String(row.unresolvedBreaches),
              flags: (
                <span className="flex flex-wrap gap-1">
                  {row.fatigue ? <StatusBadge label="fatigue" tone="warning" /> : null}
                  {row.failingPush ? <StatusBadge label="push failing" tone="critical" /> : null}
                  {row.unresolvedBreaches > 2 ? (
                    <StatusBadge label="adoption" tone="warning" />
                  ) : null}
                </span>
              ),
            }))}
            empty="No workspaces yet."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Engagement by event</h2>
        <p className={helperClass}>
          High delivery and near-zero action is noise. Cut those types rather than adding volume.
        </p>
        <div className="mt-4">
          <DataTable
            caption="Engagement by event type"
            columns={[
              { key: "event", label: "Event" },
              { key: "delivered", label: "Delivered", align: "right" },
              { key: "opened", label: "Opened", align: "right" },
              { key: "acted", label: "Acted", align: "right" },
              { key: "rate", label: "Action rate", align: "right" },
              { key: "flag", label: "" },
            ]}
            rows={engagement.map((row) => ({
              event: EVENT_LABELS[row.eventType],
              delivered: String(row.delivered),
              opened: String(row.opened),
              acted: String(row.acted),
              rate: row.actionRate === null ? "—" : `${Math.round(row.actionRate * 100)}%`,
              flag: row.noisy ? <StatusBadge label="noise" tone="warning" /> : "",
            }))}
            empty="Nothing delivered in the last seven days."
          />
        </div>
      </Panel>

      <Panel className="mt-8 p-6">
        <h2 className={cardTitle}>Dead letters</h2>
        {deadRows.length === 0 ? (
          <p className={`mt-2 ${helperClass}`}>No dead notifications.</p>
        ) : (
          <div className="mt-4">
            <Notice tone="critical" className="mb-4">
              These retried with backoff and then stopped. A silently failed notification is the
              failure this layer exists to prevent.
            </Notice>
            <DataTable
              caption="Dead notification deliveries"
              columns={[
                { key: "org", label: "Workspace" },
                { key: "event", label: "Event" },
                { key: "channel", label: "Channel" },
                { key: "error", label: "Error" },
                { key: "when", label: "Queued" },
              ]}
              rows={deadRows.map((row) => ({
                org: row.orgName ?? "Staff",
                event: EVENT_LABELS[row.eventType],
                channel: row.channel,
                error: row.error ?? "—",
                when: new Date(row.queuedAt).toLocaleString(),
              }))}
            />
          </div>
        )}
      </Panel>
    </PageFrame>
  );
}
