import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass, metricValue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Metrics" };

export default async function MetricsPage() {
  await requirePlatformAdmin();
  const db = await staffDb();
  const [{ data: metrics }, { data: usage }] = await Promise.all([
    db.rpc("staff_platform_metrics", { p_days: 30 }),
    db.rpc("staff_usage_month"),
  ]);
  const row = (metrics ?? {}) as {
    by_state?: Record<string, number>;
    response?: { decided?: number; within?: number };
    runs?: { total?: number; failed?: number };
    requests?: { total?: number; answered?: number; median_first_reply_business_minutes?: number | null };
    escalations?: { raised?: number; resolved?: number };
  };
  const decided = Number(row.response?.decided ?? 0);
  const within = Number(row.response?.within ?? 0);
  return (
    <PageFrame
      title="Metrics"
      description="The last 30 days, unless a figure says this month. Response percent is leads reached in time divided by leads whose response was decided. Request time is the median business minutes to a first reply."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel className="p-4">
          <p className={metricValue}>{Object.values(row.by_state ?? {}).reduce((sum, n) => sum + Number(n), 0)}</p>
          <p className={helperClass}>Workspaces, not counting Vistrial&apos;s own</p>
        </Panel>
        <Panel className="p-4">
          <p className={metricValue}>{decided ? `${Math.round((within / decided) * 100)}%` : "—"}</p>
          <p className={helperClass}>Reached in time, {within} of {decided}</p>
        </Panel>
        <Panel className="p-4">
          <p className={metricValue}>{Number(row.runs?.failed ?? 0)}</p>
          <p className={helperClass}>Failed or stuck runs, of {Number(row.runs?.total ?? 0)}</p>
        </Panel>
        <Panel className="p-4">
          <p className={metricValue}>
            {row.requests?.median_first_reply_business_minutes == null ? "—" : Math.round(row.requests.median_first_reply_business_minutes)}
          </p>
          <p className={helperClass}>Median business minutes to a first reply</p>
        </Panel>
      </div>
      <Panel className="p-6">
        <h2 className={cardTitle}>This month, by workspace</h2>
        <ul className="mt-3 divide-y divide-overlay/[0.06]">
          {((usage ?? []) as Array<{ org_name: string; relay_drafts: number; runs: Record<string, number> }>).map((item) => (
            <li key={item.org_name} className="flex justify-between gap-3 py-2 text-sm text-strong">
              <span>{item.org_name}</span>
              <span className={helperClass}>
                {Object.values(item.runs ?? {}).reduce((sum, n) => sum + Number(n), 0)} runs · {item.relay_drafts} drafts
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageFrame>
  );
}
