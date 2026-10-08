"use client";

import { useActionState, useState, useTransition } from "react";

import {
  addStaff,
  assignStaff,
  createWorkspace,
  deactivatePerson,
  reviewHold,
  setWorkspaceStatus,
  unassignStaff,
  updateStaff,
  type TeamActionResult,
} from "@/app/app/team/actions";
import { Button, SubmitButton } from "@/components/ui/button";
import { switchOrg } from "@/lib/auth/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorClass, helperClass } from "@/lib/ui";
import { WORKSPACE_STATUS } from "@/lib/workspaces/status";
import type { PlatformRole, WorkspaceStatus } from "@/types/database";

const initial: TeamActionResult = { ok: true };

function Outcome({ result }: { result: TeamActionResult | null }) {
  if (!result) return null;
  if (!result.ok) return <p className={errorClass}>{result.error}</p>;
  return result.message ? <p className={helperClass}>{result.message}</p> : null;
}

/** Run a server action from a button, and show what came back. */
function useAction() {
  const [result, setResult] = useState<TeamActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<TeamActionResult>) =>
    startTransition(async () => setResult(await action()));
  return { result, pending, run };
}

export function CreateWorkspaceForm({ templates }: { templates: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createWorkspace, initial);
  return (
    <form action={action} className="space-y-3">
      <Field label="Industry template" name="template_id" htmlFor="ws-template">
        <Select
          id="ws-template"
          name="template_id"
          defaultValue={templates[0]?.id ?? ""}
          options={[...templates.map((template) => ({ value: template.id, label: template.name })), { value: "", label: "None (platform defaults only)" }]}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_1fr_auto] sm:items-end">
        <Field label="Business name" name="name" htmlFor="ws-name">
          <Input id="ws-name" name="name" required minLength={2} placeholder="Northside Fitness" />
        </Field>
        <Field label="Timezone" name="timezone" htmlFor="ws-tz">
          <Input id="ws-tz" name="timezone" defaultValue="America/New_York" />
        </Field>
        <Field label="Owner email (optional)" name="owner_email" htmlFor="ws-owner">
          <Input id="ws-owner" name="owner_email" type="email" placeholder="owner@business.example" />
        </Field>
        <SubmitButton variant="primary" size="sm" pending={pending} loadingLabel="Creating">
          Create
        </SubmitButton>
      </div>
      <p className={helperClass}>
        New workspaces start in onboarding on the template you choose. Nothing runs for customers until it passes the go-live check and you make it active.
      </p>
      <Outcome result={state} />
    </form>
  );
}

export function WorkspaceStatusControl({ orgId, status }: { orgId: string; status: WorkspaceStatus }) {
  const { result, pending, run } = useAction();
  const [next, setNext] = useState<WorkspaceStatus>(status);
  const [reason, setReason] = useState("");
  const changed = next !== status;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          density="compact"
          aria-label="Status"
          value={next}
          disabled={pending}
          onChange={(event) => setNext(event.target.value as WorkspaceStatus)}
        >
          {(Object.keys(WORKSPACE_STATUS) as WorkspaceStatus[]).map((value) => (
            <option key={value} value={value}>
              {WORKSPACE_STATUS[value].label}
            </option>
          ))}
        </Select>
        {changed ? (
          <>
            <Input
              density="compact"
              aria-label="Reason"
              placeholder="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-40"
            />
            <Button
              type="button"
              size="sm"
              variant={next === "closed" ? "destructive" : "secondary"}
              disabled={pending}
              onClick={() => run(() => setWorkspaceStatus(orgId, next, reason))}
            >
              Save
            </Button>
          </>
        ) : null}
      </div>
      {changed ? <p className={helperClass}>{WORKSPACE_STATUS[next].detail}</p> : null}
      <Outcome result={result} />
    </div>
  );
}

