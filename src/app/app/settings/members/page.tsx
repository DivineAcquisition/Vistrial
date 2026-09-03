import {
  InviteForm,
  MemberActiveToggle,
  MemberRoleSelect,
  MemberSurfaceSelect,
  RevokeInviteButton,
} from "@/app/app/settings/members/members-forms";
import { PageFrame } from "@/components/app/page-frame";
import { PersonAvatar } from "@/components/app/person-avatar";
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
import {
  cardTitle,
  helperClass,
} from "@/lib/ui";

export default async function MembersSettingsPage() {
  const ctx = await requireMembersManager();

  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: platformAdmins }] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, display_name, email, role, active, user_id, logged_outcome_from_mobile_at, surface_access, is_agent_identity")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at, surface_access")
      .eq("org_id", ctx.org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("platform_admins").select("user_id"),
  ]);

  const platformAdminIds = new Set((platformAdmins ?? []).map((row) => row.user_id));

  const activeOwners = (members ?? []).filter(
    (member) => member.active && member.role === "owner"
  ).length;

  return (
    <PageFrame
      title="People"
      description="Invite setters and closers. Deactivate instead of deleting — touches and calls keep attribution."
    >
      <Panel className="mb-8 p-6">
        <h2 className={cardTitle}>Invite</h2>
        <div className="mt-4">
          <InviteForm />
        </div>
      </Panel>

      <Panel className="mb-8 overflow-hidden px-2 py-2 sm:px-4">
        <h2 className="px-2 pt-3 font-heading text-sm text-white">Current members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>App</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((member) => {
              const lastOwner =
                member.role === "owner" && member.active && activeOwners <= 1;
              const platformLocked = platformAdminIds.has(member.user_id);
              return (
                <TableRow key={member.id}>
                  <TableCell className="text-white">
                    <span className="inline-flex items-center gap-2">
                      <PersonAvatar name={member.display_name} size="sm" />
                      {member.display_name}
                      {ctx.isPlatformAdmin && member.is_agent_identity ? (
                        <StatusBadge label="Runs scheduled work" tone="neutral" />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden break-all text-silver md:table-cell">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <MemberRoleSelect
                      memberId={member.id}
                      role={member.role}
                      disabled={lastOwner || platformLocked}
                      canGrantOwner={ctx.role === "owner" || ctx.isPlatformAdmin}
                    />
                    {platformLocked ? (
                      <p className={`${helperClass} mt-1`}>Super admin</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <MemberSurfaceSelect
                      memberId={member.id}
                      surface={member.surface_access === "portal" ? "portal" : "operator"}
                      role={member.role}
                      disabled={platformLocked}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge
                      label={member.active ? "active" : "inactive"}
                      tone={member.active ? "good" : "neutral"}
                    />
                  </TableCell>
                  <TableCell>
                    {member.role === "setter" ? (
                      <StatusBadge
                        label={
                          member.logged_outcome_from_mobile_at
                            ? "logged from phone"
                            : "not trained"
                        }
                        tone={member.logged_outcome_from_mobile_at ? "good" : "warning"}
                      />
                    ) : (
                      <StatusBadge
                        label={
                          member.logged_outcome_from_mobile_at ? "logged from phone" : "desk"
                        }
                        tone="neutral"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <MemberActiveToggle
                      memberId={member.id}
                      active={member.active}
                      disableDeactivate={lastOwner || platformLocked}
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
          <h2 className="px-2 pt-3 font-heading text-sm text-white">Pending invites</h2>
          <p className={`${helperClass} px-2`}>
            Copy the link and share it. Invites are not emailed yet.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>App</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead>Link</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invites ?? []).map((invite) => (
                <TableRow key={invite.id}>
                <TableCell className="break-all text-white">
                  <span className="inline-flex items-center gap-2">
                    <PersonAvatar name={invite.email} size="sm" />
                    {invite.email}
                  </span>
                </TableCell>
                  <TableCell className="capitalize text-silver">{invite.role}</TableCell>
                  <TableCell className="text-silver">
                    {invite.surface_access === "portal" ? "Report only" : "Team app"}
                  </TableCell>
                  <TableCell className="hidden text-silver md:table-cell">
                    {formatDayLong(invite.expires_at)}
                  </TableCell>
                  <TableCell className="max-w-[14rem] break-all text-xs text-dim">
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
