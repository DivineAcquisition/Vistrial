import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { listActivityLog, listTeamUsers } from "@/lib/db/team";
import { roleHas } from "@/lib/team/permissions";
import { helperClass, selectClass } from "@/lib/ui";

export const metadata = { title: "Activity log" };

const ACTIONS = [
  "sign_in",
  "sign_in_failed",
  "sign_out",
  "invitation_sent",
  "invitation_accepted",
  "role_changed",
  "user_deactivated",
  "user_reactivated",
  "password_changed",
  "mfa_enabled",
  "mfa_disabled",
  "sessions_revoked",
  "integration_settings_changed",
  "account_locked",
] as const;

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string; action?: string }>;
}) {
  const admin = await requireAdmin();
  if (!roleHas(admin.team.role, "view_activity_log")) {
    redirect("/attention");
  }

  const { user_id, action } = await searchParams;
  const [entries, users] = await Promise.all([
    listActivityLog({
      teamUserId: user_id,
      action: action || undefined,
      limit: 200,
    }),
    listTeamUsers(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/team" className="text-xs text-brand-300 transition-colors hover:text-brand-200">
          ← Team
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Activity log</h1>
        <p className={helperClass}>
          Security and permission events only. Append-only — no role can edit or
          delete an entry. Separate from appointment and charge history.
        </p>
      </div>

      <form className="flex flex-wrap gap-3">
        <select
          name="user_id"
          defaultValue={user_id ?? ""}
          className={`${selectClass} w-56`}
        >
          <option value="">All users</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name ?? user.email}
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={action ?? ""}
          className={`${selectClass} w-56`}
        >
          <option value="">All actions</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full border border-border px-4 py-2 text-sm text-white"
        >
          Filter
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-dim">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-border px-4 py-3 text-sm"
            >
              <p className="text-white">
                {entry.action}
                <span className="text-dim">
                  {" "}
                  · {new Date(entry.created_at).toLocaleString()}
                </span>
              </p>
              <p className="text-xs text-dim">
                {entry.actor_email ?? "system"}
                {entry.ip_address ? ` · ${entry.ip_address}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
