"use client";

import { useActionState, useState, useTransition } from "react";

import {
  inviteMember,
  offboardMember,
  resendInvite,
  revokeInvite,
  setMemberActive,
  setMemberApproval,
  setMemberGrant,
  updateMemberRole,
  type MemberActionResult,
} from "@/app/(workspace)/app/settings/members/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
        Operators work the leads assigned to them and the unassigned queue. Members see Home and Results, and
        approve, see money, or export only if you allow it. We email the invite; the link works for 7 days.
      </p>
      {!state.ok ? <p className={errorClass}>{state.error}</p> : null}
      {url ? (
        <div className={cn(insetChrome, "space-y-3 px-3 py-3")} role="status">
          <p className="text-sm text-white">
            {state.ok && state.emailed
              ? "Invite emailed. You can also copy the link."
              : `The invite is ready, but the email did not send${state.ok && state.emailError ? ` (${state.emailError})` : ""}. Copy the link and share it.`}
          </p>
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
        Cancel invite
      </Button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

export function ResendInviteButton({ inviteId }: { inviteId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendInvite(inviteId);
            setMessage(result.ok ? { ok: true, text: "Sent again." } : { ok: false, text: result.error });
          })
        }
      >
        Resend
      </Button>
      {message ? (
        <p role="status" className={message.ok ? helperClass : errorClass}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** A Member's money or export permission. Owners and staff always have both. */
export function MemberGrantToggle({
  memberId,
  role,
  grant,
  value,
}: {
  memberId: string;
  role: OrgRole;
  grant: "money" | "export";
  value: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (role === "owner") return <span className="text-sm text-silver">Yes</span>;
  if (role !== "member") return <span className="text-sm text-dim">No</span>;
  return (
    <div>
      <Select
        density="compact"
        defaultValue={value ? "yes" : "no"}
        disabled={pending}
        aria-label={grant === "money" ? "Sees money" : "Can export"}
        onChange={(event) => {
          const next = event.target.value === "yes";
          startTransition(async () => {
            const result = await setMemberGrant(memberId, grant, next);
            setError(result.ok ? null : result.error);
          });
        }}
      >
        <option value="no">No</option>
        <option value="yes">{grant === "money" ? "Sees money" : "Can export"}</option>
      </Select>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

/** Remove someone, handing their leads, approvals, and tasks to another person first. */
export function OffboardButton({
  memberId,
  name,
  others,
  disabled,
}: {
  memberId: string;
  name: string;
  others: Array<{ id: string; name: string }>;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<string>(others[0]?.id ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="secondary" size="sm" disabled={disabled}>
            Remove
          </Button>
        }
        title={`Remove ${name}?`}
        description="They lose access at once. What they did stays under their name. Their open leads, approvals, and tasks move to the person you choose."
        confirmLabel="Remove"
        onConfirm={async () => {
          const result = await offboardMember(memberId, target || null);
          setMessage(
            result.ok
              ? {
                  ok: true,
                  text: `Removed. Moved ${result.leads} ${result.leads === 1 ? "lead" : "leads"}, ${result.approvals} ${result.approvals === 1 ? "approval" : "approvals"}, and ${result.tasks} ${result.tasks === 1 ? "task" : "tasks"}.`,
                }
              : { ok: false, text: result.error }
          );
        }}
      >
        <Field label="Hand their work to" name="reassign" htmlFor={`reassign-${memberId}`}>
          <Select
            id={`reassign-${memberId}`}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            options={[...others.map((person) => ({ value: person.id, label: person.name })), { value: "", label: "Nobody, leave it unassigned" }]}
          />
        </Field>
      </ConfirmDialog>
      {message ? (
        <p role="status" className={message.ok ? helperClass : errorClass}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
