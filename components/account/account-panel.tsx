"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  changeOwnPasswordAction,
  regenerateOwnRecoveryCodesAction,
  revokeOwnSessionAction,
  updateOwnProfileAction,
} from "@/lib/actions/team";
import { passwordStrength } from "@/lib/team/password";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import type { TeamSessionRow, TeamUser } from "@/types/database";

export function AccountPanel({
  team,
  sessions,
}: {
  team: TeamUser;
  sessions: TeamSessionRow[];
}) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const strength = useMemo(() => passwordStrength(password), [password]);
  const [recovery, setRecovery] = useState<string[] | null>(null);

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Profile</h2>
        <p className={helperClass}>
          Role: {team.role}. You cannot change your own role.
        </p>
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            start(async () => {
              const result = await updateOwnProfileAction({
                full_name: form.get("full_name"),
                job_title: form.get("job_title"),
                phone: form.get("phone"),
                timezone: form.get("timezone"),
              });
              if (!result.ok) toast.error(result.error);
              else toast.success("Profile saved");
            });
          }}
        >
          <div>
            <label className={labelClass} htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              defaultValue={team.full_name ?? ""}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="job_title">
              Job title
            </label>
            <input
              id="job_title"
              name="job_title"
              defaultValue={team.job_title ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              defaultValue={team.phone ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="timezone">
              Time zone
            </label>
            <input
              id="timezone"
              name="timezone"
              defaultValue={team.timezone ?? ""}
              required
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm} w-fit`}
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Password</h2>
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            start(async () => {
              const result = await changeOwnPasswordAction({
                current_password: form.get("current_password"),
                password: form.get("password"),
                confirm: form.get("confirm"),
              });
              if (!result.ok) toast.error(result.error);
              else {
                toast.success("Password changed");
                event.currentTarget.reset();
                setPassword("");
              }
            });
          }}
        >
          <div>
            <label className={labelClass} htmlFor="current_password">
              Current password
            </label>
            <input
              id="current_password"
              name="current_password"
              type="password"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="password">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className={helperClass}>Strength: {strength.level}</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="confirm">
              Confirm
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`${btnPrimary} ${btnSizeSm} w-fit`}
          >
            Change password
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Two-factor authentication
        </h2>
        <p className={helperClass}>
          Status: {team.mfa_enabled ? "Enabled" : "Not enabled"}. Use
          onboarding continue to enroll or reset factors when required.
        </p>
        {team.mfa_enabled ? (
          <button
            type="button"
            disabled={pending}
            className={`${btnSecondary} ${btnSizeSm}`}
            onClick={() =>
              start(async () => {
                const result = await regenerateOwnRecoveryCodesAction();
                if (!result.ok) toast.error(result.error);
                else {
                  setRecovery(result.data.recoveryCodes);
                  toast.success("New recovery codes generated — save them now");
                }
              })
            }
          >
            Regenerate recovery codes
          </button>
        ) : null}
        {recovery ? (
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs text-silver">
            {recovery.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Active sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-dim">No tracked sessions.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-silver">
                    {session.user_agent?.slice(0, 80) ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-dim">
                    {session.ip_address ?? "Unknown IP"}
                    {session.approx_location
                      ? ` · ${session.approx_location}`
                      : " · location unavailable"}
                    {" · "}
                    {new Date(session.last_seen_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className={`${btnSecondary} ${btnSizeSm}`}
                  onClick={() =>
                    start(async () => {
                      const result = await revokeOwnSessionAction({
                        id: session.id,
                      });
                      if (!result.ok) toast.error(result.error);
                      else toast.success("Session ended");
                    })
                  }
                >
                  End session
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
