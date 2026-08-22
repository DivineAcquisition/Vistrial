"use client";

import Link from "next/link";
import { useState } from "react";

import {
  correctExtractionField,
  pasteCallTranscript,
  reextractCall,
  refreshCallDetail,
  retryDeadExtraction,
} from "@/app/app/calls/actions";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCallDuration } from "@/lib/cases/format";
import type { CallDetailPayload } from "@/lib/calls/types";
import {
  CALL_OUTCOME_LABELS,
  CALL_TYPE_LABELS,
  EXTRACTION_STATUS_LABELS,
  OBJECTION_TYPE_LABELS,
  SIGNAL_STATE_LABELS,
  TRANSCRIPT_SOURCE_LABELS,
} from "@/lib/leads/labels";
import { formatQueueDuration } from "@/lib/queue/duration";
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

export function CallDetailScreen({ initial }: { initial: CallDetailPayload }) {
  const [detail, setDetail] = useState(initial);
  const [now] = useState(() => new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = detail.call;
  const jobStatus =
    detail.job?.status === "dead"
      ? "failed"
      : detail.job?.status === "pending"
        ? "pending"
        : detail.extraction
          ? "ready"
          : "none";

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = await refreshCallDetail(call.id);
      if (next) setDetail(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p className={errorClass}>{error}</p> : null}

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{CALL_TYPE_LABELS[call.type]} call</h2>
            <p className="mt-1 text-sm text-silver">{detail.lead.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/cases/${detail.lead.id}`} className={`${btnSecondary} ${btnSizeSm}`}>
              Case file
            </Link>
            <Link href={`/app/cases/${detail.lead.id}/brief`} className={`${btnPrimary} ${btnSizeSm}`}>
              Pre-call brief
            </Link>
          </div>
        </div>
        <DefinitionList>
          <KeyValue label="Ran by">{call.ranByName || "—"}</KeyValue>
          <KeyValue label="Scheduled">
            {call.scheduledAt ? formatQueueDuration(call.scheduledAt, now) : "—"}
          </KeyValue>
          <KeyValue label="Occurred">
            {call.occurredAt ? formatQueueDuration(call.occurredAt, now) : "—"}
          </KeyValue>
          <KeyValue label="Duration">{formatCallDuration(call.durationSeconds)}</KeyValue>
          <KeyValue label="Outcome">
            {call.outcome ? CALL_OUTCOME_LABELS[call.outcome] : "—"}
          </KeyValue>
          <KeyValue label="Source">
            {call.transcriptSource ? TRANSCRIPT_SOURCE_LABELS[call.transcriptSource] : "Not ingested"}
          </KeyValue>
          <KeyValue label="Extraction">
            <StatusBadge
              label={EXTRACTION_STATUS_LABELS[jobStatus]}
              tone={jobStatus === "failed" ? "critical" : jobStatus === "ready" ? "good" : "neutral"}
            />
          </KeyValue>
        </DefinitionList>
      </Panel>

      {jobStatus === "failed" ? (
        <Notice
          tone="critical"
          title="Extraction failed"
          action={
            <Button
              variant="destructive"
              size="sm"
              loading={busy}
              loadingLabel="Retrying"
              onClick={() => run(() => retryDeadExtraction(call.id))}
            >
              Retry extraction
            </Button>
          }
        >
          This is not an empty call. Extraction stopped
          {detail.job?.lastError ? ` (${detail.job.lastError})` : ""}. Retry after the cause is fixed.
        </Notice>
      ) : null}

      <section>
        <SectionHeader
          title="Extraction"
          hint="Structure first. The transcript is the receipt."
          actions={
            call.rawTranscript && jobStatus !== "pending" ? (
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={busy}
                onClick={() => run(() => reextractCall(call.id))}
              >
                Re-extract
              </button>
            ) : null
          }
        />
        {detail.extraction ? (
          <Panel className="p-6">
            <SignalField
              key={`summary-${detail.extraction.summary ?? ""}`}
              label="Summary"
              fieldName="summary"
              text={detail.extraction.summary}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <SignalField
              key={`objection-${detail.extraction.statedObjectionState}-${detail.extraction.statedObjection ?? ""}`}
              label="Stated objection"
              fieldName="stated_objection"
              stateField="stated_objection_state"
              text={detail.extraction.statedObjection}
              state={detail.extraction.statedObjectionState}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <SignalField
              key={`budget-${detail.extraction.budgetSignalState}-${detail.extraction.budgetSignal ?? ""}`}
              label="Budget"
              fieldName="budget_signal"
              stateField="budget_signal_state"
              text={detail.extraction.budgetSignal}
              state={detail.extraction.budgetSignalState}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <SignalField
              key={`timeline-${detail.extraction.timelineSignalState}-${detail.extraction.timelineSignal ?? ""}`}
              label="Timeline"
              fieldName="timeline_signal"
              stateField="timeline_signal_state"
              text={detail.extraction.timelineSignal}
              state={detail.extraction.timelineSignalState}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <SignalField
              key={`decision-${detail.extraction.decisionProcessState}-${detail.extraction.decisionProcess ?? ""}`}
              label="Decision process"
              fieldName="decision_process"
              stateField="decision_process_state"
              text={detail.extraction.decisionProcess}
              state={detail.extraction.decisionProcessState}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <SignalField
              key={`next-${detail.extraction.nextStepState}-${detail.extraction.nextStepAgreed ?? ""}`}
              label="Next step agreed"
              fieldName="next_step_agreed"
              stateField="next_step_state"
              text={detail.extraction.nextStepAgreed}
              state={detail.extraction.nextStepState}
              callId={call.id}
              busy={busy}
              onSave={(fieldName, value) => run(() => correctExtractionField({ callId: call.id, fieldName, value }))}
            />
            <QuotesField
              quotes={detail.extraction.quotes}
              busy={busy}
              onSave={(value) => run(() => correctExtractionField({ callId: call.id, fieldName: "quotes", value }))}
            />
            <p className={helperClass}>
              Model {detail.extraction.modelVersion || "unknown"} · extracted{" "}
              {formatQueueDuration(detail.extraction.extractedAt, now)}
            </p>
          </Panel>
        ) : jobStatus === "pending" ? (
          <Panel className="p-6">
            <p className="text-sm text-silver">Extraction is queued. This page does not run it on view.</p>
          </Panel>
        ) : jobStatus === "failed" ? null : (
          <Panel className="p-6">
            <p className="text-sm text-dim">No extraction yet.</p>
          </Panel>
        )}
      </section>

      <section>
        <SectionHeader title="Objections" hint="Verbatim, with whether they are still open." />
        <Panel className="p-6">
          {detail.objections.length === 0 ? (
            <p className="text-sm text-dim">Not established</p>
          ) : (
            <DefinitionList>
              {detail.objections.map((objection) => (
                <KeyValue key={objection.id} label={OBJECTION_TYPE_LABELS[objection.type]}>
                  “{objection.verbatim}”
                  <span className="mt-1 block text-xs text-dim">
                    {objection.resolved ? "Resolved" : "Open"}
                  </span>
                </KeyValue>
              ))}
            </DefinitionList>
          )}
        </Panel>
      </section>

      <section>
        <SectionHeader title="Score change" hint="What this call did to readiness. Call evidence wins; nothing is averaged." />
        <Panel className="p-6">
          {detail.scoreChange ? (
            <DefinitionList>
              <KeyValue label="Before">
                {detail.scoreChange.previousTotal === null ? "—" : detail.scoreChange.previousTotal}
              </KeyValue>
              <KeyValue label="After">{detail.scoreChange.total}</KeyValue>
              <KeyValue label="Why">{detail.scoreChange.reasoning || "—"}</KeyValue>
            </DefinitionList>
          ) : (
            <p className="text-sm text-dim">This call did not write a new score.</p>
          )}
        </Panel>
      </section>

      {detail.corrections.length > 0 ? (
        <section>
          <SectionHeader title="Corrections" hint="Who changed an extracted field, and when." />
          <Panel className="p-6">
            <DefinitionList>
              {detail.corrections.map((row) => (
                <KeyValue key={row.id} label={row.fieldName}>
                  {row.actorName || "—"} · {formatQueueDuration(row.createdAt, now)}
                </KeyValue>
              ))}
            </DefinitionList>
          </Panel>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Transcript" hint="Collapsed on purpose. Read the structure first." />
        {call.rawTranscript ? (
          <Panel className="p-6">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-white">Show raw transcript</summary>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-silver">{call.rawTranscript}</pre>
            </details>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-white">Replace with a pasted transcript</summary>
              <div className="mt-3">
                <PasteTranscript
                  busy={busy}
                  description="This replaces the stored transcript and queues a new extraction. Audio is never stored."
                  onSubmit={(transcript) => run(() => pasteCallTranscript({ callId: call.id, transcript }))}
                />
              </div>
            </details>
          </Panel>
        ) : (
          <Panel className="p-6">
            <PasteTranscript
              busy={busy}
              onSubmit={(transcript) => run(() => pasteCallTranscript({ callId: call.id, transcript }))}
            />
          </Panel>
        )}
      </section>
    </div>
  );
}

function SignalField({
  label,
  fieldName,
  stateField,
  text,
  state,
  callId,
  busy,
  onSave,
}: {
  label: string;
  fieldName: string;
  stateField?: string;
  text: string | null | undefined;
  state?: "absent" | "unclear" | "present";
  callId: string;
  busy: boolean;
  onSave: (fieldName: string, value: string) => Promise<void>;
}) {
  void callId;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [stateValue, setStateValue] = useState(state ?? "absent");

  const display =
    state === "absent"
      ? "Not discussed"
      : state === "unclear"
        ? text
          ? `Mentioned, unclear — ${text}`
          : "Mentioned, unclear"
        : text || "Not established";

  return (
    <div className="border-b border-white/[0.05] py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={labelClass}>{label}</p>
          {editing ? null : <p className="text-sm text-silver">{display}</p>}
        </div>
        {editing ? null : (
          <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={() => setEditing(true)}>
            Correct
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (stateField && stateValue !== state) await onSave(stateField, stateValue);
            await onSave(fieldName, value);
            setEditing(false);
          }}
        >
          {stateField ? (
            <label className="block">
              <span className={labelClass}>State</span>
              <Select
                
                value={stateValue}
                onChange={(event) => setStateValue(event.target.value as typeof stateValue)}
              >
                <option value="absent">{SIGNAL_STATE_LABELS.absent}</option>
                <option value="unclear">{SIGNAL_STATE_LABELS.unclear}</option>
                <option value="present">{SIGNAL_STATE_LABELS.present}</option>
              </Select>
            </label>
          ) : null}
          <textarea className={inputClass} rows={3} value={value} onChange={(event) => setValue(event.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={busy}>
              Save correction
            </button>
            <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function QuotesField({
  quotes,
  busy,
  onSave,
}: {
  quotes: Array<{ text: string; topic: string }>;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(quotes);

  return (
    <div className="border-b border-white/[0.05] py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={labelClass}>Quotes</p>
          {editing ? null : quotes.length === 0 ? (
            <p className="text-sm text-dim">Not established</p>
          ) : (
            <ul className="space-y-2">
              {quotes.map((quote) => (
                <li key={quote.text} className="text-sm text-silver">
                  “{quote.text}”
                  <span className="mt-1 block text-xs text-dim">{quote.topic}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {editing ? null : (
          <button
            type="button"
            className={`${btnGhost} ${btnSizeSm}`}
            onClick={() => {
              setRows(quotes.length > 0 ? quotes : [{ text: "", topic: "situation" }]);
              setEditing(true);
            }}
          >
            Correct
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSave(JSON.stringify(rows.filter((row) => row.text.trim())));
            setEditing(false);
          }}
        >
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <textarea
                className={inputClass}
                rows={2}
                value={row.text}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    )
                  )
                }
              />
              <input
                className={inputClass}
                value={row.topic}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, topic: event.target.value } : item
                    )
                  )
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${btnGhost} ${btnSizeSm}`}
              onClick={() => setRows((current) => [...current, { text: "", topic: "situation" }])}
            >
              Add quote
            </button>
            <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={busy}>
              Save correction
            </button>
            <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function PasteTranscript({
  busy,
  onSubmit,
  description = "No transcript on this call. Paste one. This is the permanent fallback.",
}: {
  busy: boolean;
  onSubmit: (transcript: string) => void;
  description?: string;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm text-silver">{description}</p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(text);
        }}
      >
        <textarea
          className={inputClass}
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
        />
        <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={busy || !text.trim()}>
          Save transcript
        </button>
      </form>
    </div>
  );
}
