"use client";

import Link from "next/link";
import { useState } from "react";

import {
  changeLeadStatus,
  loadCaseTimelinePage,
  reassignLeadNextAction,
  refreshCaseFile,
  resolveLeadObjection,
} from "@/app/app/cases/actions";
import { haltLeadSequence } from "@/app/app/follow-ups/actions";
import {
  FOLLOW_UP_BRANCH_LABELS,
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_STATUS_LABELS,
} from "@/lib/follow-up/labels";
import {
  assignQueueLead,
  completeQueueNextAction,
  createQueueFollowOn,
  logQueueOutcome,
} from "@/app/app/queue/actions";
import { AssignPanel, FollowOnPanel, OutcomePanel } from "@/components/app/lead-action-panels";
import { useOrg } from "@/components/app/org-provider";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAnswer, formatCallDuration, formatCents } from "@/lib/cases/format";
import { cursorFromTimelineEntry } from "@/lib/cases/cursor";
import type {
  CaseCall,
  CaseFilePayload,
  CaseNextAction,
  CaseObjection,
  CaseScoreHistoryRow,
  CaseTimelineEntry,
} from "@/lib/cases/types";
import { canOverrideLead } from "@/lib/auth/permissions";
import {
  CALL_OUTCOME_LABELS,
  CALL_TYPE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TRACK_LABELS,
  MANUAL_LEAD_STATUSES,
  OBJECTION_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  SCORE_TRIGGER_LABELS,
  leadStatusTone,
  type LeadStatus,
} from "@/lib/leads/labels";
import { formatQueueDuration, formatQueueUntil } from "@/lib/queue/duration";
import {
  SCORE_CONFIDENCE_LABELS,
  TOUCH_CHANNEL_LABELS,
  TOUCH_OUTCOME_LABELS,
} from "@/lib/queue/types";
import { FACTOR_LABELS, SCORE_FACTORS } from "@/lib/scoring/compute";
import { overrideLeadScore } from "@/lib/scoring/override";
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

type PanelKind = "outcome" | "assign" | "override" | "status" | "createAction" | null;

