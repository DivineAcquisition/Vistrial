import {
  InviteForm,
  MemberActiveToggle,
  MemberRoleSelect,
  RevokeInviteButton,
} from "@/app/app/settings/members/members-forms";
import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembersManager } from "@/lib/auth/gates";
import { inviteUrl } from "@/lib/auth/paths";
import { formatDayLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";

export default async function MembersSettingsPage() {
  const ctx = await requireMembersManager();

  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, display_name, email, role, active, user_id")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
      .eq("org_id", ctx.org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const activeOwners = (members ?? []).filter(
    (member) => member.active && member.role === "owner"
  ).length;

  return (
    <PageFrame
      title="Members"
      description="Invite setters and closers. Deactivate instead of deleting — touches and calls keep attribution."
    >
      <Panel className="mb-8 px-6 py-6">
        <h2 className="text-sm font-semibold text-white">Invite</h2>
        <div className="mt-4">
          <InviteForm />
        </div>
      </Panel>

      <Panel className="mb-8 overflow-hidden px-2 py-2 sm:px-4">
        <h2 className="px-2 pt-3 text-sm font-semibold text-white">Current members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((member) => {
              const lastOwner =
                member.role === "owner" && member.active && activeOwners <= 1;
              return (
                <TableRow key={member.id}>
                  <TableCell className="text-white">{member.display_name}</TableCell>
                  <TableCell className="text-silver">{member.email}</TableCell>
                  <TableCell>
                    <MemberRoleSelect
                      memberId={member.id}
                      role={member.role}
                      disabled={lastOwner}
                      canGrantOwner={ctx.role === "owner"}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={member.active ? "active" : "inactive"}
                      tone={member.active ? "good" : "neutral"}
                    />
                  </TableCell>
                  <TableCell>
                    <MemberActiveToggle
                      memberId={member.id}
                      active={member.active}
                      disableDeactivate={lastOwner}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      {(invites ?? []).length === 0 ? (
        <EmptyState
          kind="empty"
          title="No pending invites"
          detail="There are no open invites for this workspace right now. Create one above when you need to add someone."
        />
      ) : (
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <h2 className="px-2 pt-3 text-sm font-semibold text-white">Pending invites</h2>
          <p className={`${helperClass} px-2`}>
            Share the link by hand until email delivery is wired.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Link</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invites ?? []).map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="text-white">{invite.email}</TableCell>
                  <TableCell className="capitalize text-silver">{invite.role}</TableCell>
                  <TableCell className="text-silver">{formatDayLong(invite.expires_at)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-dim">
                    {inviteUrl(invite.token)}
                  </TableCell>
                  <TableCell>
                    <RevokeInviteButton inviteId={invite.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </PageFrame>
  );
}
