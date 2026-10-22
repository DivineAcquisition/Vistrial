import Link from "next/link";

import { AreaEditor, EntryEditor, MatrixActions, type EditableEntry } from "@/app/(workspace)/app/team/agents/registry/registry-editor";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent registry" };

type Overview = {
  agent_id: string;
  workspaces_on: number;
  working: number;
  waiting: number;
  attention: number;
  stopped: number;
  paused: number;
  notify_me: number;
  request_access: number;
  early_access: number;
};
type AreaRow = { id: string; name: string; description: string; availability: string; sort: number; work_page: { label: string; href: string } | null; version: number };
type Cell = { agent_id: string; stage: string | null; plan_allowed: boolean; locked_override: boolean; paused: boolean };

type Loose = {
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string) => Promise<{ data: Array<Record<string, unknown>> | null }>;
      limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null }>;
    };
  };
};

const STAGE: Record<string, string> = {
  on: "On",
  watch: "On (watching)",
  drafts_only: "On (drafts only)",
  pending: "Waiting for the Owner",
  off_by_choice: "Off by choice",
  off: "Off",
  coming_soon: "Not yet",
};

/**
 * Platform Admin only: every agent with its area, availability, plans,
 * version and how many workspaces have it On; editing with a required note;
 * the per-workspace enablement matrix; interest counts; areas.
 */
export default async function AgentRegistryPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  await requirePlatformAdmin();
  const { workspace } = await searchParams;
  const admin = getSupabaseAdmin() as unknown as Loose;
  const db = await staffDb();
  const workspaceId = workspace && /^[0-9a-f-]{36}$/i.test(workspace) ? workspace : null;
  const [entries, areas, plans, orgs, overview, areaInterest, matrix] = await Promise.all([
    admin.from("agent_registry").select("*").order("sort"),
    admin.from("agent_areas").select("*").order("sort"),
    admin.from("billing_plans").select("id").order("id"),
    admin.from("organizations").select("id, name").limit(500),
    db.rpc("staff_agent_registry_overview"),
    db.rpc("staff_area_interest"),
    workspaceId ? db.rpc("staff_workspace_agents", { p_org_id: workspaceId }) : Promise.resolve({ data: [] }),
  ]);
  const registry = (entries.data ?? []) as unknown as EditableEntry[];
  const areaRows = (areas.data ?? []) as unknown as AreaRow[];
  const stats = new Map(((overview.data ?? []) as Overview[]).map((row) => [row.agent_id, row]));
  const planIds = (plans.data ?? []).map((row) => String(row.id));
  const workspaces = ((orgs.data ?? []) as Array<{ id: string; name: string }>).sort((a, b) => a.name.localeCompare(b.name));
  const cells = (matrix.data ?? []) as Cell[];
  const areaName = (id: string | null) => (id ? areaRows.find((area) => area.id === id)?.name ?? id : "Across areas");

  return (
    <PageFrame
      title="Agent registry"
      description="Every agent Vistrial can host. Edits publish a new version with a note. A new agent or area appears for customers only once a workspace has it on."
    >
      <Panel className="overflow-hidden px-2 py-2">
        <h2 className={`${cardTitle} px-2 pt-2`}>Agents</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Plans</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>On in</TableHead>
              <TableHead>Working, waiting, attention, stopped, paused</TableHead>
              <TableHead>Notify, request, early</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registry.map((entry) => {
              const row = stats.get(entry.id);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-white">{entry.name}</TableCell>
                  <TableCell>{areaName(entry.area_id)}</TableCell>
                  <TableCell>{entry.availability}</TableCell>
                  <TableCell>{entry.included_plans.join(", ") || "None"}</TableCell>
                  <TableCell>{entry.version}</TableCell>
                  <TableCell>{row?.workspaces_on ?? 0}</TableCell>
                  <TableCell className="tabular-nums">
                    {[row?.working, row?.waiting, row?.attention, row?.stopped, row?.paused].map((value) => value ?? 0).join(" · ")}
                  </TableCell>
                  <TableCell className="tabular-nums">{[row?.notify_me, row?.request_access, row?.early_access].map((value) => value ?? 0).join(" · ")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className={`px-2 pb-2 ${helperClass}`}>
          The global kill switch is on <Link href="/app/team/agents" className="underline">Agent oversight</Link>.
        </p>
      </Panel>

      {registry.map((entry) => (
        <Panel key={entry.id} className="p-6">
          <details>
            <summary className={`${cardTitle} cursor-pointer`}>
              Edit {entry.name} <span className={helperClass}>(version {entry.version})</span>
            </summary>
            <div className="mt-4">
              <EntryEditor entry={entry} areas={areaRows.map((area) => ({ id: area.id, name: area.name }))} plans={planIds} />
            </div>
          </details>
        </Panel>
      ))}

      <Panel className="space-y-4 p-6">
        <h2 className={cardTitle}>Areas</h2>
        {areaRows.map((area) => (
          <details key={area.id} className="space-y-3">
            <summary className="cursor-pointer text-sm text-white">
              {area.name} <span className={helperClass}>({area.availability}, {((areaInterest.data ?? []) as Array<{ area_id: string; notify_me: number }>).find((row) => row.area_id === area.id)?.notify_me ?? 0} asked to be told)</span>
            </summary>
            <AreaEditor
              area={{
                id: area.id,
                name: area.name,
                description: area.description,
                availability: area.availability,
                sort: area.sort,
                workLabel: area.work_page?.label ?? "",
                workHref: area.work_page?.href ?? "",
                version: area.version,
              }}
            />
          </details>
        ))}
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm text-brand-300">New area</summary>
          <AreaEditor area={null} />
        </details>
      </Panel>

      <Panel className="space-y-4 p-6">
        <h2 className={cardTitle}>Agents in one workspace</h2>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="space-y-1 text-sm">
            <span className={helperClass}>Workspace</span>
            <select name="workspace" defaultValue={workspaceId ?? ""} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
              <option value="">Choose a workspace</option>
              {workspaces.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-lg border border-border px-3 text-sm">
            Show
          </button>
        </form>
        {workspaceId ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cells.map((cell) => (
                <TableRow key={cell.agent_id}>
                  <TableCell className="text-white">{registry.find((entry) => entry.id === cell.agent_id)?.name ?? cell.agent_id}</TableCell>
                  <TableCell>{cell.paused ? "Paused" : STAGE[cell.stage ?? "on"] ?? cell.stage}</TableCell>
                  <TableCell>{cell.locked_override ? "Locked by staff" : cell.plan_allowed ? "Included" : "Not on this plan"}</TableCell>
                  <TableCell>
                    <MatrixActions orgId={workspaceId} agentId={cell.agent_id} stage={cell.stage} locked={cell.locked_override || !cell.plan_allowed} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className={helperClass}>Choose a workspace to see and change its agents. Turning one on waits for the Owner to confirm.</p>
        )}
      </Panel>
    </PageFrame>
  );
}
