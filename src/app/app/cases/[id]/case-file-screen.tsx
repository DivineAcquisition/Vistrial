"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  changeLeadStatus,
  loadCaseTimelinePage,
  reassignLeadNextAction,
  refreshCaseFile,
  resolveLeadObjection,
} from "@/app/app/cases/actions";
import { haltLeadSequence } from "@/app/app/follow-ups/actions";
import { recordBriefView } from "@/app/app/coaching/actions";
import type { BriefPayload } from "@/lib/brief/types";
import { ActivityEventLine } from "@/app/app/activity/activity-event";
import type { ActivityEvent } from "@/lib/activity/types";
import { ACTIVITY_CATEGORIES } from "@/lib/activity/types";
import { ACTIVITY_REALTIME_TABLES } from "@/lib/activity/realtime";
import { createClient } from "@/lib/supabase/client";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SCORE_CONFIDENCE_LABELS } from "@/lib/queue/types";
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
import { detectClientSurface } from "@/lib/mobile/surface";
import { newClientEventId } from "@/lib/mobile/outcome-queue";
import {
  CALL_OUTCOME_LABELS,
  CALL_TYPE_LABELS,
  LEAD_STATUS_LABELS,
  MANUAL_LEAD_STATUSES,
  OBJECTION_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  type LeadStatus,
} from "@/lib/leads/labels";
import { formatQueueDuration, formatQueueUntil } from "@/lib/queue/duration";
import { TOUCH_CHANNEL_LABELS, TOUCH_OUTCOME_LABELS } from "@/lib/queue/types";
import {
  FACTOR_PLAIN,
  FACTOR_TITLE,
  SCORE_CHANGE_CAUSE,
  WORDS,
} from "@/lib/vocabulary";
import { SCORE_FACTORS } from "@/lib/scoring/compute";
import { overrideLeadScore } from "@/lib/scoring/override";
import {
  errorClass,
  helperClass,
  labelClass,
} from "@/lib/ui";

type PanelKind = "outcome" | "assign" | "override" | "status" | "createAction" | null;

