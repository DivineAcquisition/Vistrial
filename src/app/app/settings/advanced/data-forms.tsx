"use client";

import { useActionState, useState } from "react";

import { updateTranscriptRetention } from "@/app/app/settings/organization/actions";
import { deleteWorkspace, updateAggregateOptOut } from "@/app/app/settings/advanced/data-actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ConnectedProcessor } from "@/lib/settings/processors";
import {
  NOTIFICATION_RETENTION_DAYS,
  TRANSCRIPT_RETENTION_MAX_DAYS,
  TRANSCRIPT_RETENTION_MIN_DAYS,
  WEBHOOK_PAYLOAD_RETENTION_DAYS,
} from "@/lib/ops/constants";
import { cardStack, cardTitle, errorClass, helperClass, successClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function DataPrivacyForms({
  orgName,
  transcriptRetentionDays,
  aggregateOptOut,
  processors,
}: {
  orgName: string;
  transcriptRetentionDays: number;
  aggregateOptOut: boolean;
  processors: ConnectedProcessor[];
}) {
  const [retentionState, saveRetention, retentionPending] = useActionState(
    updateTranscriptRetention,
    idle
  );
  const [optState, saveOpt, optPending] = useActionState(updateAggregateOptOut, idle);
  const [deleteState, setDeleteState] = useState<SettingsSaveResult>(idle);
  const [typedName, setTypedName] = useState("");

  return (
    <div className="space-y-8">
      <Card className="max-w-xl">
        <form action={saveRetention} className={cardStack}>
          <h2 className={cardTitle}>Transcript retention</h2>
          <p className={helperClass}>
            Raw transcript text is cleared after this many days. Extractions and objections stay.
            Range {TRANSCRIPT_RETENTION_MIN_DAYS}–{TRANSCRIPT_RETENTION_MAX_DAYS}.
          </p>
          <Field label="Days" name="transcript_retention_days">
            <Input
              name="transcript_retention_days"
              id="transcript_retention_days"
              type="number"
              min={TRANSCRIPT_RETENTION_MIN_DAYS}
              max={TRANSCRIPT_RETENTION_MAX_DAYS}
              required
              defaultValue={transcriptRetentionDays}
            />
          </Field>
          {retentionState.status === "error" ? <p className={errorClass}>{retentionState.error}</p> : null}
          {retentionState.status === "saved" ? <p className={successClass}>Saved.</p> : null}
          <CardFooter>
            <SubmitButton pending={retentionPending}>Save retention</SubmitButton>
          </CardFooter>
        </form>
      </Card>

      <Card className="max-w-xl">
        <div className={cardStack}>
          <h2 className={cardTitle}>Other retention periods</h2>
          <p className={helperClass}>Shown so the policy is visible in the product. These are not editable here.</p>
          <p className="text-sm text-white">Webhook payloads: {WEBHOOK_PAYLOAD_RETENTION_DAYS} days</p>
          <p className="text-sm text-white">Notification receipts: {NOTIFICATION_RETENTION_DAYS} days</p>
        </div>
      </Card>

      <Card className="max-w-xl">
        <div className={cardStack}>
          <h2 className={cardTitle}>Export</h2>
          <p className={helperClass}>
            Downloads leads, touches, calls, transcripts, extractions, objections, scores, revenue,
            the business profile, reporting snapshots, and baseline tables for {orgName} as JSON.
          </p>
          <Button asChild variant="secondary">
            <a href="/app/settings/data/export">Download JSON</a>
          </Button>
        </div>
      </Card>

      <Card className="max-w-xl">
        <form action={saveOpt} className={cardStack}>
          <h2 className={cardTitle}>Cross-client aggregates</h2>
          <p className={helperClass}>
            Opting out means nothing from this workspace goes into any cross-client figure. You still
            receive benchmarks.
          </p>
          <Switch
            name="aggregate_opt_out"
            defaultChecked={aggregateOptOut}
            label="Opt out of anonymized aggregates"
          />
          {optState.status === "error" ? <p className={errorClass}>{optState.error}</p> : null}
          {optState.status === "saved" ? <p className={successClass}>Saved.</p> : null}
          <CardFooter>
            <SubmitButton pending={optPending}>Save aggregate preference</SubmitButton>
          </CardFooter>
        </form>
      </Card>

      <Card className="max-w-xl">
        <div className={cardStack}>
          <h2 className={cardTitle}>Connected processors</h2>
          <ul className="space-y-2 text-sm text-silver">
            {processors.map((row) => (
              <li key={row.name}>
                <span className="text-white">{row.name}</span> — {row.what}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="max-w-xl">
        <div className={cardStack}>
          <h2 className={cardTitle}>Delete this workspace</h2>
          <p className={helperClass}>
            Type the exact workspace name. This also removes the org&apos;s contribution from
            cross-client aggregates. A deletion record survives.
          </p>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive">
                Delete this workspace
              </Button>
            }
            title="Delete this workspace permanently"
            description={`Type “${orgName}” exactly. This removes every row for this organization and strips its contribution from cross-client aggregates.`}
            confirmLabel="Delete permanently"
            onConfirm={async () => {
              const form = new FormData();
              form.set("confirmation_name", typedName);
              setDeleteState(await deleteWorkspace(idle, form));
            }}
          >
            <Field
              label="Type the workspace name"
              name="confirmation_name"
              help={`Must match “${orgName}” exactly.`}
            >
              <Input
                name="confirmation_name"
                id="confirmation_name"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                required
              />
            </Field>
          </ConfirmDialog>
          {deleteState.status === "error" ? <p className={errorClass}>{deleteState.error}</p> : null}
        </div>
      </Card>
    </div>
  );
}
