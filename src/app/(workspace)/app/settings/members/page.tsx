import { notFound } from "next/navigation";

import {
  InviteForm,
  MemberActiveToggle,
  MemberApprovalToggle,
  MemberGrantToggle,
  MemberRoleSelect,
  OffboardButton,
  ResendInviteButton,
  RevokeInviteButton,
} from "@/app/(workspace)/app/settings/members/members-forms";
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
import { canManageMembers, roleLabel } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { inviteUrl } from "@/lib/auth/paths";
import { formatDayLong } from "@/lib/format";
import { avatarUrls } from "@/lib/portal/avatars";
import { createClient } from "@/lib/supabase/server";
import {
  cardTitle,
  helperClass,
} from "@/lib/ui";

const WORKS_LEADS = new Set(["owner", "setter", "closer", "operator"]);

export default async function MembersSettingsPage() {
  const ctx = await getAuthContext();
  const manager = canManageMembers(ctx.role, ctx.isStaff);
  if (!manager && ctx.workspaceRole !== "member") notFound();

  const supabase = await createClient();
  const [{ data: seats }, { data: invites }] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, display_name, email, role, active, user_id, logged_outcome_from_mobile_at, seat, can_approve, can_see_money, can_export, can_see_transcripts, can_manage_connections, is_agent_identity, avatar_path")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("org_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at, surface_access")
      .eq("org_id", ctx.org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // Customer seats are managed here. Staff seats follow assignments and are
  // listed separately, without controls.
  const members = (seats ?? []).filter((seat) => seat.seat === "customer");
  const team = (seats ?? []).filter((seat) => seat.seat === "staff" && seat.active);

  const photos = await avatarUrls(ctx.org.id, members.map((member) => member.avatar_path));
  const photo = (path: string | null) => (path ? (photos.get(path) ?? null) : null);

  const activeOwners = (members ?? []).filter(
    (member) => member.active && member.role === "owner"
  ).length;

  if (!manager) {
    return (
      <PageFrame title="People" description="Who is in this workspace. An owner adds and removes people.">
        <Panel className="px-6 py-5">
          <ul className="space-y-3">
            {members
              .filter((member) => member.active && !member.is_agent_identity)
              .map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-sm text-white">
                  <PersonAvatar name={member.display_name} src={photo(member.avatar_path)} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{member.display_name}</span>
                  <span className="text-silver">{roleLabel(member.role)}</span>
                </li>
              ))}
          </ul>
        </Panel>
        {team.length > 0 ? (
          <Panel className="px-6 py-5">
            <h2 className={cardTitle}>Your Vistrial team</h2>
            <ul className="mt-3 space-y-2">
              {team.map((person) => (
                <li key={person.id} className="flex items-center gap-2 text-sm text-white">
                  <PersonAvatar name={person.display_name} size="sm" />
                  {person.display_name}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </PageFrame>
    );
  }

  const workers = members.filter((member) => member.active && WORKS_LEADS.has(member.role));

  return (
    <PageFrame
      title="People"
      description="Invite your team. Removing someone ends their access at once; what they did stays under their name."
    >
      <Panel className="mb-8 p-6">
        <h2 className={cardTitle}>Invite</h2>
        <div className="mt-4">
          <InviteForm canInviteOwner={ctx.isStaff} />
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
              <TableHead>Approves</TableHead>
              <TableHead className="hidden lg:table-cell">Money</TableHead>
              <TableHead className="hidden lg:table-cell">Export</TableHead>
              <TableHead className="hidden lg:table-cell">Transcripts</TableHead>
              <TableHead className="hidden lg:table-cell">Connections</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((member) => {
              const lastOwner =
                member.role === "owner" && member.active && activeOwners <= 1;
              const ownerLocked = member.role === "owner" && !ctx.isStaff && member.user_id !== ctx.user.id;
              return (
                <TableRow key={member.id}>
                  <TableCell className="text-white">
                    <span className="inline-flex items-center gap-2">
                      <PersonAvatar name={member.display_name} src={photo(member.avatar_path)} size="sm" />
                      {member.display_name}
                      {ctx.isStaff && member.is_agent_identity ? (
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
                      disabled={lastOwner || ownerLocked}
                      canGrantOwner={ctx.isStaff}
                    />
                  </TableCell>
                  <TableCell>
                    <MemberApprovalToggle
                      memberId={member.id}
                      role={member.role}
                      canApprove={member.can_approve}
                    />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <MemberGrantToggle memberId={member.id} role={member.role} grant="money" value={member.can_see_money} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <MemberGrantToggle memberId={member.id} role={member.role} grant="export" value={member.can_export} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <MemberGrantToggle
                      memberId={member.id}
                      role={member.role}
                      grant="transcripts"
                      value={Boolean(member.can_see_transcripts)}
                      disabled={ctx.isStaff || ctx.role !== "owner"}
                    />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <MemberGrantToggle
                      memberId={member.id}
                      role={member.role}
                      grant="connections"
                      value={Boolean(member.can_manage_connections)}
                      disabled={ctx.isStaff || ctx.role !== "owner"}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge
                      label={member.active ? "active" : "inactive"}
                      tone={member.active ? "good" : "neutral"}
                    />
                  </TableCell>
                  <TableCell>
                    {member.role === "setter" || member.role === "operator" ? (
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
                    {member.active ? (
                      <OffboardButton
                        memberId={member.id}
                        name={member.display_name}
                        others={workers
                          .filter((other) => other.id !== member.id)
                          .map((other) => ({ id: other.id, name: other.display_name }))}
                        disabled={lastOwner || ownerLocked || member.user_id === ctx.user.id}
                      />
                    ) : (
                      <MemberActiveToggle memberId={member.id} active={false} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      {team.length > 0 ? (
        <Panel className="mb-8 px-6 py-5">
          <h2 className={cardTitle}>Your Vistrial team</h2>
          <p className={`${helperClass} mt-1`}>
            The people at Vistrial working this account. Their access comes from Vistrial, not this list.
          </p>
          <ul className="mt-3 space-y-2">
            {team.map((person) => (
              <li key={person.id} className="flex items-center gap-2 text-sm text-white">
                <PersonAvatar name={person.display_name} size="sm" />
                {person.display_name}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

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
            We emailed each of these. Resend gives the link another 7 days.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
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
                  <TableCell className="text-silver">{roleLabel(invite.role)}</TableCell>
                  <TableCell className="hidden text-silver md:table-cell">
                    {formatDayLong(invite.expires_at)}
                  </TableCell>
                  <TableCell className="max-w-[14rem] break-all text-xs text-dim">
                    {inviteUrl(invite.token)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <ResendInviteButton inviteId={invite.id} />
                      <RevokeInviteButton inviteId={invite.id} />
                    </div>
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
