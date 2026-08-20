"use client";

import { useActionState, useState, useTransition } from "react";

import {
  inviteMember,
  revokeInvite,
  setMemberActive,
  updateMemberRole,
  type MemberActionResult,
} from "@/app/app/settings/members/actions";
import type { OrgRole } from "@/types/database";
import { btnPrimary, btnSecondary, btnSizeSm, errorClass, helperClass, inputClass, labelClass, selectClass } from "@/lib/ui";

const initialInvite: MemberActionResult = { ok: true };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initialInvite);
  const url = state.ok ? state.url : undefined;

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <div>
          <label htmlFor="invite-email" className={labelClass}>
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="setter@studio.example"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className={labelClass}>
            Role
          </label>
          <select id="invite-role" name="role" className={selectClass} defaultValue="setter">
            <option value="setter">Setter</option>
            <option value="closer">Closer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className={`${btnPrimary} ${btnSizeSm}`}>
          {pending ? "Creating…" : "Create invite"}
        </button>
      </div>
      <p className={helperClass}>
        Email delivery lands in a later prompt. Copy the link and share it by hand for now.
      </p>
      {!state.ok ? <p className={errorClass}>{state.error}</p> : null}
      {url ? (
        <p className="break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-silver">
          {url}
        </p>
      ) : null}
    </form>
  );
}

export function MemberRoleSelect({
  memberId,
  role,
  disabled,
  canGrantOwner,
}: {
  memberId: string;
  role: OrgRole;
  disabled?: boolean;
  canGrantOwner: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showOwner = canGrantOwner || role === "owner";

  return (
    <div>
      <select
        className={selectClass}
        defaultValue={role}
        disabled={disabled || pending}
        onChange={(event) => {
          const next = event.target.value as OrgRole;
          startTransition(async () => {
            const result = await updateMemberRole(memberId, next);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        {showOwner ? <option value="owner">Owner</option> : null}
        <option value="admin">Admin</option>
        <option value="closer">Closer</option>
        <option value="setter">Setter</option>
      </select>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

export function MemberActiveToggle({
  memberId,
  active,
  disableDeactivate,
}: {
  memberId: string;
  active: boolean;
  disableDeactivate?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = Boolean(active && disableDeactivate);

  return (
    <div>
      <button
        type="button"
        disabled={pending || blocked}
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() => {
          startTransition(async () => {
            const result = await setMemberActive(memberId, !active);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {blocked ? (
        <p className={helperClass}>The last active owner cannot be deactivated.</p>
      ) : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={`${btnSecondary} ${btnSizeSm}`}
        onClick={() => {
          startTransition(async () => {
            const result = await revokeInvite(inviteId);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        Revoke
      </button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
