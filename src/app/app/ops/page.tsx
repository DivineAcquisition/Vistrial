import { PageFrame } from "@/components/app/page-frame";
import { DataTable } from "@/components/ui/data-table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import { loadOpsNotificationState } from "@/lib/notifications/ops";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cardTitle, helperClass } from "@/lib/ui";

export default async function OpsPage() {
  await requirePlatformAdmin();
  const { volumes, engagement, deadRows } = await loadOpsNotificationState(getSupabaseAdmin());
  const fatigued = volumes.filter((row) => row.fatigue).length;
  const failing = volumes.filter((row) => row.failingPush).length;
  const unresolved = volumes.filter((row) => row.unresolvedBreaches > 0).length;

  return (
    <PageFrame
      title="Operator"
      description="Notification volume, engagement, and delivery failures across clients. Clients never see this screen."
    >
      <KpiGrid>
        <KpiCard label="Workspaces" value={volumes.length} />
        <KpiCard label="Fatigue flags" value={fatigued} tone={fatigued ? "warning" : "neutral"} />
        <KpiCard label="Silent push failures" value={failing} tone={failing ? "critical" : "neutral"} />
        <KpiCard
          label="Unresolved breaches"
          value={unresolved}
          tone={unresolved ? "warning" : "neutral"}
        />
      </KpiGrid>

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
