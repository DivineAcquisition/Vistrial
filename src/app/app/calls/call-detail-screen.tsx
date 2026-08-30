"use client";

import Link from "next/link";
import { useState } from "react";

import {
  correctExtractionField,
  markExtractionFlagsWrong,
  pasteCallTranscript,
  reextractCall,
  refreshCallDetail,
  retryDeadExtraction,
} from "@/app/app/calls/actions";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  errorClass,
  helperClass,
  labelClass,
  pageStack,
} from "@/lib/ui";

export function CallDetailScreen({
  initial,
  quality,
}: {
  initial: CallDetailPayload;
  quality?: {
    measure: Record<string, unknown> | null;
    handlings: Array<Record<string, unknown>>;
  };
}) {
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
    <div className={pageStack}>
      {error ? <p className={errorClass}>{error}</p> : null}

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg text-white">{CALL_TYPE_LABELS[call.type]} call</h2>
            <p className="mt-1 text-sm text-silver">{detail.lead.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" render={<Link href={`/app/cases/${detail.lead.id}`} />}>
              Case file
            </Button>
            <Button variant="primary" size="sm" render={<Link href={`/app/cases/${detail.lead.id}/brief`} />}>
              Pre-call brief
            </Button>
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
              label={
                detail.extraction?.verificationStatus === "needs_review"
                  ? "needs review"
                  : EXTRACTION_STATUS_LABELS[jobStatus]
              }
              tone={
                detail.extraction?.verificationStatus === "needs_review"
                  ? "warning"
                  : jobStatus === "failed"
                    ? "critical"
                    : jobStatus === "ready"
                      ? "good"
                      : "neutral"
              }
            />
          </KeyValue>
        </DefinitionList>
      </Panel>

      {quality?.measure ? (
        <Panel className="p-6">
          <SectionHeader
            title="What happened on this recording"
            hint="Facts about the call, not a grade of the person. One call is never a verdict."
          />
          <DefinitionList>
            <KeyValue label="Talk ratio">
              {quality.measure.speakers_attributed === true && typeof quality.measure.talk_ratio_rep === "number"
                ? `${Math.round(Number(quality.measure.talk_ratio_rep) * 100)}% rep / ${Math.round(Number(quality.measure.talk_ratio_prospect) * 100)}% prospect. Context, not a target.`
                : "Unknown — speakers were not labeled on the transcript."}
            </KeyValue>
            <KeyValue label="Questions">
              {String(quality.measure.open_question_count ?? 0)} open / {String(quality.measure.closed_question_count ?? 0)}{" "}
              closed ({String(quality.measure.question_count ?? 0)} total)
            </KeyValue>
            <KeyValue label="Longest rep monologue">
              {quality.measure.longest_rep_monologue_words == null
                ? "Unknown"
                : `${String(quality.measure.longest_rep_monologue_words)} words`}
            </KeyValue>
            <KeyValue label="Duration vs typical">
              {quality.measure.typical_duration_seconds == null
                ? `${formatCallDuration(
                    typeof quality.measure.duration_seconds === "number"
                      ? Number(quality.measure.duration_seconds)
                      : null
                  )} (no org typical yet for this call type)`
                : `${formatCallDuration(
                    typeof quality.measure.duration_seconds === "number"
                      ? Number(quality.measure.duration_seconds)
                      : null
                  )} vs ${formatCallDuration(Number(quality.measure.typical_duration_seconds))} typical. Context, not a target.`}
            </KeyValue>
            <KeyValue label="Next step stated">
              {quality.measure.next_step_stated === true ? "Yes" : "No"}
            </KeyValue>
            <KeyValue label="Next step agreed">
              {quality.measure.next_step_agreed === true ? "Yes" : "No"}
            </KeyValue>
            <KeyValue label="Next step">{String(quality.measure.commitment_clarity ?? "none")}</KeyValue>
            <KeyValue label="Discovery">
              {[
                quality.measure.discovery_authority === true ? "authority explored" : "authority not explored",
                quality.measure.discovery_pain === true ? "pain explored" : "pain not explored",
                quality.measure.discovery_timeline === true ? "timeline explored" : "timeline not explored",
                quality.measure.discovery_budget === true ? "investment explored" : "investment not explored",
              ].join(" · ")}
            </KeyValue>
            <KeyValue label="Brief opened before call">
              {quality.measure.brief_opened_before_call === true ? "Yes" : "No"}
            </KeyValue>
            <KeyValue label="Open objections addressed">
              {String(quality.measure.open_objections_addressed_n ?? 0)} of{" "}
              {String(quality.measure.open_objections_prior_n ?? 0)}
            </KeyValue>
          </DefinitionList>
          {quality.handlings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-silver">
              {quality.handlings.map((item, index) => (
                <li key={`${String(item.objection_type)}-${index}`}>
                  {String(item.objection_type)}: {String(item.handling)}
                  {typeof item.verbatim === "string" ? ` — “${item.verbatim}”` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {jobStatus === "failed" ? (
        <Notice
          tone="critical"
          title="Extraction failed"
          action={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={busy}
              loadingLabel="Retrying"
              onClick={() => run(() => retryDeadExtraction(call.id))}
            >
              Read it again
            </Button>
          }
        >
          This is not an empty call. Reading the recording stopped
          {detail.job?.lastError ? ` (${detail.job.lastError})` : ""}. Try again after the cause is fixed.
        </Notice>
      ) : null}

      <section>
        <SectionHeader
          title="What was said"
          hint="The facts first. The transcript is the receipt."
          actions={
            call.rawTranscript && jobStatus !== "pending" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => run(() => reextractCall(call.id))}
              >
                Read again
              </Button>
            ) : null
          }
        />
        {detail.extraction ? (
          <Panel className="p-6">
            {detail.extraction.verificationStatus === "needs_review" ? (
              <Notice
                tone="warning"
                className="mb-4"
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    onClick={() => run(() => markExtractionFlagsWrong(call.id))}
                  >
                    These flags were wrong
                  </Button>
                }
              >
                This reading needs a look
                {detail.extraction.verificationFaults.length
                  ? `: ${detail.extraction.verificationFaults.map((item) => item.what).join(" ")}`
                  : "."}{" "}
                It is not finished until someone checks it.
              </Notice>
            ) : null}
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
              Read {formatQueueDuration(detail.extraction.extractedAt, now)}
            </p>
          </Panel>
        ) : jobStatus === "pending" ? (
          <Panel className="p-6">
            <p className="text-sm text-silver">Extraction is queued. This page does not run it on view.</p>
          </Panel>
        ) : jobStatus === "failed" ? null : (
          <Panel className="p-6">
            <p className="text-sm text-dim">Nothing has been read from this recording yet.</p>
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
                  description="This replaces the stored transcript and reads it again. Audio is never stored."
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
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Correct
          </Button>
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
          <Textarea rows={3} value={value} onChange={(event) => setValue(event.target.value)} placeholder="What they actually said" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              Save correction
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRows(quotes.length > 0 ? quotes : [{ text: "", topic: "situation" }]);
              setEditing(true);
            }}
          >
            Correct
          </Button>
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
              <Textarea
                rows={2}
                value={row.text}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    )
                  )
                }
                placeholder="Verbatim quote from the call"
              />
              <Input
                type="text"
                value={row.topic}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, topic: event.target.value } : item
                    )
                  )
                }
                placeholder="budget"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((current) => [...current, { text: "", topic: "situation" }])}
            >
              Add quote
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              Save correction
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
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
        <Textarea
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
          placeholder="Paste the full transcript. Leave speaker labels if you have them."
        />
        <Button type="submit" variant="primary" size="sm" disabled={busy || !text.trim()}>
          Save transcript
        </Button>
      </form>
    </div>
  );
}
