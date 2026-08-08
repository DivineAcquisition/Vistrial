import { AccountPanel } from "@/components/account/account-panel";
import { requireAdmin } from "@/lib/auth";
import { listTeamSessions } from "@/lib/db/team";
import { helperClass } from "@/lib/ui";

export const metadata = { title: "Account" };

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const admin = await requireAdmin();
  const sessions = await listTeamSessions(admin.team.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Your account</h1>
        <p className={helperClass}>
          Profile, password, two-factor, and sessions for {admin.email}.
        </p>
      </div>
      <AccountPanel team={admin.team} sessions={sessions} />
    </div>
  );
}
