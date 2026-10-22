"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptWarning,
  activateStep,
  approveGoLive,
  cleanUpSample,
  completeCheckin,
  confirmDomain,
  confirmSampleAsStaff,
  confirmSender,
  controlImport,
  decideProblem,
  deleteOnboardingView,
  manageOwnerInvite,
  moveBack,
  nudgeOwner,
  pauseActivation,
  prepareEmailRecords,
  reopenStage,
  resumeWorkspace,
  revokeAcceptance,
  runSampleForCustomer,
  saveOnboardingView,
  saveStageNote,
  saveStaffDetails,
  sentryAlertsOn,
  setEinHandled,
  setRegistrationStatus,
  signOffReview,
  skipStage,
  startImportForCustomer,
  type StaffResult,
} from "@/app/(workspace)/app/team/onboarding/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { REJECTION_CODES, REJECTION_GUIDANCE } from "@/lib/onboarding/registration";
import { checkboxClass, errorClass, filterBar, filterLabel, helperClass, successClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** The outcome line under an action, announced to screen readers. */
function Outcome({ result }: { result: StaffResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className={errorClass}>
        {result.error}
      </p>
    );
  }
  return result.message ? (
    <p role="status" className={successClass}>
      {result.message}
    </p>
  ) : null;
}

function useStaffAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);
  const run = (fn: () => Promise<StaffResult>, after?: (ok: boolean) => void) =>
    start(async () => {
      const outcome = await fn().catch(() => ({
        ok: false as const,
        error: "Something went wrong. Nothing was changed; try again.",
      }));
      setResult(outcome);
      after?.(outcome.ok);
      router.refresh();
    });
  return { pending, result, run };
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export function QueueFilterForm({ filters, showMine }: { filters: Record<string, string>; showMine: boolean }) {
  return (
    <form
      method="get"
      action="/app/team/onboarding"
      className={cn(filterBar, "flex flex-wrap items-end gap-4")}
      role="search"
      aria-label="Filter workspaces in setup"
    >
      <label className="block min-w-48 flex-1">
        <span className={filterLabel}>Search</span>
        <Input name="q" defaultValue={filters.q ?? ""} placeholder="Business name" maxLength={80} />
      </label>
      <label className="block">
        <span className={filterLabel}>Phase</span>
        <Select
          name="phase"
          density="compact"
          defaultValue={filters.phase ?? ""}
          options={[
            { value: "", label: "Any" },
            { value: "open", label: "Not settled" },
            { value: "setup", label: "Setting up" },
            { value: "ready_for_review", label: "Ready for review" },
            { value: "activating", label: "Switching agents on" },
            { value: "live", label: "Live, first week" },
            { value: "paused", label: "Paused" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Waiting on</span>
        <Select
          name="waiting"
          density="compact"
          defaultValue={filters.waiting ?? ""}
          options={[
            { value: "", label: "Anyone" },
            { value: "customer", label: "Customer" },
            { value: "team", label: "Vistrial team" },
            { value: "both", label: "Both" },
            { value: "nobody", label: "Nobody" },
          ]}
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Risk</span>
        <Select
          name="risk"
          density="compact"
          defaultValue={filters.risk ?? ""}
          options={[
            { value: "", label: "Any" },
            { value: "stuck", label: "Stuck" },
            { value: "review", label: "Needs review" },
            { value: "slow", label: "Slow" },
            { value: "fine", label: "On track" },
          ]}
        />
      </label>
      {showMine ? (
        <label className="flex items-center gap-2 text-sm text-strong">
          <input type="checkbox" name="mine" value="1" defaultChecked={filters.mine === "1"} className={checkboxClass} />
          Mine only
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-strong">
        <input type="checkbox" name="settled" value="1" defaultChecked={filters.settled === "1"} className={checkboxClass} />
        Include settled
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
    </form>
  );
}

export function SaveViewForm({ params }: { params: Record<string, string> }) {
  const { pending, result, run } = useStaffAction();
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        run(
          () => saveOnboardingView(name, params),
          (ok) => ok && setName(""),
        );
      }}
    >
      <Field label="Save these filters as" name="view_name" htmlFor="onb-view-name">
        <Input id="onb-view-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Stuck this week" />
      </Field>
      <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={!name.trim()}>
        Save view
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function DeleteViewButton({ id, name }: { id: string; name: string }) {
  const { pending, result, run } = useStaffAction();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() => run(() => deleteOnboardingView(id))}
        aria-label={`Delete the view ${name}`}
      >
        Delete
      </Button>
      <Outcome result={result} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export function StageControls({
  orgId,
  stageKey,
  label,
  status,
  skipped,
  note,
  staffNote,
  eta,
  version,
  canNudge,
}: {
  orgId: string;
  stageKey: string;
  label: string;
  status: string;
  skipped: boolean;
  note: string | null;
  staffNote: string | null;
  eta: string | null;
  version: number;
  canNudge: boolean;
}) {
  const { pending, result, run } = useStaffAction();
  const [customerNote, setCustomerNote] = useState(note ?? "");
  const [internal, setInternal] = useState(staffNote ?? "");
  const [expected, setExpected] = useState(eta ?? "");
  const [reason, setReason] = useState("");
  const id = `stage-${stageKey}`;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-brand-300 underline underline-offset-2">Manage {label}</summary>
      <div className="mt-3 space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => saveStageNote(orgId, stageKey, customerNote, internal, expected, version));
          }}
        >
          <Field label="Note the customer sees" name="note" htmlFor={`${id}-note`} help="Plain words. Shown on their setup page.">
            <Textarea id={`${id}-note`} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} maxLength={500} rows={2} />
          </Field>
          <Field label="Staff-only note" name="staff_note" htmlFor={`${id}-staff`} help="Never shown to the customer.">
            <Textarea id={`${id}-staff`} value={internal} onChange={(event) => setInternal(event.target.value)} maxLength={1000} rows={2} />
          </Field>
          <Field label="Expected by" name="eta" htmlFor={`${id}-eta`} help="Free text, for example “Friday” or “3 to 5 business days”.">
            <Input id={`${id}-eta`} value={expected} onChange={(event) => setExpected(event.target.value)} maxLength={80} />
          </Field>
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            Save notes
          </Button>
        </form>

        <div className="space-y-2">
          <Field label={skipped ? "Why reopen it" : "Why skip or reopen it"} name="reason" htmlFor={`${id}-reason`}>
            <Input id={`${id}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {skipped ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || reason.trim().length < 3}
                onClick={() =>
                  run(
                    () => skipStage(orgId, stageKey, reason, version),
                    (ok) => ok && setReason(""),
                  )
                }
              >
                Skip this stage
              </Button>
            )}
            {skipped || status === "done" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || reason.trim().length < 3}
                onClick={() =>
                  run(
                    () => reopenStage(orgId, stageKey, reason, version),
                    (ok) => ok && setReason(""),
                  )
                }
              >
                Reopen
              </Button>
            ) : null}
            {canNudge ? (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => nudgeOwner(orgId, stageKey))}>
                Remind the Owner
              </Button>
            ) : null}
          </div>
          <p className={helperClass}>A reason of a few words is required, and is kept in the activity log.</p>
        </div>
        <Outcome result={result} />
      </div>
    </details>
  );
}

export function ReviewSignoff({ orgId, signedOff }: { orgId: string; signedOff: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <Field label="Review note (optional)" name="review_note" htmlFor="review-note">
        <Input id="review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <Button type="button" variant={signedOff ? "secondary" : "primary"} size="sm" loading={pending} onClick={() => run(() => signOffReview(orgId, note))}>
        {signedOff ? "Sign off again on the current settings" : "Sign off the settings review"}
      </Button>
      <Outcome result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Go-live checks and approval
// ---------------------------------------------------------------------------

export function AcceptWarning({ orgId, checkKey, label, accepted }: { orgId: string; checkKey: string; label: string; accepted: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [reason, setReason] = useState("");
  if (accepted) {
    return (
      <div>
        <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => run(() => revokeAcceptance(orgId, checkKey))}>
          Withdraw the acceptance
        </Button>
        <Outcome result={result} />
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <Field label={`Why ${label.toLowerCase()} can go live as it is`} name="reason" htmlFor={`accept-${checkKey}`}>
        <Input id={`accept-${checkKey}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </Field>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || reason.trim().length < 3}
        onClick={() => run(() => acceptWarning(orgId, checkKey, reason))}
      >
        Accept this warning
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function ApproveGoLive({ orgId, blocked }: { orgId: string; blocked: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <Field label="Approval note (optional)" name="approve_note" htmlFor="approve-note">
        <Input id="approve-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="primary" disabled={blocked || pending}>
            Approve going live
          </Button>
        }
        title="Approve going live?"
        description="The workspace becomes active with every agent still off. You then switch them on one at a time."
        confirmLabel="Approve going live"
        confirmVariant="primary"
        onConfirm={() => run(() => approveGoLive(orgId, note))}
      />
      {blocked ? <p className={helperClass}>Every check must pass, or have a Platform Admin&apos;s accepted warning, first.</p> : null}
      <Outcome result={result} />
    </div>
  );
}

export function ActivateNext({ orgId, agent, title, plain }: { orgId: string; agent: string; title: string; plain: string }) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm text-strong">{title}</p>
      <p className={helperClass}>{plain}</p>
      <Field label="Note (optional)" name="activate_note" htmlFor={`activate-${agent}`}>
        <Input id={`activate-${agent}`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <Button type="button" variant="primary" size="sm" loading={pending} onClick={() => run(() => activateStep(orgId, agent, note))}>
        Do this step
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function SentryAlertsOn({ orgId, early, isAdmin }: { orgId: string; early: boolean; isAdmin: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState("");
  if (early && !isAdmin) {
    return <p className={helperClass}>The watch period has not ended. Only a Platform Admin can switch the alerts on early.</p>;
  }
  return (
    <div className="space-y-2">
      <Field label={early ? "Why switch the alerts on early (required)" : "Note (optional)"} name="sentry_note" htmlFor="sentry-note">
        <Input id="sentry-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={pending || (early && note.trim().length < 3)}
        onClick={() => run(() => sentryAlertsOn(orgId, note))}
      >
        Switch Sentry&apos;s alerts on
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function ActivationPause({ orgId, paused }: { orgId: string; paused: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {paused ? null : (
        <Field label="Why pause the switch-on" name="pause_reason" htmlFor="pause-reason">
          <Input id="pause-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
        </Field>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || (!paused && reason.trim().length < 3)}
        onClick={() => run(() => pauseActivation(orgId, !paused, reason))}
      >
        {paused ? "Carry on switching agents on" : "Pause the switch-on"}
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function MoveBack({ orgId, phase }: { orgId: string; phase: string }) {
  const { pending, result, run } = useStaffAction();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<"onboarding" | "paused" | "cancelled">("onboarding");
  const stopped = phase === "paused" || phase === "cancelled";
  return (
    <div className="space-y-3">
      <Field label="Reason (shown in the activity log; the customer is told in plain words)" name="reason" htmlFor="move-reason">
        <Input id="move-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
      </Field>
      {stopped ? (
        <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => run(() => resumeWorkspace(orgId, reason))}>
          Resume setup
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Move to" name="target" htmlFor="move-target">
            <Select
              id="move-target"
              value={target}
              onChange={(event) => setTarget(event.target.value as typeof target)}
              options={[
                { value: "onboarding", label: "Back to setup" },
                { value: "paused", label: "Paused" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </Field>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive" size="sm" disabled={pending || reason.trim().length < 3}>
                Move it
              </Button>
            }
            title="Move this workspace back?"
            description="Every agent is switched off straight away. Nothing already sent is affected, and the customer is told."
            confirmLabel="Move it"
            onConfirm={() => run(() => moveBack(orgId, target, reason))}
          />
        </div>
      )}
      <Outcome result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff details and AI pace
// ---------------------------------------------------------------------------

export function StaffDetailsForm({
  orgId,
  internalNote,
  planLabel,
  priceId,
  plans,
}: {
  orgId: string;
  internalNote: string;
  planLabel: string;
  priceId: string;
  plans: Array<{ id: string; label: string }>;
}) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState(internalNote);
  const [plan, setPlan] = useState(priceId ? `${priceId}|${planLabel}` : "");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const [id, ...label] = plan.split("|");
        run(() =>
          saveStaffDetails(orgId, {
            internal_note: note,
            intended_price_id: id ?? "",
            intended_plan_label: label.join("|"),
          }),
        );
      }}
    >
      <Field label="Internal note" name="internal_note" htmlFor="staff-note" help="Staff only. Never shown to the customer.">
        <Textarea id="staff-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} />
      </Field>
      {plans.length ? (
        <Field label="Intended plan" name="plan" htmlFor="staff-plan" help="Recorded only. Nobody is charged here.">
          <Select
            id="staff-plan"
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            placeholder="Not chosen"
            options={[
              { value: "", label: "Not chosen" },
              ...plans.map((item) => ({
                value: `${item.id}|${item.label}`,
                label: item.label,
              })),
            ]}
          />
        </Field>
      ) : (
        <p className={helperClass}>Intended plan: {planLabel || "not chosen"}.</p>
      )}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Save
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function CaseFilePace({ orgId, limit, rate, paused }: { orgId: string; limit: number; rate: number; paused: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [max, setMax] = useState(String(limit));
  const [perHour, setPerHour] = useState(String(rate));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Full case files, at most" name="limit" htmlFor="pace-limit">
          <Input id="pace-limit" type="number" min={0} max={100000} value={max} onChange={(event) => setMax(event.target.value)} />
        </Field>
        <Field label="Per hour" name="rate" htmlFor="pace-rate">
          <Input id="pace-rate" type="number" min={1} max={2000} value={perHour} onChange={(event) => setPerHour(event.target.value)} />
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              saveStaffDetails(orgId, {
                ai_case_file_limit: Number(max),
                ai_rate_per_hour: Number(perHour),
              }),
            )
          }
        >
          Save limits
        </Button>
      </div>
      <Switch
        label="Pause full case files for this workspace"
        aria-label="Pause full case files for this workspace"
        checked={paused}
        disabled={pending}
        onCheckedChange={(next: boolean) => run(() => saveStaffDetails(orgId, { ai_paused: next }))}
      />
      <Outcome result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messaging registration and email
// ---------------------------------------------------------------------------

export function RegistrationStatusForm({
  orgId,
  status,
  code,
  note,
  reference,
  einHandled,
  senderConfirmed,
}: {
  orgId: string;
  status: string;
  code: string;
  note: string;
  reference: string;
  einHandled: boolean;
  senderConfirmed: boolean;
}) {
  const { pending, result, run } = useStaffAction();
  const [next, setNext] = useState(status);
  const [reason, setReason] = useState(code || "other");
  const [text, setText] = useState(note);
  const [ref, setRef] = useState(reference);
  return (
    <div className="space-y-4">
      <Switch
        label="EIN received and submitted"
        aria-label="EIN received and submitted"
        checked={einHandled}
        disabled={pending}
        onCheckedChange={(on: boolean) => run(() => setEinHandled(orgId, on))}
      />
      <p className={helperClass}>
        Get the tax ID from the Owner directly, outside Vistrial, and enter it only in the CRM&apos;s registration form. Nothing about it is stored here.
      </p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => setRegistrationStatus(orgId, next, reason, text, ref));
        }}
      >
        <Field label="Carrier status" name="status" htmlFor="reg-status">
          <Select
            id="reg-status"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            options={[
              { value: "not_registered", label: "Not submitted yet" },
              {
                value: "pending",
                label: "Submitted, waiting for the carriers",
              },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
        </Field>
        {next === "rejected" ? (
          <Field label="What the carriers said" name="code" htmlFor="reg-code" help={REJECTION_GUIDANCE[reason as keyof typeof REJECTION_GUIDANCE]?.fix}>
            <Select
              id="reg-code"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              options={REJECTION_CODES.map((item) => ({
                value: item,
                label: REJECTION_GUIDANCE[item].reason,
              }))}
            />
          </Field>
        ) : null}
        <Field label="Note for the Owner (optional)" name="note" htmlFor="reg-note">
          <Input id="reg-note" value={text} onChange={(event) => setText(event.target.value)} maxLength={300} />
        </Field>
        <Field
          label="Registration reference (optional)"
          name="reference"
          htmlFor="reg-ref"
          help="Staff only. Only the last few characters are ever shown elsewhere."
        >
          <Input id="reg-ref" value={ref} onChange={(event) => setRef(event.target.value)} maxLength={120} />
        </Field>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Save the status
        </Button>
      </form>

      <Switch
        label="Sending number confirmed in the CRM"
        aria-label="Sending number confirmed in the CRM"
        checked={senderConfirmed}
        disabled={pending}
        onCheckedChange={(on: boolean) => run(() => confirmSender(orgId, on))}
      />
      <Outcome result={result} />
    </div>
  );
}

export function EmailRecordsEditor({
  orgId,
  domain,
  recordsText,
  domainConfirmed,
}: {
  orgId: string;
  domain: string;
  recordsText: string;
  domainConfirmed: boolean;
}) {
  const { pending, result, run } = useStaffAction();
  const [host, setHost] = useState(domain);
  const [records, setRecords] = useState(recordsText);
  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => prepareEmailRecords(orgId, host, records));
        }}
      >
        <Field label="Sending domain" name="domain" htmlFor="mail-domain">
          <Input id="mail-domain" value={host} onChange={(event) => setHost(event.target.value)} maxLength={253} placeholder="mail.example.com" />
        </Field>
        <Field
          label="Records the Owner adds"
          name="records"
          htmlFor="mail-records"
          help="One per line: type, host, value, then an optional # and what it is for. Types: TXT, CNAME, MX."
        >
          <Textarea id="mail-records" value={records} onChange={(event) => setRecords(event.target.value)} rows={5} className="font-mono" />
        </Field>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Save and tell the Owner
        </Button>
      </form>
      <Switch
        label="Sending domain confirmed in the CRM"
        aria-label="Sending domain confirmed in the CRM"
        checked={domainConfirmed}
        disabled={pending}
        onCheckedChange={(on: boolean) => run(() => confirmDomain(orgId, on))}
      />
      <Outcome result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import, sample test, check-ins, invitation
// ---------------------------------------------------------------------------

export function ImportControls({ orgId, status, defaultDays, maxDays }: { orgId: string; status: string | null; defaultDays: number; maxDays: number }) {
  const { pending, result, run } = useStaffAction();
  const [days, setDays] = useState(String(defaultDays));
  const open = status === "queued" || status === "running" || status === "paused";
  return (
    <div className="space-y-2">
      {open ? (
        <div className="flex flex-wrap gap-2">
          {status === "paused" ? (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => controlImport(orgId, "resume"))}>
              Resume
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => controlImport(orgId, "pause"))}>
              Pause
            </Button>
          )}
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={pending}>
                Cancel the import
              </Button>
            }
            title="Cancel the import?"
            description="Leads already brought in stay, marked as history. The rest are not brought in."
            confirmLabel="Cancel the import"
            onConfirm={() => run(() => controlImport(orgId, "cancel"))}
          />
        </div>
      ) : status === "failed" ? (
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => controlImport(orgId, "retry"))}>
          Try again from where it stopped
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="Look back (days)"
            name="days"
            htmlFor="import-days"
            help={`Up to ${maxDays}. Past ${defaultDays}, older leads get basic case files only.`}
          >
            <Input id="import-days" type="number" min={1} max={maxDays} value={days} onChange={(event) => setDays(event.target.value)} />
          </Field>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => startImportForCustomer(orgId, Number(days)))}>
            {status ? "Import again" : "Start the import"}
          </Button>
        </div>
      )}
      <Outcome result={result} />
    </div>
  );
}

