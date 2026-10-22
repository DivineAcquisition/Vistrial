import { ResultButton, NoteBox } from "@/components/staff/result-button";
import { reviewAgentRun, setAgentHalt } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { formatRelative } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent oversight" };

type Overview = {
  org_id: string;
  org_name: string;
  org_status: string;
  agent_id: string;
  paused: boolean;
  paused_by_owner: boolean;
  platform_halted: boolean;
  last_run_at: string | null;
  runs_24h: number;
  failed_24h: number;
  stuck_now: number;
  waiting: number;
};
type Failure = {
  run_id: string;
  org_name: string;
  agent_id: string;
  status: string;
  subject_label: string | null;
  plain_error: string | null;
  created_at: string;
};
type Halt = { agent_id: string; halted: boolean; reason: string | null; changed_by_name: string | null };
type Entry = { id: string; name: string };

export default async function AgentOversightPage() {
  const ctx = await requireStaff();
  const db = await staffDb();
  const scope = ctx.isPlatformAdmin ? "all" : "mine";
  const now = new Date().toISOString();
  const [{ data: overview }, { data: failures }, { data: halts }, { data: entries }] = await Promise.all([
    db.rpc("staff_agent_overview", { p_scope: scope, p_org_id: null }),
    db.rpc("staff_agent_failures", { p_scope: scope, p_days: 7, p_limit: 50 }),
    db.from("platform_agent_halts").select("agent_id, halted, reason, changed_by_name"),
    (db as unknown as { from: (t: string) => { select: (c: string) => { order: (c: string) => Promise<{ data: Entry[] | null }> } } })
      .from("agent_registry")
      .select("id, name")
      .order("sort"),
  ]);
  const registry = (entries ?? []) as Entry[];
  const nameOf = (id: string) => registry.find((entry) => entry.id === id)?.name ?? id;
  const flagged = ((overview ?? []) as Overview[]).filter(
    (row) => row.platform_halted || row.failed_24h > 0 || row.stuck_now > 0 || (row.paused && !row.paused_by_owner && row.org_status === "active")
  );

  return (
    <PageFrame
      title="Agent oversight"
      description="Where agents are paused, halted, or failing. Marking a run reviewed takes it off this list. It does not start the run again."
    >
      {ctx.isPlatformAdmin ? (
        <Panel className="space-y-3 p-6">
          <h2 className={cardTitle}>Halt everywhere</h2>
          <p className={helperClass}>
            A halt stops the agent in every workspace until a Platform Admin resumes it. Customers see &quot;Paused by the Vistrial team&quot;. Say why. The check must be recent.
          </p>
          <ul className="space-y-3">
            {registry.map(({ id: agentId, name }) => {
              const halt = ((halts ?? []) as Halt[]).find((row) => row.agent_id === agentId);
              return (
                <li key={agentId} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 text-sm text-white">{name}</span>
                  <StatusBadge label={halt?.halted ? "Halted" : "Running"} tone={halt?.halted ? "critical" : "good"} />
                  {halt?.reason ? <span className={helperClass}>{halt.reason}</span> : null}
                  <NoteBox
                    label={halt?.halted ? `Why ${name} should resume` : `Why halt ${name}`}
                    action={(note) => setAgentHalt(agentId, !halt?.halted, note)}
                  />
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden px-2 py-2">
        <h2 className={`${cardTitle} px-2 pt-2`}>Workspaces to look at</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Failed 24h</TableHead>
              <TableHead>Last run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagged.map((row) => (
              <TableRow key={`${row.org_id}-${row.agent_id}`}>
                <TableCell className="text-white">{row.org_name}</TableCell>
                <TableCell>{nameOf(row.agent_id)}</TableCell>
                <TableCell>
                  {row.platform_halted ? "Halted everywhere" : row.paused ? (row.paused_by_owner ? "Paused by the Owner" : "Paused") : row.stuck_now ? "Stuck" : "Running"}
                </TableCell>
                <TableCell>{row.failed_24h}</TableCell>
                <TableCell>{row.last_run_at ? formatRelative(row.last_run_at, now) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {flagged.length === 0 ? <p className={`p-4 ${helperClass}`}>Nothing is halted, stuck, or failing.</p> : null}
      </Panel>

      <Panel className="space-y-4 p-6">
        <h2 className={cardTitle}>Runs nobody has reviewed</h2>
        {((failures ?? []) as Failure[]).map((row) => (
          <div key={row.run_id} className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] py-3">
            <span>
              <span className="block text-sm text-white">
                {row.org_name} · {nameOf(row.agent_id)} · {row.status}
              </span>
              <span className={helperClass}>{row.plain_error ?? row.subject_label ?? "No detail recorded."}</span>
            </span>
            <ResultButton label="Mark reviewed" action={() => reviewAgentRun(row.run_id, "")} />
          </div>
        ))}
        {(failures ?? []).length === 0 ? <p className={helperClass}>No unreviewed failures in the last 7 days.</p> : null}
      </Panel>
    </PageFrame>
  );
}