export function CaseFileScreen({
  initial,
  brief,
}: {
  initial: CaseFilePayload;
  brief: BriefPayload | null;
}) {
  const org = useOrg();
  const [file, setFile] = useState(initial);
  const [now] = useState(() => new Date().toISOString());
  const [panel, setPanel] = useState<PanelKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lead = file.lead;
  const panelRef = useRef(panel);
  const busyRef = useRef(busy);
  panelRef.current = panel;
  busyRef.current = busy;
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

  useEffect(() => {
    const supabase = createClient();
    let debounce: number | null = null;
    const pull = () => {
      if (panelRef.current || busyRef.current) return;
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refreshCaseFile(lead.id).then((next) => {
          if (next) setFile(next);
        });
      }, 400);
    };

    let channel = supabase.channel(`case-activity:${lead.id}`);
    for (const table of ACTIVITY_REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `org_id=eq.${org.org.id}` },
        pull
      );
    }
    channel.subscribe();

    return () => {
      if (debounce) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [lead.id, org.org.id]);

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
  const lastCall = brief?.lastCall ?? null;
  const whereFrom = [lead.source, lead.campaign].filter(Boolean).join(" · ") || "Where they came from is not established";

  useEffect(() => {
    void recordBriefView(lead.id);
  }, [lead.id]);

  return (
    <div className="space-y-8">
      {error ? <p className={errorClass}>{error}</p> : null}

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-heading text-lg text-white">{lead.name}</h2>
            <p className="mt-1 text-sm text-silver">{whereFrom}</p>
            {brief?.lead.offerName ? (
              <p className="mt-1 text-sm text-dim">{brief.lead.offerName}</p>
            ) : null}
            <p className="mt-2 text-sm text-silver">
              {[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.crmUrl ? (
              <Button
                variant="primary"
                size="sm"
                render={<a href={lead.crmUrl} target="_blank" rel="noopener noreferrer" />}
              >
                Open in CRM
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setPanel(panel === "outcome" ? null : "outcome")}
            >
              What happened
            </Button>
          </div>
        </div>
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
            await run(() =>
              logQueueOutcome({
                ...input,
                clientEventId: newClientEventId(),
                clientLoggedAt: new Date().toISOString(),
                clientSurface: detectClientSurface(),
              })
            );
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
        <SectionHeader
          title="What they have already objected to"
          hint="In their own words. Do not re-litigate these."
        />
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

      <section>
        <SectionHeader
          title="Last call"
          hint="What happened last time, and what was agreed."
        />
        <Panel className="p-6">
          {lastCall ? (
            <div className="space-y-2">
              <p className="text-sm text-white">{lastCall.summary || "Not established"}</p>
              <p className="text-sm text-silver">
                <span className="text-dim">What was agreed: </span>
                {lastCall.nextStepAgreed || "Not established"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-dim">No previous call is on file.</p>
          )}
          {brief && brief.quotes.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-silver">
              {brief.quotes.map((quote) => (
                <li key={quote.text}>“{quote.text}”</li>
              ))}
            </ul>
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          haltLeadSequence({ sequenceRunId: sequenceRun.id, leadId: lead.id })
                        )
                      }
                    >
                      Halt this sequence
                    </Button>
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
                      <Button variant="primary" size="sm" render={<Link href={`/app/follow-ups/${item.id}`} />}>
                        Review draft
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </section>
      ) : null}

      <details className="rounded-2xl border border-white/[0.08] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-white">More on this person</summary>
        <p className={helperClass}>Assign, status, and anything else that is not the call itself.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setPanel(panel === "assign" ? null : "assign")}
          >
            Assign
          </Button>
          {canOverride ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setPanel(panel === "override" ? null : "override")}
            >
              Change how ready they look
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setPanel(panel === "status" ? null : "status")}
          >
            Change status
          </Button>
        </div>
        <DefinitionList>
          <KeyValue label="Setter">{lead.assignedSetterName || "Unassigned"}</KeyValue>
          <KeyValue label="Closer">{lead.assignedCloserName || "Unassigned"}</KeyValue>
          <KeyValue label="In the pipeline since">{formatQueueDuration(lead.optedInAt, now)}</KeyValue>
          <KeyValue label="Last contacted">{formatQueueDuration(lead.lastTouchAt, now)}</KeyValue>
        </DefinitionList>
        {brief && brief.setterFacts.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-silver">
            {brief.setterFacts.map((fact) => (
              <li key={fact.label}>
                <span className="text-dim">{fact.label}: </span>
                {fact.value}
              </li>
            ))}
          </ul>
        ) : null}
      </details>

      <section>
        <SectionHeader
          title="Next actions"
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setPanel(panel === "createAction" ? null : "createAction")}
            >
              Create action
            </Button>
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
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">
              Everything that happened
            </summary>
            <p className={helperClass}>
              Notes, calls, and status changes. Failures stay visible.
            </p>
          {file.timeline.entries.length === 0 ? (
            <p className="text-sm text-dim">No activity on this lead yet.</p>
          ) : (
            <ol className="space-y-3">
              {file.timeline.entries.map((entry, index) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  {index < 3 || (entry.kind === "activity" && entry.result === "failed") ? (
                    <TimelineEntry entry={entry} now={now} expanded lead={lead} />
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-sm text-silver">
                        {timelineSummary(entry, now)}
                      </summary>
                      <div className="mt-2">
                        <TimelineEntry entry={entry} now={now} expanded lead={lead} />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
          {file.timeline.hasMore ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
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
              </Button>
            </div>
          ) : null}
          </details>
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Calls"
          hint="Open a call for what was said."
        />
        <div className="space-y-3">
          {file.calls.length === 0 ? (
            <Panel className="p-6">
              <p className="text-sm text-dim">No calls yet.</p>
            </Panel>
          ) : (
            file.calls.map((call) => <CallBlock key={call.id} call={call} now={now} />)
          )}
        </div>
      </section>

      <section>
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">
              {WORDS.readinessFactors}
            </summary>
            <p className={helperClass}>
              How ready they are is built from these four. The call changes with whichever one is
              weak.
            </p>
            {file.score ? (
              <DefinitionList>
                <KeyValue label="Out of 100">
                  <span className="font-medium text-white tabular-nums">{file.score.total}</span>
                </KeyValue>
                <KeyValue label="Confidence">
                  {file.score.scoreConfidence ? SCORE_CONFIDENCE_LABELS[file.score.scoreConfidence] : "—"}
                </KeyValue>
                <KeyValue label="How soon they want to move">{factorValue(file.score.timeline)}</KeyValue>
                <KeyValue label="What they can spend">{factorValue(file.score.investmentCapacity)}</KeyValue>
                <KeyValue label="Whether they decide">{factorValue(file.score.decisionAuthority)}</KeyValue>
                <KeyValue label="How much it hurts">{factorValue(file.score.painSeverity)}</KeyValue>
                <KeyValue label="Why">{file.score.reasoning || "—"}</KeyValue>
              </DefinitionList>
            ) : (
              <p className="mt-3 text-sm text-dim">
                Nobody has been scored yet. The first call or application answer fills this in.
              </p>
            )}
          </details>
        </Panel>
      </section>

      <section>
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">
              What changed this ({file.scoreHistory.length})
            </summary>
            <p className={helperClass}>Every time how ready they are moved, and what moved it.</p>
            {file.scoreHistory.length === 0 ? (
              <p className="mt-3 text-sm text-dim">Nothing has changed it yet.</p>
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
        <Panel className="p-6">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-white">
              What they told you on the application
            </summary>
            <p className={helperClass}>Their own answers, exactly as they gave them.</p>
            <ApplicationAnswers
              answers={lead.applicationAnswers}
              fieldMaps={file.fieldMaps}
            />
          </details>
        </Panel>
      </section>

      {file.revenue !== null ? (
        <section>
          <Panel className="p-6">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-white">
                What they paid ({file.revenue.length})
              </summary>
              <p className={helperClass}>Owners and admins only. A payment here is what marks them won.</p>
              {file.revenue.length === 0 ? (
                <p className="mt-3 text-sm text-dim">Nothing paid yet.</p>
              ) : (
                <DefinitionList>
                  {file.revenue.map((row) => (
                    <KeyValue key={row.id} label={formatQueueDuration(row.occurredAt, now)}>
                      {formatCents(row.amountCents, row.currency)} · {PAYMENT_TYPE_LABELS[row.paymentType]}
                      {row.closedByName ? ` · ${row.closedByName}` : ""}
                    </KeyValue>
                  ))}
                </DefinitionList>
              )}
            </details>
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
      ? `Started at ${row.total} out of 100`
      : row.previousTotal === row.total
        ? `Stayed at ${row.total}`
        : `${row.previousTotal} → ${row.total}`;
  return (
    <div>
      <p className="text-sm text-white">
        {movement}
        <span className="ml-2 text-dim">
          {SCORE_CHANGE_CAUSE[row.triggeredBy]} · {formatQueueDuration(row.createdAt, now)}
        </span>
      </p>
      <p className="mt-1 text-xs text-silver">
        {[
          `How soon ${factorValue(row.timeline)}`,
          `Can spend ${factorValue(row.investmentCapacity)}`,
          `Decides ${factorValue(row.decisionAuthority)}`,
          `Hurts ${factorValue(row.painSeverity)}`,
          row.scoredByName,
        ]
          .filter(Boolean)
          .join(" · ")}
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
            <Input
              type="text"
              className="w-full"
              maxLength={280}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              placeholder="Handled on the next call"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm" disabled={busy || !note.trim()}>
            Resolve
          </Button>
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
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || ownerId === (item.ownerMemberId ?? "")}
          onClick={() => void onReassign(ownerId || null)}
        >
          Reassign
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void onComplete()}
        >
          Complete
        </Button>
      </div>
    </div>
  );
}

function timelineSummary(entry: CaseTimelineEntry, now: string): string {
  const when = formatQueueDuration(entry.at, now);
  if (entry.kind === "touch") {
    const way = entry.direction === "inbound" ? "They replied" : "We contacted them";
    return `${way} by ${TOUCH_CHANNEL_LABELS[entry.channel].toLowerCase()} · ${when}`;
  }
  if (entry.kind === "call") {
    return `${CALL_TYPE_LABELS[entry.callType]} call · ${when}`;
  }
  if (entry.kind === "activity") {
    return `${entry.headline} · ${when}`;
  }
  return `Status ${LEAD_STATUS_LABELS[entry.fromStatus]} → ${LEAD_STATUS_LABELS[entry.toStatus]} · ${when}`;
}

function TimelineEntry({
  entry,
  now,
  expanded,
  lead,
}: {
  entry: CaseTimelineEntry;
  now: string;
  expanded: boolean;
  lead: { id: string; orgId: string; name: string };
}) {
  if (entry.kind === "activity") {
    const category = (ACTIVITY_CATEGORIES as readonly string[]).includes(entry.category)
      ? (entry.category as ActivityEvent["category"])
      : "system";
    const result =
      entry.result === "failed" || entry.result === "running" || entry.result === "succeeded"
        ? entry.result
        : "succeeded";
    const event: ActivityEvent = {
      id: entry.id,
      orgId: lead.orgId,
      orgName: null,
      occurredAt: entry.at,
      category,
      kind: entry.activityKind,
      headline: entry.headline,
      actorLabel: entry.actorName || "Workspace",
      actorKind: "scoring",
      actorUserId: null,
      integration: null,
      leadId: lead.id,
      leadName: lead.name,
      href: `/app/cases/${lead.id}`,
      result,
      resultReason: entry.resultReason,
      retryable: entry.retryable && entry.retryKind === "dispatch" && Boolean(entry.retryId),
      retryKind: entry.retryKind === "dispatch" ? "dispatch" : null,
      retryId: entry.retryId,
      isSyncNoise: false,
      detail: entry.detail,
    };
    return <ActivityEventLine event={event} now={now} defaultOpen={expanded || result === "failed"} />;
  }

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

function CallBlock({ call, now }: { call: CaseCall; now: string }) {
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
        <KeyValue label={WORDS.whatWasSaid}>
          {call.extractionStatus === "failed"
            ? "We could not read this recording. Open the call to see the transcript."
            : call.extractionStatus === "pending"
              ? "Being read now"
              : call.hasExtraction
                ? "Ready to read"
                : call.hasTranscript
                  ? "Recording saved, not read yet"
                  : "No recording"}
        </KeyValue>
      </DefinitionList>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" render={<a href={`/app/calls/${call.id}`} />}>
          Open call
        </Button>
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
              <span className="mt-1 block text-xs text-brand-300">
                We use this to judge {FACTOR_PLAIN[factor]}
              </span>
            ) : null}
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
            <span className={labelClass}>{FACTOR_TITLE[factor]}</span>
            <Input
              name={factor}
              type="number"
              min={0}
              max={100}
              placeholder="Unknown"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>Reasoning</span>
        <Textarea name="reasoning" required rows={3} placeholder="Why this override is right for this lead" />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy || pending}>
          Save override
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
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
        <Input
          type="text"
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
          placeholder="Moved to nurture — no budget this quarter"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy || pending || !note.trim()}>
          Save status
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </form>
  );
}
