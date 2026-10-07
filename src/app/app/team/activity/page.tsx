import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";
import { ACTOR_KIND_LABEL, describeActivity } from "@/lib/workspaces/activity-labels";

const PAGE_SIZE = 200;

/**
 * Who did what, where. Row-level security scopes it: a Platform Admin reads
 * every workspace, Service Team only the workspaces assigned to them.
 */
export default async function TeamActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  const params = await searchParams;
  const orgFilter = typeof params.org === "string" ? params.org : "";
  const supabase = await createClient();

  let query = supabase
    .from("workspace_activity_log")
    .select("id, created_at, org_id, actor_label, actor_kind, action, target_table, target_id")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (orgFilter) query = query.eq("org_id", orgFilter);

  const [{ data: rows }, { data: orgs }] = await Promise.all([
    query,
    supabase.from("organizations").select("id, name").order("name", { ascending: true }),
  ]);
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));

  return (
    <PageFrame
      title="Activity"
      description={
        ctx.isPlatformAdmin
          ? "Everything people and Vistrial did, in every workspace. Entries cannot be changed or removed."
          : "Everything done in the workspaces assigned to you. Entries cannot be changed or removed."
      }
    >
      <nav aria-label="Filter by workspace" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/app/team/activity" className={orgFilter ? "text-silver" : "text-white underline"}>
          All
        </Link>
        {(orgs ?? []).map((org) => (
          <Link
            key={org.id}
            href={`/app/team/activity?org=${org.id}`}
            className={orgFilter === org.id ? "text-white underline" : "text-silver"}
          >
            {org.name}
          </Link>
        ))}
      </nav>
      {(rows ?? []).length === 0 ? (
        <EmptyState kind="empty" title="Nothing yet" detail="Activity shows up here as people work." />
      ) : (
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="hidden md:table-cell">Workspace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-silver">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-white">
                    <div>{row.actor_label}</div>
                    <StatusBadge label={ACTOR_KIND_LABEL[row.actor_kind] ?? row.actor_kind} tone="neutral" />
                  </TableCell>
                  <TableCell className="text-white">
                    <div>{describeActivity(row.action)}</div>
                    {row.target_table ? <div className={helperClass}>{row.target_table}</div> : null}
                  </TableCell>
                  <TableCell className="hidden text-silver md:table-cell">
                    {row.org_id ? (orgName.get(row.org_id) ?? "Removed workspace") : "Platform"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(rows ?? []).length === PAGE_SIZE ? (
            <p className={`${helperClass} px-2 pb-3`}>Showing the latest {PAGE_SIZE}. Filter by workspace to see further back.</p>
          ) : null}
        </Panel>
      )}
    </PageFrame>
  );
}
