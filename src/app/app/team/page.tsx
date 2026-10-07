import {
  AssignStaffControl,
  CreateWorkspaceForm,
  OpenWorkspaceButton,
  UnassignButton,
  WorkspaceStatusControl,
} from "@/app/app/team/team-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";
import { workspaceStatus } from "@/lib/workspaces/status";

/**
 * Every workspace the person may enter. Row-level security decides the list:
 * a Platform Admin sees all of them, Service Team only their assignments.
 */
export default async function TeamWorkspacesPage() {
  const ctx = await requireStaff();
  const supabase = await createClient();

  const [{ data: orgs }, { data: assignments }, { data: staff }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status, status_reason, created_at, is_platform_workspace")
      .order("name", { ascending: true }),
    ctx.isPlatformAdmin
      ? supabase.from("workspace_assignments").select("org_id, user_id").is("ended_at", null)
      : Promise.resolve({ data: [] as Array<{ org_id: string; user_id: string }> }),
    ctx.isPlatformAdmin
      ? supabase.from("platform_staff").select("user_id, display_name, role, active").eq("active", true)
      : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string; role: string; active: boolean }> }),
  ]);

  const names = new Map((staff ?? []).map((person) => [person.user_id, person.display_name]));
  const serviceTeam = (staff ?? []).filter((person) => person.role === "service_team");
  const assignedTo = (orgId: string) => (assignments ?? []).filter((row) => row.org_id === orgId);

  return (
    <PageFrame
      title="Workspaces"
      description={
        ctx.isPlatformAdmin
          ? "Every client workspace. Status, assignments and new workspaces are yours to manage."
          : "The workspaces assigned to you. A Platform Admin manages assignments."
      }
    >
      {ctx.isPlatformAdmin ? (
        <Panel className="mb-8 p-6">
          <h2 className={cardTitle}>New workspace</h2>
          <div className="mt-4">
            <CreateWorkspaceForm />
          </div>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden px-2 py-2 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Status</TableHead>
              {ctx.isPlatformAdmin ? <TableHead>Assigned</TableHead> : null}
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orgs ?? []).map((org) => {
              const status = workspaceStatus(org.status);
              const assigned = assignedTo(org.id);
              const assignedIds = new Set(assigned.map((row) => row.user_id));
              return (
                <TableRow key={org.id}>
                  <TableCell className="text-white">
                    <div>{org.name}</div>
                    <div className={helperClass}>
                      {org.slug}
                      {org.is_platform_workspace ? " · Vistrial's own" : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {ctx.isPlatformAdmin ? (
                      <WorkspaceStatusControl orgId={org.id} status={org.status} />
                    ) : (
                      <StatusBadge label={status.label} tone={status.tone} />
                    )}
                    {org.status_reason ? <p className={helperClass}>{org.status_reason}</p> : null}
                  </TableCell>
                  {ctx.isPlatformAdmin ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {assigned.map((row) => (
                          <UnassignButton
                            key={row.user_id}
                            orgId={org.id}
                            userId={row.user_id}
                            name={names.get(row.user_id) ?? "Someone"}
                          />
                        ))}
                      </div>
                      <AssignStaffControl
                        orgId={org.id}
                        options={serviceTeam
                          .filter((person) => !assignedIds.has(person.user_id))
                          .map((person) => ({ userId: person.user_id, name: person.display_name }))}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden text-silver md:table-cell">{formatDay(org.created_at)}</TableCell>
                  <TableCell>
                    {org.id === ctx.org.id ? (
                      <StatusBadge label="Open now" tone="brand" />
                    ) : (
                      <OpenWorkspaceButton orgId={org.id} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </PageFrame>
  );
}
