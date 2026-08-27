"use client";

import { useActionState, useRef } from "react";

import {
  rerunBaselineBackfill,
  saveSelfReportedBaseline,
  skipBaselineBackfill,
  type ReportingActionResult,
} from "@/app/app/reporting/actions";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cardTitle,
  errorClass,
  helperClass,
  labelClass,
  successClass,
} from "@/lib/ui";
import type { Tone } from "@/components/ui/tone";

export type BaselineSettingsProps = {
  activatedAt: string | null;
  backfill: {
    status: string | null;
    grade: string | null;
    gradeReasons: string[];
    progressPhase: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    triggeredAt: string | null;
    finishedAt: string | null;
    errorText: string | null;
    quality: {
      contactsSeen: number;
      contactsWithCreatedDate: number;
      contactsWithActivity: number;
      opportunitiesSeen: number;
      opportunitiesWithValue: number;
      paymentsSeen: number;
      discontinuityDetected: boolean;
      discontinuityMonth: string | null;
    } | null;
  };
  selfReported: {
    leadsPerMonth: number;
    clientsClosedPerMonth: number;
    statedAt: string;
  } | null;
};

const idle: ReportingActionResult = { status: "idle" };

function gradeTone(grade: string | null): Tone {
  if (grade === "usable") return "good";
  if (grade === "partial") return "warning";
  if (grade === "unusable") return "critical";
  return "neutral";
}

export function BaselineSettings(props: BaselineSettingsProps) {
  const rerunFormRef = useRef<HTMLFormElement>(null);
  const [skipState, skipAction, skipping] = useActionState(skipBaselineBackfill, idle);
  const [rerunState, rerunAction, rerunning] = useActionState(rerunBaselineBackfill, idle);
  const [selfState, selfAction, savingSelf] = useActionState(saveSelfReportedBaseline, idle);
  const canSkip =
    !props.activatedAt &&
    (props.backfill.status === "queued" ||
      props.backfill.status === "running" ||
      props.backfill.status === "failed" ||
      props.backfill.status === null);
  const unusable = props.backfill.grade === "unusable" || props.backfill.status === "skipped";

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={cardTitle}>CRM history backfill</h2>
          <p className={helperClass}>
            Runs automatically after the CRM is connected. Historical rows land in baseline tables,
            never in live leads. Message bodies are not pulled. Finishing or skipping this resolves
            the baseline; going live is a separate step on the business profile page.
          </p>
        </div>
        <StatusBadge
          label={props.backfill.grade ?? props.backfill.status ?? "Not started"}
          tone={gradeTone(props.backfill.grade)}
        />
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className={labelClass}>Status</dt>
          <dd className="text-sm text-white">
            {props.backfill.status ?? "—"}
            {props.backfill.progressPhase ? ` · ${props.backfill.progressPhase}` : ""}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Activation</dt>
          <dd className="text-sm text-white">{props.activatedAt ?? "Not set until backfill completes or is skipped"}</dd>
        </div>
      </dl>

      {props.backfill.gradeReasons.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-silver">
          {props.backfill.gradeReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {props.backfill.quality ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className={labelClass}>Contacts with a creation date</dt>
            <dd className="text-sm text-white">
              {props.backfill.quality.contactsWithCreatedDate} of {props.backfill.quality.contactsSeen}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Contacts with activity</dt>
            <dd className="text-sm text-white">
              {props.backfill.quality.contactsWithActivity} of {props.backfill.quality.contactsSeen}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Closes</dt>
            <dd className="text-sm text-white">
              {props.backfill.quality.opportunitiesWithValue + props.backfill.quality.paymentsSeen > 0
                ? "Valued"
                : props.backfill.quality.opportunitiesSeen > 0
                  ? "Counted, not valued"
                  : "None found"}
            </dd>
          </div>
        </dl>
      ) : null}

      {props.backfill.quality?.discontinuityDetected ? (
        <p className="mt-3 text-sm text-flag-warning">
          Volume jumps in {props.backfill.quality.discontinuityMonth ?? "the window"}, which usually means
          the CRM was adopted partway through. An unusable grade hides the comparison on reporting.
        </p>
      ) : null}

      {props.backfill.errorText ? <p className={errorClass}>{props.backfill.errorText}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {canSkip ? (
          <form action={skipAction}>
            <SubmitButton variant="secondary" pending={skipping} loadingLabel="Skipping">
            Skip the backfill
          </SubmitButton>
          </form>
        ) : null}
        <form action={rerunAction} ref={rerunFormRef}>
          <ConfirmDialog
            trigger={
              <Button variant="secondary" loading={rerunning} loadingLabel="Re-running">
                Re-run backfill
              </Button>
            }
            title="Re-run the CRM history backfill?"
            description="Every baseline row for this workspace is deleted first and pulled again. Until it finishes, the before-and-after comparison on reporting has nothing to read."
            confirmLabel="Delete and re-pull"
            onConfirm={() => rerunFormRef.current?.requestSubmit()}
          />
        </form>
      </div>
      {skipState.status === "error" ? <p className={errorClass}>{skipState.error}</p> : null}
      {rerunState.status === "error" ? <p className={errorClass}>{rerunState.error}</p> : null}

      {unusable ? (
        <form action={selfAction} className="mt-8 space-y-4 border-t border-white/10 pt-6">
          <p className={cardTitle}>Self-reported prior figures</p>
          <p className={helperClass}>
            Used only when CRM history is unusable. Labeled self-reported on every screen and every
            export. Never blended with backfilled or live numbers. Capturing these, or recording that
            the client declined to give them, is what resolves the baseline for activation.
          </p>
          <Field label="Leads per month" name="leads_per_month">
            <Input
              id="leads_per_month"
              name="leads_per_month"
              type="number"
              min={1}
              required
              defaultValue={props.selfReported?.leadsPerMonth ?? ""}
            />
          </Field>
          <Field label="Clients closed per month" name="clients_closed_per_month">
            <Input
              id="clients_closed_per_month"
              name="clients_closed_per_month"
              type="number"
              min={0}
              required
              defaultValue={props.selfReported?.clientsClosedPerMonth ?? ""}
            />
          </Field>
          <Field label="Note" name="note">
            <Input id="note" name="note" type="text" />
          </Field>
          <SubmitButton variant="primary" pending={savingSelf} loadingLabel="Saving">
            Save self-reported baseline
          </SubmitButton>
          {selfState.status === "error" ? <p className={errorClass}>{selfState.error}</p> : null}
          {selfState.status === "saved" ? <p className={successClass}>Saved as self-reported.</p> : null}
        </form>
      ) : null}
    </Panel>
  );
}
