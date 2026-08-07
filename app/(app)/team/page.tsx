import Link from "next/link";
import { redirect } from "next/navigation";

import { InviteForm, roleLabel } from "@/components/team/invite-form";
import {
  cancelTeamInviteAction,
  resendTeamInviteAction,
  syncInvitationExpiry,
} from "@/lib/actions/team";
import { requireAdmin } from "@/lib/auth";
import { listInvitations, listTeamUsers } from "@/lib/db/team";
import { roleHas } from "@/lib/team/permissions";
import { btnSecondary, btnSizeSm, helperClass } from "@/lib/ui";
import type { TeamUser } from "@/types/database";

export const metadata = { title: "Team" };

function statusLabel(user: TeamUser): string {
  if (user.status === "locked") return "Locked";
  if (user.status === "deactivated") return "Deactivated";
  if (user.status === "pending" || user.onboarding_step !== "done") {
    if (user.invitation_status === "expired") return "Expired invite";
    if (user.invitation_status === "cancelled") return "Cancelled invite";
    return "Pending";
  }
  return "Active";
}

export default async function TeamPage() {
  const admin = await requireAdmin();
  if (!roleHas(admin.team.role, "manage_users")) {
    redirect("/attention");
  }

  await syncInvitationExpiry().catch(() => undefined);

  const [users, invitations] = await Promise.all([
    listTeamUsers(),
    listInvitations(),
  ]);

  const pendingInvites = invitations.filter(
    (row) =>
      row.invitation_status === "pending" ||
      row.invitation_status === "expired" ||
      row.invitation_status === "cancelled"
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">Team</h1>
        <p className={helperClass}>
          Divine Acquisition team accounts only. Client portal users are a
          separate population.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Invite someone</h2>
        <InviteForm canInviteOwner={admin.team.role === "owner"} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">People</h2>
        {users.length === 0 ? (
          <p className="text-sm text-dim">No team users yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-[11px] uppercase tracking-wide text-dim">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last sign in</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/team/${user.id}`}
                        className="text-brand-500 hover:text-brand-400"
                      >
                        {user.full_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-silver">{user.email}</td>
                    <td className="px-4 py-3 text-silver">
                      {roleLabel(user.role)}
                    </td>
                    <td className="px-4 py-3 text-silver">{statusLabel(user)}</td>
                    <td className="px-4 py-3 text-dim">
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-dim">
                      {user.joined_at
                        ? new Date(user.joined_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Invitations</h2>
          <Link
            href="/team/activity"
            className="text-xs text-brand-500 hover:text-brand-400"
          >
            Activity log
          </Link>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="text-sm text-dim">No invitations yet.</p>
        ) : (
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div className="text-sm">
                  <p className="text-white">{invite.email}</p>
                  <p className="text-xs text-dim">
                    {roleLabel(invite.role)} · {invite.invitation_status} ·{" "}
                    sent by {invite.invited_by_label ?? "—"}
                    {invite.invited_at
                      ? ` · ${new Date(invite.invited_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                {invite.invitation_status === "pending" ||
                invite.invitation_status === "expired" ? (
                  <div className="flex gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await resendTeamInviteAction({ id: invite.id });
                      }}
                    >
                      <button
                        type="submit"
                        className={`${btnSecondary} ${btnSizeSm}`}
                      >
                        Resend
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await cancelTeamInviteAction({ id: invite.id });
                      }}
                    >
                      <button
                        type="submit"
                        className={`${btnSecondary} ${btnSizeSm}`}
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
