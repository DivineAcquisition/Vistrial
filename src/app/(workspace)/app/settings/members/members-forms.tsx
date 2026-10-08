"use client";

import { useActionState, useState, useTransition } from "react";

import {
  inviteMember,
  revokeInvite,
  setMemberActive,
  setMemberApproval,
  updateMemberRole,
  type MemberActionResult,
} from "@/app/(workspace)/app/settings/members/actions";
import type { OrgRole } from "@/types/database";
import { InstallSteps } from "@/components/app/install-steps";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorClass, helperClass, insetChrome } from "@/lib/ui";
import { cn } from "@/lib/utils";

const initialInvite: MemberActionResult = { ok: true };

const ROLE_OPTIONS: Array<{ value: OrgRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "member", label: "Member (view only)" },
  { value: "operator", label: "Operator" },
  { value: "setter", label: "Operator · setter" },
  { value: "closer", label: "Operator · closer" },
];

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
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
          <Select id="invite-role" name="role" defaultValue="operator" className="min-w-0">
            {ROLE_OPTIONS.filter((option) => canInviteOwner || option.value !== "owner").map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton variant="primary" size="sm" pending={pending} loadingLabel="Creating">
            Create invite
          </SubmitButton>
      </div>
      <p className={helperClass}>
        Operators work the leads assigned to them and the unassigned queue. Members see results and
        approve only if you allow it. Invites are not emailed yet. Copy the link and share it.
      </p>
      {!state.ok ? <p className={errorClass}>{state.error}</p> : null}
      {url ? (
        <div className={cn(insetChrome, "space-y-3 px-3 py-3")}>
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
        {ROLE_OPTIONS.filter(
          (option) => canGrantOwner || role === "owner" || option.value !== "owner"
        ).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

/** Owners let a member approve drafts and gated actions. */
export function MemberApprovalToggle({
  memberId,
  role,
  canApprove,
}: {
  memberId: string;
  role: OrgRole;
  canApprove: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (role === "owner") return <span className="text-sm text-silver">Approves</span>;
  if (role !== "member") return <span className="text-sm text-dim">No</span>;

  return (
    <div>
      <Select
        density="compact"
        defaultValue={canApprove ? "yes" : "no"}
        disabled={pending}
        aria-label="Can approve"
        onChange={(event) => {
          const next = event.target.value === "yes";
          startTransition(async () => {
            const result = await setMemberApproval(memberId, next);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        <option value="no">No</option>
        <option value="yes">Can approve</option>
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
        {active ? "Remove" : "Restore"}
      </Button>
      {blocked ? (
        <p className={helperClass}>A workspace keeps at least one owner. Make someone else an owner first.</p>
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
