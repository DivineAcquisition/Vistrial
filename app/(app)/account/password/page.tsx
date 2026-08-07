import { redirect } from "next/navigation";

import { AccountPanel } from "@/components/account/account-panel";
import { requireAdmin } from "@/lib/auth";
import { listTeamSessions } from "@/lib/db/team";

/** Force-password-reset landing — same account UI, password section first. */
export default async function ForcePasswordPage() {
  const admin = await requireAdmin();
  if (!admin.team.force_password_reset) redirect("/account");
  const sessions = await listTeamSessions(admin.team.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Password reset required
        </h1>
        <p className="mt-2 text-sm text-dim">
          An Owner or Admin required a new password before you continue.
        </p>
      </div>
      <AccountPanel team={admin.team} sessions={sessions} />
    </div>
  );
}
