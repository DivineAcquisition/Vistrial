"use client";

import { useActionState, useState } from "react";

import {
  activateWorkspace,
  declineStatedBaseline,
  moveActivationTimestamp,
} from "@/app/app/settings/business-profile/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ACTIVATION_WARNING_LABELS } from "@/lib/profile/vocabulary";
import type { ActivationChange, ActivationReadiness } from "@/lib/profile/types";
import {
  cardTitle,
  errorClass,
  helperClass,
} from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function ActivationGate({
  activation,
  changes,
  activatedByName,
  backfillNeedsFallback,
}: {
  activation: ActivationReadiness;
  changes: ActivationChange[];
  activatedByName: string | null;
  backfillNeedsFallback: boolean;
}) {
  const [state, action, pending] = useActionState(activateWorkspace, idle);
  const [moveState, moveAction, moving] = useActionState(moveActivationTimestamp, idle);
  const [declineState, declineAction, declining] = useActionState(declineStatedBaseline, idle);
  const [showMove, setShowMove] = useState(false);

  if (activation.activatedAt) {
    return (
      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={cardTitle}>Activated</h2>
            <p className={helperClass}>
              This is the line between baseline and measured. Every outcome number this workspace is
              ever shown is anchored to it.
            </p>
          </div>
          <StatusBadge label="Live" tone="good" />
        </div>

        <DefinitionList>
          <KeyValue label="Activated at">
            {new Date(activation.activatedAt).toLocaleString()}
          </KeyValue>
          <KeyValue label="Activated by">{activatedByName ?? "—"}</KeyValue>
          <KeyValue label="Warnings acknowledged">
            {activation.record && activation.record.warningsAcknowledged.length > 0
              ? activation.record.warningsAcknowledged
                  .map((key) => ACTIVATION_WARNING_LABELS[key] ?? key)
                  .join(", ")
              : "None"}
          </KeyValue>
        </DefinitionList>

        {activation.record && activation.record.requirements.length > 0 ? (
          <ul className="mt-4 space-y-1.5 text-sm text-silver">
            {activation.record.requirements.map((requirement) => (
              <li key={requirement.key}>
                {requirement.label}: {requirement.detail}
              </li>
            ))}
          </ul>
        ) : null}

        {changes.length > 0 ? (
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className={cardTitle}>This timestamp has been moved</p>
            <ul className="mt-3 space-y-3 text-sm text-silver">
              {changes.map((change) => (
                <li key={change.createdAt}>
                  {new Date(change.previousAt).toLocaleString()} →{" "}
                  {new Date(change.newAt).toLocaleString()} by {change.actorName ?? "an admin"} on{" "}
                  {new Date(change.createdAt).toLocaleDateString()}. {change.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 border-t border-white/10 pt-5">
          {showMove ? (
            <form action={moveAction} className="space-y-4">
              <p className="text-sm text-flag-warning">
                Moving this shifts every historical figure this workspace has been shown. Deals will
                move between the before and after side of the line, and the comparison will change.
              </p>
              <Field label="Move it to" name="new_at">
                <Input id="new_at" name="new_at" type="datetime-local" required />
              </Field>
              <Field
                label="Why, in writing"
                name="reason"
                help="At least twenty characters. This is kept against the workspace permanently."
              >
                <Textarea id="reason" name="reason" rows={3} required minLength={20} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <SubmitButton variant="destructive" pending={moving} loadingLabel="Moving">
                  Move the activation timestamp
                </SubmitButton>
                <Button variant="ghost" onClick={() => setShowMove(false)}>
                  Cancel
                </Button>
              </div>
              {moveState.status === "error" ? <p className={errorClass}>{moveState.error}</p> : null}
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setShowMove(true)}>
              Move the activation timestamp
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={cardTitle}>Going live</h2>
          <p className={helperClass}>
            Activation sets the line between what happened before Vistrial and what happens after.
            It is captured once.
          </p>
        </div>
        <StatusBadge
          label={activation.blocked ? "Blocked" : "Ready"}
          tone={activation.blocked ? "critical" : "good"}
        />
      </div>

      <ul className="mt-5 space-y-3">
        {activation.hard.map((requirement) => (
          <li key={requirement.key} className="flex flex-wrap items-start gap-3">
            <StatusBadge
              label={requirement.ok ? "Done" : "Blocking"}
              tone={requirement.ok ? "good" : "critical"}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{requirement.label}</p>
              <p className={helperClass}>{requirement.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {backfillNeedsFallback ? (
        <form action={declineAction} className="mt-5 space-y-3 border-t border-white/10 pt-5">
          <p className="text-sm text-white">
            The CRM history is unusable. Either record the owner&apos;s own prior figures on the
            integrations page, or record that they will not give them.
          </p>
          <Input name="note" type="text" placeholder="Optional note" />
          <SubmitButton variant="secondary" pending={declining} loadingLabel="Recording">
            They declined to state prior figures
          </SubmitButton>
          <p className={helperClass}>
            Declining is fine. It means no before-and-after comparison will ever be shown, which is
            better than inventing one.
          </p>
          {declineState.status === "error" ? <p className={errorClass}>{declineState.error}</p> : null}
        </form>
      ) : null}

      <form action={action} className="mt-6 space-y-4 border-t border-white/10 pt-6">
        {activation.warnings.length > 0 ? (
          <>
            <p className={cardTitle}>
              You can go live with these, but you have to say you have read them
            </p>
            {activation.warnings.map((warning) => (
              <label key={warning.key} className="flex items-start gap-3 text-sm text-white">
                <Checkbox name="acknowledge" value={warning.key} className="mt-0.5" />
                <span>
                  {warning.label}
                  <span className="block text-dim">{warning.detail}</span>
                  {warning.affects.length > 0 ? (
                    <span className="block text-dim">Affects: {warning.affects.join("; ")}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </>
        ) : (
          <p className={helperClass}>No warnings on this workspace.</p>
        )}

        <SubmitButton
          variant="gradient"
          pending={pending}
          loadingLabel="Going live"
          disabled={activation.blocked}
        >
          Go live
        </SubmitButton>
        {activation.blocked ? (
          <p className={helperClass}>
            Everything above marked blocking has to be done first. There is no override.
          </p>
        ) : null}
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      </form>
    </Panel>
  );
}