export function CaseFileScreen({ initial }: { initial: CaseFilePayload }) {
  const org = useOrg();
  const [file, setFile] = useState(initial);
  const [now] = useState(() => new Date().toISOString());
  const [panel, setPanel] = useState<PanelKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lead = file.lead;
  const canOverride = canOverrideLead({
    role: org.role,
    memberId: org.memberId,
    assignedSetterId: lead.assignedSetterId,
    assignedCloserId: lead.assignedCloserId,
    isPlatformAdmin: org.isPlatformAdmin,
  });

  async function reload() {
    const next = await refreshCaseFile(lead.id);
    if (next) setFile(next);
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      await reload();
      setPanel(null);
      return true;
    } finally {
      setBusy(false);
    }
  }

  const openObjections = file.objections.filter((item) => !item.resolved);
  const resolvedObjections = file.objections.filter((item) => item.resolved);
  const openActions = file.nextActions.filter((item) => !item.completedAt);
  const doneActions = file.nextActions.filter((item) => item.completedAt);

  return (
    <div className="space-y-8">
      {error ? <p className={errorClass}>{error}</p> : null}

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{lead.name}</h2>
            <p className="mt-1 text-sm text-silver">
              {[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge label={LEAD_STATUS_LABELS[lead.status]} tone={leadStatusTone(lead.status)} />
              {lead.leadType ? (
                <StatusBadge
                  label={LEAD_TRACK_LABELS[lead.leadType]}
                  tone={lead.leadType === "ready_track" ? "brand" : "neutral"}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/cases/${lead.id}/brief`} className={`${btnPrimary} ${btnSizeSm}`}>
              Pre-call brief
            </Link>
            {lead.crmUrl ? (
              <a
                href={lead.crmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnPrimary} ${btnSizeSm}`}
              >
                Open in CRM
              </a>
            ) : null}
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => setPanel(panel === "outcome" ? null : "outcome")}
            >
              Log outcome
            </button>
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => setPanel(panel === "assign" ? null : "assign")}
            >
              Assign
            </button>
            {canOverride ? (
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={busy}
                onClick={() => setPanel(panel === "override" ? null : "override")}
              >
                Override score
              </button>
            ) : null}
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => setPanel(panel === "status" ? null : "status")}
            >
              Change status
            </button>
          </div>
        </div>
        <DefinitionList>
          <KeyValue label="Setter">{lead.assignedSetterName || "Unassigned"}</KeyValue>
          <KeyValue label="Closer">{lead.assignedCloserName || "Unassigned"}</KeyValue>
          <KeyValue label="Source">{lead.source || "—"}</KeyValue>
          <KeyValue label="Offer">{lead.offerName || "—"}</KeyValue>
          <KeyValue label="Opted in">{formatQueueDuration(lead.optedInAt, now)}</KeyValue>
          <KeyValue label="Last touch">{formatQueueDuration(lead.lastTouchAt, now)}</KeyValue>
        </DefinitionList>
      </Panel>

      {panel === "outcome" ? (
        <OutcomePanel
          row={lead}
          members={file.members}
          role={org.role}
          memberId={org.memberId}
          isPlatformAdmin={org.isPlatformAdmin}
          busy={busy}
          error={error}
          onCancel={() => setPanel(null)}
          onSubmit={async (input) => {
            await run(() => logQueueOutcome(input));
          }}
        />
      ) : null}
      {panel === "assign" ? (
        <AssignPanel
          row={lead}
          members={file.members}
          role={org.role}
          memberId={org.memberId}
          isPlatformAdmin={org.isPlatformAdmin}
          busy={busy}
          error={error}
          onCancel={() => setPanel(null)}
          onSubmit={async (input) => {
            await run(() => assignQueueLead(input));
          }}
        />
      ) : null}
      {panel === "override" ? (
        <OverridePanel
          leadId={lead.id}
          busy={busy}
          error={error}
          onCancel={() => setPanel(null)}
          onSubmit={async (formData) => {
            await run(async () => {
              const result = await overrideLeadScore(formData);
              return result.ok ? { ok: true } : result;
            });
          }}
        />
      ) : null}
      {panel === "status" ? (
        <StatusPanel
          current={lead.status}
          busy={busy}
          error={error}
          onCancel={() => setPanel(null)}
          onSubmit={async (input) => {
            await run(() => changeLeadStatus({ leadId: lead.id, ...input }));
          }}
        />
      ) : null}

      <section>
        <SectionHeader title="Readiness" hint="Four factors, not just the total. The call changes with which one is weak." />
        <Panel className="p-6">
          {file.score ? (
            <DefinitionList>
              <KeyValue label="Score">
                <span className="font-medium text-white tabular-nums">{file.score.total}</span>
                {lead.leadType ? ` · ${LEAD_TRACK_LABELS[lead.leadType]}` : ""}
              </KeyValue>
              <KeyValue label="Confidence">
                {file.score.scoreConfidence
                  ? `${SCORE_CONFIDENCE_LABELS[file.score.scoreConfidence]} · ${file.score.knownFactorCount} of 4`
                  : `${file.score.knownFactorCount} of 4`}
              </KeyValue>
              <KeyValue label="Timeline">{factorValue(file.score.timeline)}</KeyValue>
              <KeyValue label="Investment capacity">{factorValue(file.score.investmentCapacity)}</KeyValue>
              <KeyValue label="Decision authority">{factorValue(file.score.decisionAuthority)}</KeyValue>
              <KeyValue label="Pain severity">{factorValue(file.score.painSeverity)}</KeyValue>
              <KeyValue label="Reasoning">{file.score.reasoning || "—"}</KeyValue>
            </DefinitionList>
          ) : (
            <p className="text-sm text-dim">No score yet. Intake or an override will write the first row.</p>
          )}
        </Panel>
      </section>

      <section>
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">
              Score history ({file.scoreHistory.length})
            </summary>
            <p className={helperClass}>Every score row, with what triggered it and how the total moved.</p>
            {file.scoreHistory.length === 0 ? (
              <p className="mt-3 text-sm text-dim">No score rows.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {file.scoreHistory.map((row) => (
                  <li key={row.id} className="border-t border-white/[0.05] pt-3 first:border-t-0 first:pt-0">
                    <ScoreHistoryItem row={row} now={now} />
                  </li>
                ))}
              </ol>
            )}
          </details>
        </Panel>
      </section>

      <section>
        <SectionHeader title="Open objections" hint="Do not re-litigate these. They are already on the table." />
        <Panel className="p-6">
          {openObjections.length === 0 ? (
            <p className="text-sm text-dim">No open objections.</p>
          ) : (
            <ul className="space-y-4">
              {openObjections.map((item) => (
                <li key={item.id}>
                  <ObjectionBlock
                    item={item}
                    now={now}
                    busy={busy}
                    onResolve={async (note) =>
                      run(() =>
                        resolveLeadObjection({ leadId: lead.id, objectionId: item.id, note })
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {resolvedObjections.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-silver">
                Resolved ({resolvedObjections.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {resolvedObjections.map((item) => (
                  <li key={item.id}>
                    <ObjectionBlock item={item} now={now} busy={busy} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      </section>

      {file.pendingFollowUps.length > 0 || file.activeSequences.length > 0 ? (
        <section>
          <SectionHeader
            title="Follow-up drafts"
            hint="Review and approve one at a time. Nothing sends without you."
          />
          <Panel className="p-6">
            {file.activeSequences.length > 0 ? (
              <div className="mb-4 space-y-3">
                {file.activeSequences.map((sequenceRun) => (
                  <div key={sequenceRun.id}>
                    <p className="text-sm text-white">
                      Active {FOLLOW_UP_BRANCH_LABELS[sequenceRun.branch]} sequence · next draft{" "}
                      {sequenceRun.nextPosition} of {sequenceRun.maxSteps}
                    </p>
                    <p className={helperClass}>
                      Bounded to {sequenceRun.maxSteps} messages, ends {formatQueueUntil(sequenceRun.maxUntil, now)}.
                      Halted automatically on reply, booking, payment, or a closed status.
                    </p>
                    <button
                      type="button"
                      className={`${btnSecondary} ${btnSizeSm} mt-3`}
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          haltLeadSequence({ sequenceRunId: sequenceRun.id, leadId: lead.id })
                        )
                      }
                    >
                      Halt this sequence
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {file.pendingFollowUps.length > 0 ? (
              <ul className="space-y-4">
                {file.pendingFollowUps.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm text-white">
                      {FOLLOW_UP_BRANCH_LABELS[item.branch]} · {FOLLOW_UP_CHANNEL_LABELS[item.channel]}
                      {item.lowConfidence ? " · low confidence" : ""}
                      {item.stale ? " · stale" : ""}
                    </p>
                    <p className={helperClass}>
                      {FOLLOW_UP_STATUS_LABELS[item.status]} · expires {formatQueueUntil(item.expiresAt, now)}
                      {item.lowConfidenceReason ? ` · ${item.lowConfidenceReason}` : ""}
                      {item.failureReason ? ` · ${item.failureReason}` : ""}
                    </p>
                    <div className="mt-3">
                      <Link href={`/app/follow-ups/${item.id}`} className={`${btnPrimary} ${btnSizeSm}`}>
                        Review draft
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Next actions"
          actions={
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => setPanel(panel === "createAction" ? null : "createAction")}
            >
              Create action
            </button>
          }
        />
        {panel === "createAction" ? (
          <div className="mb-4">
            <FollowOnPanel
              busy={busy}
              error={error}
              onSkip={() => setPanel(null)}
              onSubmit={async (input) => {
                await run(() =>
                  createQueueFollowOn({ leadId: lead.id, actionText: input.actionText, dueAt: input.dueAt })
                );
              }}
            />
          </div>
        ) : null}
        <Panel className="p-6">
          {openActions.length === 0 ? (
            <p className="text-sm text-dim">No open actions.</p>
          ) : (
            <ul className="space-y-4">
              {openActions.map((item) => (
                <li key={item.id}>
                  <NextActionBlock
                    item={item}
                    members={file.members}
                    now={now}
                    busy={busy}
                    onComplete={() =>
                      run(() => completeQueueNextAction({ leadId: lead.id, nextActionId: item.id }))
                    }
                    onReassign={(ownerMemberId) =>
                      run(() =>
                        reassignLeadNextAction({
                          leadId: lead.id,
                          nextActionId: item.id,
                          ownerMemberId,
                        })
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {doneActions.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-silver">
                Completed ({doneActions.length})
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-dim">
                {doneActions.map((item) => (
                  <li key={item.id}>{item.actionText}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      </section>

      <section>
        <SectionHeader title="Timeline" hint="Touches and calls in one stream. Notes are yours — not the conversation." />
        <Panel className="p-6">
          {file.timeline.entries.length === 0 ? (
            <p className="text-sm text-dim">No touches or calls yet.</p>
          ) : (
            <ol className="space-y-3">
              {file.timeline.entries.map((entry, index) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  {index < 3 ? (
                    <TimelineEntry entry={entry} now={now} expanded />
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-sm text-silver">
                        {timelineSummary(entry, now)}
                      </summary>
                      <div className="mt-2">
                        <TimelineEntry entry={entry} now={now} expanded />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
          {file.timeline.hasMore ? (
            <div className="mt-4">
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={loadingOlder}
                onClick={() => {
                  const last = file.timeline.entries[file.timeline.entries.length - 1];
                  if (!last) return;
                  setLoadingOlder(true);
                  void loadCaseTimelinePage(lead.id, cursorFromTimelineEntry(last))
                    .then((page) => {
                      if (!page) return;
                      setFile((current) => ({
                        ...current,
                        timeline: {
                          entries: [...current.timeline.entries, ...page.entries],
                          hasMore: page.hasMore,
                        },
                      }));
                    })
                    .finally(() => setLoadingOlder(false));
                }}
              >
                {loadingOlder ? "Loading…" : "Load older"}
              </button>
            </div>
          ) : null}
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Calls"
          hint="Open a call for the extraction. The brief is one click away."
        />
        <div className="space-y-3">
          {file.calls.length === 0 ? (
            <Panel className="p-6">
              <p className="text-sm text-dim">No calls yet.</p>
            </Panel>
          ) : (
            file.calls.map((call) => <CallBlock key={call.id} call={call} now={now} leadId={lead.id} />)
          )}
        </div>
      </section>

      <section>
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">Application answers</summary>
            <p className={helperClass}>Raw intake. Mapped answers show which scoring factor they feed.</p>
            <ApplicationAnswers
              answers={lead.applicationAnswers}
              fieldMaps={file.fieldMaps}
            />
          </details>
        </Panel>
      </section>

      {file.revenue !== null ? (
        <section>
          <SectionHeader title="Revenue" hint="Owner and admin only. A payment here is what sets closed won." />
          <Panel className="p-6">
            {file.revenue.length === 0 ? (
              <p className="text-sm text-dim">No payments recorded.</p>
            ) : (
              <DefinitionList>
                {file.revenue.map((row) => (
                  <KeyValue key={row.id} label={formatQueueDuration(row.occurredAt, now)}>
                    {formatCents(row.amountCents, row.currency)} · {PAYMENT_TYPE_LABELS[row.paymentType]}
                    {row.closedByName ? ` · ${row.closedByName}` : ""}
                    {row.processor ? ` · ${row.processor}` : ""}
                  </KeyValue>
                ))}
              </DefinitionList>
            )}
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function factorValue(value: number | null): string {
  return value === null ? "—" : String(value);
}

function ScoreHistoryItem({ row, now }: { row: CaseScoreHistoryRow; now: string }) {
  const movement =
    row.previousTotal === null
      ? `First score ${row.total}`
      : row.previousTotal === row.total
        ? `${row.previousTotal} → ${row.total} (unchanged)`
        : `${row.previousTotal} → ${row.total} (${row.total - row.previousTotal > 0 ? "+" : ""}${row.total - row.previousTotal})`;
  return (
    <div>
      <p className="text-sm text-white">
        {movement}
        <span className="ml-2 text-dim">
          {SCORE_TRIGGER_LABELS[row.triggeredBy]} · {formatQueueDuration(row.createdAt, now)}
        </span>
      </p>
      <p className="mt-1 text-xs text-silver">
        T {factorValue(row.timeline)} · I {factorValue(row.investmentCapacity)} · A{" "}
        {factorValue(row.decisionAuthority)} · P {factorValue(row.painSeverity)}
        {row.scoredByName ? ` · ${row.scoredByName}` : ""}
      </p>
    </div>
  );
}

function ObjectionBlock({
  item,
  now,
  busy,
  onResolve,
}: {
  item: CaseObjection;
  now: string;
  busy: boolean;
  onResolve?: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const callLabel = item.callType
    ? `${CALL_TYPE_LABELS[item.callType]}${item.callOccurredAt ? ` · ${formatQueueDuration(item.callOccurredAt, now)}` : ""}`
    : "Unlinked call";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={OBJECTION_TYPE_LABELS[item.type]}
          tone={item.resolved ? "neutral" : "warning"}
        />
        {item.resolved ? <span className="text-xs text-dim">Resolved</span> : null}
      </div>
      <p className="mt-2 text-sm text-white">&ldquo;{item.verbatim}&rdquo;</p>
      <p className="mt-1 text-xs text-dim">{callLabel}</p>
      {item.resolved && item.resolvedNote ? (
        <p className="mt-2 text-xs text-silver">{item.resolvedNote}</p>
      ) : null}
      {onResolve && !item.resolved ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onResolve(note);
          }}
        >
          <label className="min-w-[12rem] flex-1">
            <span className={labelClass}>Resolution note</span>
            <input
              className={inputClass}
              maxLength={280}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
            />
          </label>
          <button type="submit" className={`${btnSecondary} ${btnSizeSm}`} disabled={busy || !note.trim()}>
            Resolve
          </button>
        </form>
      ) : null}
    </div>
  );
}

function NextActionBlock({
  item,
  members,
  now,
  busy,
  onComplete,
  onReassign,
}: {
  item: CaseNextAction;
  members: CaseFilePayload["members"];
  now: string;
  busy: boolean;
  onComplete: () => Promise<boolean>;
  onReassign: (ownerMemberId: string | null) => Promise<boolean>;
}) {
  const [ownerId, setOwnerId] = useState(item.ownerMemberId ?? "");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-white">{item.actionText}</p>
      <p className="mt-1 text-xs">
        {item.overdue ? (
          <span className="text-flag-critical">Overdue</span>
        ) : item.dueAt ? (
          <span className="text-dim">Due {formatQueueUntil(item.dueAt, now)}</span>
        ) : (
          <span className="text-dim">No due date</span>
        )}
        <span className="text-dim"> · {item.ownerName || "Unassigned"}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label>
          <span className={labelClass}>Owner</span>
          <Select
            
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          className={`${btnSecondary} ${btnSizeSm}`}
          disabled={busy || ownerId === (item.ownerMemberId ?? "")}
          onClick={() => void onReassign(ownerId || null)}
        >
          Reassign
        </button>
        <button
          type="button"
          className={`${btnPrimary} ${btnSizeSm}`}
          disabled={busy}
          onClick={() => void onComplete()}
        >
          Complete
        </button>
      </div>
    </div>
  );
}

function timelineSummary(entry: CaseTimelineEntry, now: string): string {
  const when = formatQueueDuration(entry.at, now);
  if (entry.kind === "touch") {
    return `${TOUCH_CHANNEL_LABELS[entry.channel]} · ${entry.direction} · ${when}`;
  }
  if (entry.kind === "call") {
    return `${CALL_TYPE_LABELS[entry.callType]} call · ${when}`;
  }
  return `Status ${LEAD_STATUS_LABELS[entry.fromStatus]} → ${LEAD_STATUS_LABELS[entry.toStatus]} · ${when}`;
}

function TimelineEntry({
  entry,
  now,
  expanded,
}: {
  entry: CaseTimelineEntry;
  now: string;
  expanded: boolean;
}) {
  return (
    <div className={expanded ? "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3" : ""}>
      {entry.kind === "touch" ? (
        <DefinitionList>
          <KeyValue label="Type">{entry.touchType === "human" ? "Human touch" : "System touch"}</KeyValue>
          <KeyValue label="Channel">{TOUCH_CHANNEL_LABELS[entry.channel]}</KeyValue>
          <KeyValue label="Direction">{entry.direction === "outbound" ? "Outbound" : "Inbound"}</KeyValue>
          <KeyValue label="Actor">{entry.actorName || "—"}</KeyValue>
          <KeyValue label="Outcome">
            {entry.outcome ? TOUCH_OUTCOME_LABELS[entry.outcome] : "—"}
          </KeyValue>
          <KeyValue label="When">{formatQueueDuration(entry.at, now)}</KeyValue>
          <KeyValue label="Note">{entry.note || "—"}</KeyValue>
          {entry.direction === "outbound" && entry.outboundBody ? (
            <KeyValue label="Sent">{entry.outboundBody}</KeyValue>
          ) : null}
        </DefinitionList>
      ) : null}
      {entry.kind === "call" ? (
        <DefinitionList>
          <KeyValue label="Type">{CALL_TYPE_LABELS[entry.callType]} call</KeyValue>
          <KeyValue label="Channel">Call</KeyValue>
          <KeyValue label="Actor">{entry.actorName || "—"}</KeyValue>
          <KeyValue label="Outcome">
            {entry.outcome ? CALL_OUTCOME_LABELS[entry.outcome] : "—"}
          </KeyValue>
          <KeyValue label="When">{formatQueueDuration(entry.at, now)}</KeyValue>
          <KeyValue label="Duration">{formatCallDuration(entry.durationSeconds)}</KeyValue>
        </DefinitionList>
      ) : null}
      {entry.kind === "status" ? (
        <DefinitionList>
          <KeyValue label="Type">
            {entry.source === "manual" ? "Manual status change" : "Event status change"}
          </KeyValue>
          <KeyValue label="Change">
            {LEAD_STATUS_LABELS[entry.fromStatus]} → {LEAD_STATUS_LABELS[entry.toStatus]}
          </KeyValue>
          <KeyValue label="Actor">
            {entry.source === "manual" ? entry.actorName || "—" : "System event"}
          </KeyValue>
          <KeyValue label="When">{formatQueueDuration(entry.at, now)}</KeyValue>
          <KeyValue label="Note">{entry.note || "—"}</KeyValue>
          {entry.supersedesManual ? (
            <KeyValue label="Supersedes">
              This event replaced a manual status. The event is the stronger evidence.
            </KeyValue>
          ) : null}
        </DefinitionList>
      ) : null}
    </div>
  );
}

function CallBlock({ call, now, leadId }: { call: CaseCall; now: string; leadId: string }) {
  return (
    <Panel className="p-6" as="article">
      <DefinitionList>
        <KeyValue label="Type">{CALL_TYPE_LABELS[call.type]}</KeyValue>
        <KeyValue label="Scheduled">
          {call.scheduledAt ? formatQueueDuration(call.scheduledAt, now) : "—"}
        </KeyValue>
        <KeyValue label="Occurred">
          {call.occurredAt ? formatQueueDuration(call.occurredAt, now) : "—"}
        </KeyValue>
        <KeyValue label="Duration">{formatCallDuration(call.durationSeconds)}</KeyValue>
        <KeyValue label="Outcome">{call.outcome ? CALL_OUTCOME_LABELS[call.outcome] : "—"}</KeyValue>
        <KeyValue label="Ran by">{call.ranByName || "—"}</KeyValue>
        <KeyValue label="Extraction">
          {call.extractionStatus === "failed"
            ? "Extraction failed"
            : call.extractionStatus === "pending"
              ? "Extracting"
              : call.hasExtraction
                ? "Ready"
                : call.hasTranscript
                  ? "Transcript stored, not extracted"
                  : "No transcript"}
        </KeyValue>
      </DefinitionList>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`/app/calls/${call.id}`} className={`${btnSecondary} ${btnSizeSm}`}>
          Open call
        </a>
        <a href={`/app/cases/${leadId}/brief`} className={`${btnPrimary} ${btnSizeSm}`}>
          Pre-call brief
        </a>
      </div>
    </Panel>
  );
}

function ApplicationAnswers({
  answers,
  fieldMaps,
}: {
  answers: Record<string, unknown>;
  fieldMaps: CaseFilePayload["fieldMaps"];
}) {
  const keys = Object.keys(answers);
  if (keys.length === 0) {
    return <p className="mt-3 text-sm text-dim">No intake answers.</p>;
  }
  const factorByField = new Map(fieldMaps.map((map) => [map.fieldName, map.factor]));
  return (
    <DefinitionList>
      {keys.sort().map((key) => {
        const factor = factorByField.get(key);
        return (
          <KeyValue key={key} label={key}>
            {formatAnswer(answers[key])}
            {factor ? (
              <span className="mt-1 block text-xs text-brand-300">Maps to {FACTOR_LABELS[factor]}</span>
            ) : (
              <span className="mt-1 block text-xs text-dim">Not mapped to a scoring factor</span>
            )}
          </KeyValue>
        );
      })}
    </DefinitionList>
  );
}

function OverridePanel({
  leadId,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  leadId: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("lead_id", leadId);
        setPending(true);
        void onSubmit(formData).finally(() => setPending(false));
      }}
    >
      <p className="text-sm font-medium text-white">Override score</p>
      <p className={helperClass}>
        Set factor values. The total is computed. Reasoning is required. A later call will re-score this lead.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SCORE_FACTORS.map((factor) => (
          <label key={factor} className="block">
            <span className={labelClass}>{FACTOR_LABELS[factor]}</span>
            <input
              name={factor}
              type="number"
              min={0}
              max={100}
              className={inputClass}
              placeholder="Unknown"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>Reasoning</span>
        <Textarea name="reasoning" required rows={3}  />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={busy || pending}>
          Save override
        </button>
        <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}

function StatusPanel({
  current,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  current: LeadStatus;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: { status: string; note: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState<Exclude<LeadStatus, "closed_won">>(
    current === "closed_won" ? "working" : current
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        void onSubmit({ status, note }).finally(() => setPending(false));
      }}
    >
      <p className="text-sm font-medium text-white">Change status</p>
      <p className={helperClass}>
        A later real event still wins. Closed won cannot be set here — it follows a recorded payment.
      </p>
      <label className="mt-4 block">
        <span className={labelClass}>Status</span>
        <Select
          
          value={status}
          onChange={(event) => setStatus(event.target.value as Exclude<LeadStatus, "closed_won">)}
        >
          {MANUAL_LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LEAD_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>
      <label className="mt-4 block">
        <span className={labelClass}>Why</span>
        <input
          className={inputClass}
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className={`${btnPrimary} ${btnSizeSm}`} disabled={busy || pending || !note.trim()}>
          Save status
        </button>
        <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