export function ProblemDecision({ orgId, problemId, label }: { orgId: string; problemId: string; label: string }) {
  const { pending, result, run } = useStaffAction();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => decideProblem(orgId, problemId, "keep"))}
        aria-label={`Keep ${label}`}
      >
        Keep
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => decideProblem(orgId, problemId, "skip"))}
        aria-label={`Skip ${label}`}
      >
        Skip
      </Button>
      <Outcome result={result} />
    </span>
  );
}

export function SampleControls({
  orgId,
  runId,
  status,
  cleaned,
  confirmed,
}: {
  orgId: string;
  runId: string | null;
  status: string | null;
  cleaned: boolean;
  confirmed: boolean;
}) {
  const { pending, result, run } = useStaffAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "running" ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => runSampleForCustomer(orgId))}>
            {runId ? "Run the test again" : "Run the sample test"}
          </Button>
        ) : null}
        {runId && status === "passed" && !confirmed ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => confirmSampleAsStaff(orgId, runId))}>
            Mark as checked with the Owner
          </Button>
        ) : null}
        {runId && !cleaned && status !== "running" ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => cleanUpSample(orgId, runId))}>
            Clean up the sample lead now
          </Button>
        ) : null}
      </div>
      <p className={helperClass}>The sample lead is made up and never contacted. Nothing is sent to anyone.</p>
      <Outcome result={result} />
    </div>
  );
}

