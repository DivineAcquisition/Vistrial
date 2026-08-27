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
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorClass, helperClass } from "@/lib/ui";

const initialInvite: MemberActionResult = { ok: true };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initialInvite);
  const url = state.ok ? state.url : undefined;

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Email" name="email" htmlFor="invite-email">
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="setter@studio.example"
          />
        </Field>
        <Field label="Role" name="role" htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="setter">
            <option value="setter">Setter</option>
            <option value="closer">Closer</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
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
  const showOwner = canGrantOwner || role === "owner";

  return (
    <div>
      <Select
        density="compact"
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
      </Select>
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending || blocked}
        onClick={() => {
          startTransition(async () => {
            const result = await setMemberActive(memberId, !active);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        {active ? "Deactivate" : "Reactivate"}
      </Button>
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await revokeInvite(inviteId);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        Revoke
      </Button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