export function AssignStaffControl({
  orgId,
  options,
}: {
  orgId: string;
  options: Array<{ userId: string; name: string }>;
}) {
  const { result, pending, run } = useAction();
  const [userId, setUserId] = useState("");
  if (options.length === 0) return <p className={helperClass}>Everyone on the Service Team is assigned.</p>;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Select
          density="compact"
          aria-label="Assign someone"
          value={userId}
          disabled={pending}
          onChange={(event) => setUserId(event.target.value)}
        >
          <option value="">Assign…</option>
          {options.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || !userId}
          onClick={() => run(async () => {
            const outcome = await assignStaff(orgId, userId);
            if (outcome.ok) setUserId("");
            return outcome;
          })}
        >
          Assign
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function UnassignButton({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const { result, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Unassign ${name}`}
        onClick={() => run(() => unassignStaff(orgId, userId))}
      >
        {name} ×
      </Button>
      <Outcome result={result} />
    </span>
  );
}

export function AddStaffForm() {
  const [state, action, pending] = useActionState(addStaff, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
        <Field label="Email" name="email" htmlFor="staff-email">
          <Input id="staff-email" name="email" type="email" required placeholder="name@vistrial.io" />
        </Field>
        <Field label="Name" name="display_name" htmlFor="staff-name">
          <Input id="staff-name" name="display_name" placeholder="Jordan Reyes" />
        </Field>
        <Field label="Role" name="role" htmlFor="staff-role">
          <Select id="staff-role" name="role" defaultValue="service_team">
            <option value="service_team">Service Team</option>
            <option value="platform_admin">Platform Admin</option>
          </Select>
        </Field>
        <SubmitButton variant="primary" size="sm" pending={pending} loadingLabel="Adding">
          Add
        </SubmitButton>
      </div>
      <label className="flex items-center gap-2 text-sm text-silver">
        <input type="checkbox" name="template_access" /> Can edit industry templates
      </label>
      <p className={helperClass}>
        Everyone has their own sign-in. New people get an email invite to admin.vistrial.io. Service Team see
        nothing until you assign them a workspace.
      </p>
      <Outcome result={state} />
    </form>
  );
}

export function StaffRow({
  userId,
  role,
  templateAccess,
  isSelf,
}: {
  userId: string;
  role: PlatformRole;
  templateAccess: boolean;
  isSelf: boolean;
}) {
  const { result, pending, run } = useAction();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          density="compact"
          aria-label="Role"
          defaultValue={role}
          disabled={pending || isSelf}
          onChange={(event) =>
            run(() => updateStaff(userId, { role: event.target.value as PlatformRole, templateAccess }))
          }
        >
          <option value="service_team">Service Team</option>
          <option value="platform_admin">Platform Admin</option>
        </Select>
        <Select
          density="compact"
          aria-label="Template access"
          defaultValue={templateAccess ? "yes" : "no"}
          disabled={pending}
          onChange={(event) => run(() => updateStaff(userId, { role, templateAccess: event.target.value === "yes" }))}
        >
          <option value="no">No templates</option>
          <option value="yes">Edits templates</option>
        </Select>
        {isSelf ? null : (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Remove this person's access everywhere? Their history stays.")) {
                run(() => deactivatePerson(userId));
              }
            }}
          >
            Deactivate
          </Button>
        )}
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function HoldReview({ holdId }: { holdId: string }) {
  const { result, pending, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          density="compact"
          aria-label="Note"
          placeholder="Note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-36"
        />
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => reviewHold(holdId, "released", note))}>
          Release
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewHold(holdId, "discarded", note))}>
          Discard
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

/** Enter a workspace from the list. A brand-new assignment shows up on the next load. */
export function OpenWorkspaceButton({ orgId }: { orgId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await switchOrg(orgId);
            if (result.ok) window.location.assign(result.landing);
            else setError(result.error);
          })
        }
      >
        Open
      </Button>
      {error ? <p className={errorClass}>{error}</p> : null}
    </span>
  );
}
