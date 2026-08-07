import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { roleLabel } from "@/components/team/invite-form";
import { UserActions } from "@/components/team/user-actions";
import { requireAdmin } from "@/lib/auth";
import {
  countWorkByActor,
  getTeamUserById,
  listActivityLog,
} from "@/lib/db/team";
import { roleHas } from "@/lib/team/permissions";
import { helperClass } from "@/lib/ui";

export default async function TeamUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  if (!roleHas(admin.team.role, "manage_users")) {
    redirect("/attention");
  }

  const { id } = await params;
  const user = await getTeamUserById(id);
  if (!user) notFound();

  const [work, history] = await Promise.all([
    user.user_id
      ? countWorkByActor(user.user_id)
      : Promise.resolve({
          confirmed: 0,
          rejected: 0,
          disputesResolved: 0,
          chargesProcessed: 0,
        }),
    listActivityLog({ teamUserId: user.id, limit: 40 }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/team" className="text-xs text-brand-500 hover:text-brand-400">
          ← Team
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {user.full_name ?? user.email}
        </h1>
        <p className={helperClass}>
          {user.email} · {roleLabel(user.role)} · {user.status}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">
            Profile
          </p>
          <dl className="mt-2 space-y-1 text-sm text-silver">
            <div>Title: {user.job_title ?? "—"}</div>
            <div>Phone: {user.phone ?? "—"}</div>
            <div>Time zone: {user.timezone ?? "—"}</div>
            <div>
              Joined:{" "}
              {user.joined_at
                ? new Date(user.joined_at).toLocaleString()
                : "—"}
            </div>
            <div>
              Last sign in:{" "}
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString()
                : "—"}
            </div>
            <div>2FA: {user.mfa_enabled ? "Enabled" : "Not enabled"}</div>
          </dl>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">
            Work in the system
          </p>
          <dl className="mt-2 space-y-1 text-sm text-silver">
            <div>Appointments confirmed: {work.confirmed}</div>
            <div>Appointments rejected: {work.rejected}</div>
            <div>Disputes resolved: {work.disputesResolved}</div>
            <div>Credits processed: {work.chargesProcessed}</div>
          </dl>
          <p className={`${helperClass} mt-2`}>
            Attribution survives deactivation. Users are never deleted.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Actions</h2>
        <UserActions
          user={user}
          actorRole={admin.team.role}
          isSelf={user.id === admin.team.id}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Sign-in history</h2>
        {history.filter((e) => e.action === "sign_in" || e.action === "sign_in_failed").length ===
        0 ? (
          <p className="text-sm text-dim">No sign-in events yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-silver">
            {history
              .filter(
                (e) => e.action === "sign_in" || e.action === "sign_in_failed"
              )
              .map((entry) => (
                <li key={entry.id}>
                  {entry.action} · {new Date(entry.created_at).toLocaleString()}
                  {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