export function CheckinForm({ orgId, checkinId, day }: { orgId: string; checkinId: string; day: number }) {
  const { pending, result, run } = useStaffAction();
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => completeCheckin(orgId, checkinId, note, follow));
      }}
    >
      <Field label={`Day ${day} notes`} name="note" htmlFor={`checkin-${checkinId}`}>
        <Textarea id={`checkin-${checkinId}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />
      </Field>
      <Field label="Follow up on (optional)" name="follow_up" htmlFor={`follow-${checkinId}`}>
        <Input id={`follow-${checkinId}`} type="date" value={follow} onChange={(event) => setFollow(event.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={note.trim().length < 3}>
        Complete the check-in
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function OwnerInviteControls({ orgId, email, hasOwner }: { orgId: string; email: string | null; hasOwner: boolean }) {
  const { pending, result, run } = useStaffAction();
  const [address, setAddress] = useState(email ?? "");
  if (hasOwner && !email) return <p className={helperClass}>The Owner has joined.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Owner email" name="owner_email" htmlFor="owner-email">
          <Input id="owner-email" type="email" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={254} />
        </Field>
        {email ? (
          <>
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => manageOwnerInvite(orgId, "resend"))}>
              Resend
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !address.trim() || address.trim().toLowerCase() === email.toLowerCase()}
              onClick={() => run(() => manageOwnerInvite(orgId, "change", address))}
            >
              Change the email and resend
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={pending}>
                  Cancel the invitation
                </Button>
              }
              title="Cancel the Owner's invitation?"
              description="The link stops working. You can send a new one at any time."
              confirmLabel="Cancel the invitation"
              onConfirm={() => run(() => manageOwnerInvite(orgId, "cancel"))}
            />
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || !address.trim()}
            onClick={() => run(() => manageOwnerInvite(orgId, "new", address))}
          >
            Send an invitation
          </Button>
        )}
      </div>
      <Outcome result={result} />
    </div>
  );
}
