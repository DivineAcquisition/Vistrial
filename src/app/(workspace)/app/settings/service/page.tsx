import { ServiceControls } from "@/app/(workspace)/app/settings/service/controls";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireOwnerOrStaff } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vistrial team" };

const ACTION_LABEL: Record<string, string> = {
  "workspace.entered": "opened this workspace",
  "workspace.exited": "left this workspace",
  "workspace.session_ended": "the visit ended",
  "agent.paused": "paused an agent",
  "agent.resumed": "resumed an agent",
  "gate.approved": "approved a draft",
  "gate.rejected": "turned a draft down",
};

type HistoryRow = { id: string; at: string; who: string; action: string; detail: { reason?: string; minutes?: number; agent?: string } };

export default async function ServiceSettingsPage() {
  const ctx = await requireOwnerOrStaff();
  const db = await staffDb();
  const [{ data: allowed }, { data: history }] = await Promise.all([
    db.rpc("staff_may_approve", { p_org_id: ctx.org.id }),
    ctx.role === "owner" || ctx.isStaff ? db.rpc("owner_staff_history", { p_org_id: ctx.org.id, p_limit: 50, p_before: null }) : Promise.resolve({ data: [] }),
  ]);
  const rows = (history ?? []) as HistoryRow[];
  return (
    <PageFrame
      title="Vistrial team"
      description="Owners decide whether the Vistrial team may approve drafts here, and can see when the team was in this workspace."
    >
      {ctx.role === "owner" ? <ServiceControls orgId={ctx.org.id} allowed={allowed === true} /> : null}
      {ctx.isStaff && ctx.role !== "owner" ? (
        <p className={helperClass}>Staff approvals are {allowed ? "on" : "off"}. Only an Owner can change that.</p>
      ) : null}
      <Panel className="p-6">
        <h2 className="font-heading text-sm text-card-foreground">Visits and actions</h2>
        <p className={`mt-1 ${helperClass}`}>Members and Operators do not see this. Internal team notes are not included.</p>
        {rows.length ? (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {rows.map((row) => (
              <li key={row.id} className="py-3">
                <p className="text-sm text-white">
                  {row.who} {ACTION_LABEL[row.action] ?? row.action}
                  {row.detail?.agent ? ` (${row.detail.agent})` : ""}
                  {row.detail?.reason ? `: ${row.detail.reason}` : ""}
                  {row.detail?.minutes != null ? ` after ${row.detail.minutes} min` : ""}
                </p>
                <p className={helperClass}>{formatDateTime(row.at)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-2 ${helperClass}`}>No team visits yet.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
