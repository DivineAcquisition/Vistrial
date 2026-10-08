import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthContext } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { describeActivity } from "@/lib/workspaces/activity-labels";

/**
 * What you did in this workspace: approvals, invites, sign-ins. Row-level
 * security returns only your own entries, never the Vistrial team's.
 */
export default async function HistorySettingsPage() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("workspace_activity_log")
    .select("id, created_at, action")
    .eq("org_id", ctx.org.id)
    .eq("actor_user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <PageFrame title="Your history" description="What you have done in this workspace, newest first.">
      {(rows ?? []).length === 0 ? (
        <EmptyState kind="empty" title="Nothing yet" detail="Approvals, invites and sign-ins you make show up here." />
      ) : (
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>What</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-silver">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-white">{describeActivity(row.action)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </PageFrame>
  );
}
