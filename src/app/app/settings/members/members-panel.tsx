import {
  InviteForm,
  MemberActiveToggle,
  MemberRoleSelect,
  RevokeInviteButton,
} from "@/app/app/settings/members/members-forms";
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
import { inviteUrl } from "@/lib/auth/paths";
import { formatDayLong, formatRelative } from "@/lib/format";
import { cardTitle, helperClass } from "@/lib/ui";
import type { OrgRole } from "@/types/database";

export type MembersPanelMember = {
  id: string;
  display_name: string;
  email: string;
  role: OrgRole;
  active: boolean;
  user_id: string;
  logged_outcome_from_mobile_at: string | null;
  last_seen_at: string | null;
};

export type MembersPanelInvite = {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expires_at: string;
};

export function MembersPanel({
  members,
  invites,
  platformAdminIds,
  viewerRole,
  isPlatformAdmin,
  now,
}: {
  members: MembersPanelMember[];
  invites: MembersPanelInvite[];
  platformAdminIds: Set<string>;
  viewerRole: OrgRole;
  isPlatformAdmin: boolean;
  now: string;
}) {
  const activeOwners = members.filter((member) => member.active && member.role === "owner").length;

  return (
    <div className="space-y-8">
      <Panel className="p-6">
        <h2 className={cardTitle}>Invite</h2>
        <p className={helperClass}>
          Members are deactivated rather than deleted so their history, coaching, and outcomes stay
          with the organization.
        </p>
        <div className="mt-4">
          <InviteForm />
        </div>
      </Panel>

      <Panel className="overflow-hidden px-2 py-2 sm:px-4">
        <h2 className="px-2 pt-3 text-sm font-semibold text-white">Current members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden lg:table-cell">Training</TableHead>
              <TableHead className="hidden md:table-cell">Last used</TableHead>
              <TableHead>Phone log</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const lastOwner = member.role === "owner" && member.active && activeOwners <= 1;
              const platformLocked = platformAdminIds.has(member.user_id);
              const trained = Boolean(member.logged_outcome_from_mobile_at);
              return (
                <TableRow key={member.id}>
                  <TableCell className="text-white">{member.display_name}</TableCell>
                  <TableCell className="hidden break-all text-silver md:table-cell">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <MemberRoleSelect
                      memberId={member.id}
                      role={member.role}
                      disabled={lastOwner || platformLocked}
                      canGrantOwner={viewerRole === "owner" || isPlatformAdmin}
                    />
                    {platformLocked ? <p className={`${helperClass} mt-1`}>Super admin</p> : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <StatusBadge
                      label={trained ? "trained on phone" : "not yet trained on phone"}
                      tone={trained ? "good" : "warning"}
                    />
                  </TableCell>
                  <TableCell className="hidden text-silver md:table-cell">
                    {member.last_seen_at ? formatRelative(member.last_seen_at, now) : "Never"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={trained ? "logs from phone" : "desk only"}
                      tone={trained ? "good" : "neutral"}
                    />
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

      {invites.length === 0 ? (
        <EmptyState
          kind="empty"
          title="No pending invites"
          detail="There are no open invites for this workspace right now. Create one above when you need to add someone."
        />
      ) : (
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <h2 className="px-2 pt-3 text-sm font-semibold text-white">Pending invites</h2>
          <p className={`${helperClass} px-2`}>Share the link by hand until email delivery is wired.</p>
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
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="break-all text-white">{invite.email}</TableCell>
                  <TableCell className="capitalize text-silver">{invite.role}</TableCell>
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
    </div>
  );
}
