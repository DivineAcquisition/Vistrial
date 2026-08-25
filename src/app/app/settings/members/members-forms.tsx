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
import { InstallSteps } from "@/components/app/install-steps";
import { SubmitButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

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
          <Select id="invite-role" name="role"  defaultValue="setter">
            <option value="setter">Setter</option>
            <option value="closer">Closer</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <SubmitButton variant="primary" size="sm" pending={pending} loadingLabel="Creating">
            Create invite
          </SubmitButton>
      </div>
      <p className={helperClass}>
        Email delivery lands in a later prompt. Copy the link and share it by hand for now.
      </p>
      {!state.ok ? <p className={errorClass}>{state.error}</p> : null}
      {url ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
          <p className="break-all text-xs text-silver">{url}</p>
          <p className={helperClass}>
            Share this link, and the install steps, so they can log outcomes from a phone.
          </p>
          <InstallSteps why={false} />
        </div>
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
  const [nextRole, setNextRole] = useState<OrgRole>(role);
  const showOwner = canGrantOwner || role === "owner";
  const dirty = nextRole !== role;

  return (
    <div className="space-y-2">
      <Select
        density="compact"
        value={nextRole}
        disabled={disabled || pending}
        onChange={(event) => setNextRole(event.target.value as OrgRole)}
      >
        {showOwner ? <option value="owner">Owner</option> : null}
        <option value="admin">Admin</option>
        <option value="closer">Closer</option>
        <option value="setter">Setter</option>
      </Select>
      {dirty ? (
        <button
          type="button"
          disabled={pending || disabled}
          className={`${btnSecondary} ${btnSizeSm}`}
          onClick={() => {
            startTransition(async () => {
              const result = await updateMemberRole(memberId, nextRole);
              setError(result.ok ? null : result.error);
            });
          }}
        >
          Save role
        </button>
      ) : null}
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
