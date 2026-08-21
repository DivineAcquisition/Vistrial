"use client";

import { useActionState } from "react";

import {
  declineBaselineFallback,
  rerunBaselineBackfill,
  saveSelfReportedBaseline,
  skipBaselineBackfill,
  type ReportingActionResult,
} from "@/app/app/reporting/actions";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { backfillGradePlain } from "@/lib/onboarding/copy";
import {
  btnPrimary,
  btnSecondary,
  btnSizeMd,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
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
  const [skipState, skipAction, skipping] = useActionState(skipBaselineBackfill, idle);
  const [rerunState, rerunAction, rerunning] = useActionState(rerunBaselineBackfill, idle);
  const [selfState, selfAction, savingSelf] = useActionState(saveSelfReportedBaseline, idle);
  const [declineState, declineAction, declining] = useActionState(declineBaselineFallback, idle);
  const canSkip =
    props.backfill.status === "queued" ||
    props.backfill.status === "running" ||
    props.backfill.status === "failed" ||
    props.backfill.status === null;
  const unusable = props.backfill.grade === "unusable" || props.backfill.status === "skipped";

  return (
    <Panel className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">CRM history backfill</h2>
          <p className={helperClass}>
            Runs automatically after the CRM is connected. Historical rows land in baseline tables,
            never in live leads. Message bodies are not pulled. Activation is a separate gate — it
            waits until this pull finishes or is skipped and a fallback is chosen.
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
          <dd className="text-sm text-white">
            {props.activatedAt
              ? props.activatedAt
              : "Set on the Review step after this pull resolves. Skipping here does not go live."}
          </dd>
        </div>
      </dl>

      {props.backfill.grade ? (
        <p className="mt-4 text-sm text-silver">{backfillGradePlain(props.backfill.grade)}</p>
      ) : null}

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
            <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={skipping}>
              {skipping ? "Skipping…" : "Skip backfill"}
            </button>
          </form>
        ) : null}
        <form action={rerunAction}>
          <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={rerunning}>
            {rerunning ? "Re-running…" : "Re-run backfill"}
          </button>
        </form>
      </div>
      {skipState.status === "error" ? <p className={errorClass}>{skipState.error}</p> : null}
      {rerunState.status === "error" ? <p className={errorClass}>{rerunState.error}</p> : null}

      {unusable ? (
        <form action={selfAction} className="mt-8 space-y-4 border-t border-white/10 pt-6">
          <p className="text-sm font-semibold text-white">Self-reported prior figures</p>
          <p className={helperClass}>
            Used only when CRM history is unusable. Labeled self-reported on every screen and every
            export. Never blended with backfilled or live numbers.
          </p>
          <div>
            <label className={labelClass} htmlFor="leads_per_month">
              Leads per month
            </label>
            <input
              id="leads_per_month"
              name="leads_per_month"
              type="number"
              min={1}
              required
              defaultValue={props.selfReported?.leadsPerMonth ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="clients_closed_per_month">
              Clients closed per month
            </label>
            <input
              id="clients_closed_per_month"
              name="clients_closed_per_month"
              type="number"
              min={0}
              required
              defaultValue={props.selfReported?.clientsClosedPerMonth ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="note">
              Note
            </label>
            <input id="note" name="note" className={inputClass} />
          </div>
          <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={savingSelf}>
            {savingSelf ? "Saving…" : "Save self-reported baseline"}
          </button>
          {selfState.status === "error" ? <p className={errorClass}>{selfState.error}</p> : null}
          {selfState.status === "saved" ? <p className={helperClass}>Saved as self-reported.</p> : null}
        </form>
      ) : null}

      {unusable ? (
        <form action={declineAction} className="mt-6 space-y-2">
          <button type="submit" className={`${btnSecondary} ${btnSizeMd}`} disabled={declining}>
            {declining ? "Recording…" : "Decline the fallback"}
          </button>
          <p className={helperClass}>
            Records that you will go live without a before-figure. The comparison stays empty
            until CRM history exists.
          </p>
          {declineState.status === "error" ? <p className={errorClass}>{declineState.error}</p> : null}
          {declineState.status === "saved" ? <p className={helperClass}>Fallback declined.</p> : null}
        </form>
      ) : null}
    </Panel>
  );
}
