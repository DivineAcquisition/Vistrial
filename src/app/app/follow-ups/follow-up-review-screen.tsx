"use client";

import Link from "next/link";
import { useState } from "react";

import {
  approveFollowUp,
  haltLeadSequence,
  promoteSentToVoiceExample,
  refreshFollowUpReview,
  regenerateFollowUp,
  rejectFollowUp,
  retryFollowUpSend,
  saveFollowUpEdit,
} from "@/app/app/follow-ups/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FOLLOW_UP_BRANCH_LABELS,
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_STATUS_LABELS,
} from "@/lib/follow-up/labels";
import type { FollowUpReviewPayload } from "@/lib/follow-up/types";
import { formatDateTime } from "@/lib/format";
import { formatQueueUntil } from "@/lib/queue/duration";
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

export function FollowUpReviewScreen({ initial }: { initial: FollowUpReviewPayload }) {
  const [file, setFile] = useState(initial);
  const [body, setBody] = useState(initial.draft.editedBody);
  const [subject, setSubject] = useState(initial.draft.editedSubject ?? "");
  const [instruction, setInstruction] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmLowConfidence, setConfirmLowConfidence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date().toISOString());
  const draft = file.draft;
  const recipient = draft.channel === "email" ? file.lead.email : file.lead.phone;
  const editable = draft.status === "pending" || draft.status === "failed" || draft.status === "expired";
  const stale = draft.stale || draft.status === "expired";
  const canApprove = file.canApprove && draft.status === "pending" && !stale;
  const canRetry = file.canApprove && draft.status === "failed";

  async function reload() {
    const next = await refreshFollowUpReview(draft.id);
    if (next) {
      setFile(next);
      setBody(next.draft.editedBody);
      setSubject(next.draft.editedSubject ?? "");
    }
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p className={errorClass}>{error}</p> : null}

      <Panel className="px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{file.lead.name}</h2>
            <p className="mt-1 text-sm text-silver">
              {FOLLOW_UP_BRANCH_LABELS[draft.branch]} · {FOLLOW_UP_CHANNEL_LABELS[draft.channel]}
              {draft.sequencePosition > 1 ? ` · sequence ${draft.sequencePosition}` : ""}
            </p>
          </div>
          <StatusBadge
            label={FOLLOW_UP_STATUS_LABELS[draft.status]}
            tone={draft.status === "sent" ? "brand" : draft.lowConfidence || stale ? "critical" : "neutral"}
          />
        </div>
        <DefinitionList>
          <KeyValue label="Model">{draft.modelVersion}</KeyValue>
          <KeyValue label="Expires">{formatQueueUntil(draft.expiresAt, now)}</KeyValue>
          <KeyValue label="Recipient">{recipient || "Missing"}</KeyValue>
        </DefinitionList>
      </Panel>

      {!file.canApprove && (draft.status === "pending" || draft.status === "failed") && !stale ? (
        <Panel className="px-6 py-5">
          <p className="text-sm text-flag-critical">
            You can only approve drafts for leads assigned to you.
          </p>
        </Panel>
      ) : null}

      {draft.lowConfidence ? (
        <Panel className="px-6 py-5">
          <p className="text-sm text-flag-critical">
            Low confidence: {draft.lowConfidenceReason || "the quality check failed twice."} Edit
            or regenerate before sending.
          </p>
        </Panel>
      ) : null}

      {stale && draft.status !== "sent" ? (
        <Panel className="px-6 py-5">
          <p className="text-sm text-flag-critical">
            This draft is stale. It cannot be sent without regeneration.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader title="Draft" hint="Free editing. Nothing sends until you approve this one." />
          <Panel className="px-6 py-5">
            {draft.channel === "email" ? (
              <div className="mb-4">
                <label htmlFor="follow-up-subject" className={labelClass}>
                  Subject
                </label>
                <input
                  id="follow-up-subject"
                  className={inputClass}
                  value={subject}
                  disabled={!editable || busy}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </div>
            ) : null}
            <label htmlFor="follow-up-body" className={labelClass}>
              Message
            </label>
            <textarea
              id="follow-up-body"
              className={`${inputClass} min-h-48`}
              value={body}
              disabled={!editable || busy}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className={helperClass}>
              Generated copy is kept so the edit diff can be measured after send.
            </p>
            {editable ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  disabled={busy}
                  onClick={() =>
                    run(() => saveFollowUpEdit({ draftId: draft.id, body, subject }))
                  }
                >
                  Save edits
                </button>
              </div>
            ) : null}
            {draft.status === "sent" && draft.sentBody ? (
              <div className="mt-4">
                <p className={labelClass}>Sent</p>
                <p className="whitespace-pre-wrap text-sm text-silver">{draft.sentBody}</p>
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm} mt-3`}
                  disabled={busy}
                  onClick={() => run(() => promoteSentToVoiceExample(draft.id))}
                >
                  Use as voice example
                </button>
              </div>
            ) : null}
          </Panel>
        </section>

        <section>
          <SectionHeader title="Grounding" hint="Verify the draft against what was said before you approve." />
          <Panel className="px-6 py-5 space-y-4">
            <div>
              <p className={labelClass}>Call summary</p>
              <p className="text-sm text-silver">{file.extraction.summary || "Thin extraction — no summary."}</p>
            </div>
            <div>
              <p className={labelClass}>Objection</p>
              <p className="text-sm text-silver">{file.extraction.statedObjection || "None captured."}</p>
            </div>
            <div>
              <p className={labelClass}>Quotes in play</p>
              {file.extraction.quotes.length === 0 ? (
                <p className="text-sm text-dim">No verified quotes.</p>
              ) : (
                <ul className="space-y-2">
                  {file.extraction.quotes.map((quote) => (
                    <li key={quote.text} className="text-sm text-silver">
                      “{quote.text}”
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/app/calls/${draft.callId}`} className={`${btnSecondary} ${btnSizeSm}`}>
                Full extraction and transcript
              </Link>
              <Link href={`/app/cases/${draft.leadId}`} className={`${btnGhost} ${btnSizeSm}`}>
                Case file
              </Link>
            </div>
          </Panel>
        </section>
      </div>

      {editable ? (
        <section className="grid gap-8 lg:grid-cols-2">
          <Panel className="px-6 py-5">
            <p className={labelClass}>Regenerate</p>
            <textarea
              className={`${inputClass} min-h-24`}
              placeholder="Optional instruction, e.g. shorter, drop the question"
              value={instruction}
              disabled={busy}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm} mt-3`}
              disabled={busy}
              onClick={() => run(() => regenerateFollowUp({ draftId: draft.id, instruction }))}
            >
              Regenerate
            </button>
          </Panel>
          <Panel className="px-6 py-5">
            <p className={labelClass}>Reject</p>
            <textarea
              className={`${inputClass} min-h-24`}
              placeholder="Why this draft is wrong"
              value={rejectReason}
              disabled={busy}
              onChange={(event) => setRejectReason(event.target.value)}
            />
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm} mt-3`}
              disabled={busy}
              onClick={() => run(() => rejectFollowUp({ draftId: draft.id, reason: rejectReason }))}
            >
              Reject
            </button>
          </Panel>
        </section>
      ) : null}

      {canApprove || canRetry ? (
        <Panel className="px-6 py-5">
          {!confirming ? (
            <div className="flex flex-wrap gap-2">
              {canApprove ? (
                <button
                  type="button"
                  className={`${btnPrimary} ${btnSizeSm}`}
                  disabled={busy || !recipient}
                  onClick={() => setConfirming(true)}
                >
                  Approve…
                </button>
              ) : null}
              {canRetry ? (
                <button
                  type="button"
                  className={`${btnPrimary} ${btnSizeSm}`}
                  disabled={busy}
                  onClick={() => run(() => retryFollowUpSend(draft.id))}
                >
                  Retry send
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-white">Confirm before dispatch. A message to the wrong person cannot be pulled back.</p>
              <DefinitionList>
                <KeyValue label="Channel">{FOLLOW_UP_CHANNEL_LABELS[draft.channel]}</KeyValue>
                <KeyValue label="Recipient">{recipient}</KeyValue>
                <KeyValue label="Send time">{formatDateTime(file.proposedSendAt)}</KeyValue>
              </DefinitionList>
              {draft.lowConfidence ? (
                <label className="flex items-start gap-2 text-sm text-silver">
                  <Checkbox
                    className="mt-0.5"
                    checked={confirmLowConfidence}
                    disabled={busy}
                    onChange={(event) => setConfirmLowConfidence(event.target.checked)}
                  />
                  <span>
                    This draft failed the quality check. I still want to send it to this
                    person.
                  </span>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${btnPrimary} ${btnSizeSm}`}
                  disabled={busy || (draft.lowConfidence && !confirmLowConfidence)}
                  onClick={() =>
                    run(() =>
                      approveFollowUp({
                        draftId: draft.id,
                        body,
                        subject,
                        confirmChannel: draft.channel,
                        confirmRecipient: recipient ?? "",
                        confirmSendAt: file.proposedSendAt,
                        confirmLowConfidence: draft.lowConfidence ? confirmLowConfidence : undefined,
                      })
                    )
                  }
                >
                  Confirm and send
                </button>
                <button
                  type="button"
                  className={`${btnGhost} ${btnSizeSm}`}
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {draft.failureReason ? <p className={`${errorClass} mt-3`}>{draft.failureReason}</p> : null}
        </Panel>
      ) : null}

      {file.draft.sequenceRunId ? (
        <Panel className="px-6 py-5">
          <p className={helperClass}>
            This draft is part of a sequence. Later messages are drafted on a schedule and still
            require their own approval. Sending is never scheduled.
          </p>
          <button
            type="button"
            className={`${btnSecondary} ${btnSizeSm} mt-3`}
            disabled={busy}
            onClick={() =>
              run(() =>
                haltLeadSequence({
                  sequenceRunId: draft.sequenceRunId as string,
                  leadId: draft.leadId,
                })
              )
            }
          >
            Halt this lead’s sequence
          </button>
        </Panel>
      ) : null}
    </div>
  );
}
