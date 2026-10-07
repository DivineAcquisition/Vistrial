import { AddStaffForm, StaffRow } from "@/app/app/team/team-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export default async function TeamStaffPage() {
  const ctx = await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: staff }, { data: assignments }, { data: orgs }] = await Promise.all([
    supabase
      .from("platform_staff")
      .select("user_id, display_name, email, role, active, template_access, created_at, deactivated_at")
      .order("active", { ascending: false })
      .order("display_name", { ascending: true }),
    supabase.from("workspace_assignments").select("org_id, user_id").is("ended_at", null),
    supabase.from("organizations").select("id, name"),
  ]);
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));

  return (
    <PageFrame
      title="Staff"
      description="Platform Admins see every workspace. Service Team see only the workspaces assigned to them."
    >
      <Panel className="mb-8 p-6">
        <h2 className={cardTitle}>Add someone</h2>
        <div className="mt-4">
          <AddStaffForm />
        </div>
      </Panel>

      <Panel className="overflow-hidden px-2 py-2 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Workspaces</TableHead>
              <TableHead className="hidden md:table-cell">Since</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(staff ?? []).map((person) => {
              const assigned = (assignments ?? []).filter((row) => row.user_id === person.user_id);
              return (
                <TableRow key={person.user_id}>
                  <TableCell className="text-white">
                    <div>{person.display_name}</div>
                    <div className={`${helperClass} break-all`}>{person.email}</div>
                  </TableCell>
                  <TableCell className="text-silver">
                    {person.role === "platform_admin"
                      ? "All"
                      : assigned.length === 0
                        ? "None assigned"
                        : assigned.map((row) => orgName.get(row.org_id) ?? "Unknown").join(", ")}
                  </TableCell>
                  <TableCell className="hidden text-silver md:table-cell">{formatDay(person.created_at)}</TableCell>
                  <TableCell>
                    {person.active ? (
                      <StaffRow
                        userId={person.user_id}
                        role={person.role}
                        templateAccess={person.template_access}
                        isSelf={person.user_id === ctx.user.id}
                      />
                    ) : (
                      <StatusBadge
                        label={person.deactivated_at ? `Deactivated ${formatDay(person.deactivated_at)}` : "Inactive"}
                        tone="neutral"
                      />
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
