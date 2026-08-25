"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrg } from "@/components/app/org-provider";
import { QueueFilters } from "@/app/app/queue/queue-filters";
import { QueueLeadRow } from "@/app/app/queue/queue-row";
import { QueueMobileList } from "@/app/app/queue/queue-mobile-list";
import {
  assignQueueLead,
  completeQueueNextAction,
  createQueueFollowOn,
  logQueueOutcome,
  refreshQueue,
} from "@/app/app/queue/actions";
import { cursorFromRow } from "@/lib/queue/cursor";
import { queueEmptyKind } from "@/lib/queue/parse";
import { detectClientSurface } from "@/lib/mobile/surface";
import { newClientEventId } from "@/lib/mobile/outcome-queue";
import {
  QUEUE_PAGE_SIZE,
  type LogOutcomeInput,
  type QueueFilters as QueueFilterState,
  type QueuePayload,
  type QueueRow,
} from "@/lib/queue/types";
import { MIN_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { formatQueueUntil } from "@/lib/queue/duration";
import {
  FOLLOW_UP_BRANCH_LABELS,
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_STATUS_LABELS,
} from "@/lib/follow-up/labels";
import { createClient } from "@/lib/supabase/client";
import { btnPrimary, btnSecondary, btnSizeLg, btnSizeSm, errorClass, sectionLabel } from "@/lib/ui";

/**
 * Ten columns is right at a desk and wrong on a phone. The context columns fold
 * away below `md` and reappear as a line under the lead's name, so the queue
 * stays readable instead of turning into a sideways scroll.
 */
type QueueColumn = { label: string; hideOnMobile?: boolean };

const ALARM_COLUMNS: QueueColumn[] = [
  { label: "Lead" },
  { label: "Breach" },
  { label: "Score" },
  { label: "Confidence", hideOnMobile: true },
  { label: "Source", hideOnMobile: true },
  { label: "Opted in", hideOnMobile: true },
  { label: "Last touch", hideOnMobile: true },
  { label: "Setter", hideOnMobile: true },
  { label: "Closer", hideOnMobile: true },
  { label: "Actions" },
];

const QUEUE_COLUMNS: QueueColumn[] = [
  { label: "Lead" },
  { label: "Score" },
  { label: "Confidence", hideOnMobile: true },
  { label: "Source", hideOnMobile: true },
  { label: "Opted in", hideOnMobile: true },
  { label: "Last touch", hideOnMobile: true },
  { label: "Setter", hideOnMobile: true },
  { label: "Closer", hideOnMobile: true },
  { label: "Next action" },
  { label: "Actions" },
];

type Snapshot = {
  alarm: QueueRow[];
  queue: QueueRow[];
  hasMore: boolean;
};

export function QueueScreen({
  initial,
  filters,
  canOpenIntegrations,
  voiceExampleCount,
}: {
  initial: QueuePayload;
  filters: QueueFilterState;
  canOpenIntegrations: boolean;
  voiceExampleCount: number;
}) {
  const org = useOrg();
  const [alarm, setAlarm] = useState(initial.alarm);
  const [queue, setQueue] = useState(initial.queue);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [members, setMembers] = useState(initial.members);
  const [sources, setSources] = useState(initial.sources);
  const [meta, setMeta] = useState({
    crmStatus: initial.crmStatus,
    orgLeadCount: initial.orgLeadCount,
    unfilteredActionableCount: initial.unfilteredActionableCount,
  });
  const [now, setNow] = useState(() => new Date().toISOString());
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [exitingAlarm, setExitingAlarm] = useState<QueueRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState(initial.pendingDrafts);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const seenIds = useRef(new Set([...initial.alarm, ...initial.queue].map((row) => row.id)));
  const pendingLive = useRef<QueuePayload | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const interactingRef = useRef<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const loadedCount = useRef(initial.queue.length);
  const alarmRef = useRef(initial.alarm);

  useEffect(() => {
    alarmRef.current = alarm;
  }, [alarm]);

  const emptyKind = queueEmptyKind({
    ...initial,
    ...meta,
    alarm,
    queue,
    pendingDrafts,
    hasMore,
    members,
    sources,
  });
  const connectionBanner =
    meta.orgLeadCount > 0 &&
    (meta.crmStatus === "broken" || meta.crmStatus === "missing" || meta.crmStatus === "inactive")
      ? meta.crmStatus === "broken"
        ? "broken"
        : "not_connected"
      : null;

  const applyPayload = useCallback((payload: QueuePayload, previousAlarm: QueueRow[]) => {
    const nextAlarm = payload.alarm;
    const nextQueue = payload.queue;

    const leaving = previousAlarm.filter((row) => !nextAlarm.some((next) => next.id === row.id));
    if (leaving.length > 0) {
      setExitingAlarm(leaving);
      window.setTimeout(() => {
        setExitingAlarm((current) =>
          current.filter((row) => leaving.every((left) => left.id !== row.id))
        );
      }, 800);
    }

    const fresh = [...nextAlarm, ...nextQueue]
      .map((row) => row.id)
      .filter((id) => !seenIds.current.has(id));
    if (fresh.length > 0) {
      for (const id of fresh) seenIds.current.add(id);
      setArrivingIds((current) => new Set([...current, ...fresh]));
      window.setTimeout(() => {
        setArrivingIds((current) => {
          const next = new Set(current);
          for (const id of fresh) next.delete(id);
          return next;
        });
      }, 8000);
    }

    setAlarm(nextAlarm);
    setQueue(nextQueue);
    setHasMore(payload.hasMore);
    setMembers(payload.members);
    setSources(payload.sources);
    setPendingDrafts(payload.pendingDrafts);
    setMeta({
      crmStatus: payload.crmStatus,
      orgLeadCount: payload.orgLeadCount,
      unfilteredActionableCount: payload.unfilteredActionableCount,
    });
    loadedCount.current = nextQueue.length;
  }, []);

  const applyLive = useCallback(
    (payload: QueuePayload, previousAlarm: QueueRow[]) => {
      if (interactingRef.current || busyRef.current) {
        pendingLive.current = payload;
        return;
      }
      applyPayload(payload, previousAlarm);
    },
    [applyPayload]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let debounce: number | null = null;
    const pull = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refreshQueue(filters, { limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current) }).then(
          (payload) => applyLive(payload, alarmRef.current)
        );
      }, 400);
    };

    const channel = supabase
      .channel(`queue:${org.org.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `org_id=eq.${org.org.id}` },
        pull
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "next_actions", filter: `org_id=eq.${org.org.id}` },
        pull
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "touches", filter: `org_id=eq.${org.org.id}` },
        pull
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_up_drafts", filter: `org_id=eq.${org.org.id}` },
        pull
      )
      .subscribe();

    return () => {
      if (debounce) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [applyLive, filters, org.org.id]);

  function flushPendingLive() {
    if (interactingRef.current || busyRef.current || !pendingLive.current) return;
    const pending = pendingLive.current;
    pendingLive.current = null;
    applyPayload(pending, alarmRef.current);
  }

  function reconcile(payload: QueuePayload) {
    pendingLive.current = null;
    applyPayload(payload, alarmRef.current);
  }

  function setInteracting(leadId: string | null) {
    interactingRef.current = leadId;
    if (!leadId) flushPendingLive();
  }

  function begin(leadId: string) {
    snapshot.current = { alarm, queue, hasMore };
    busyRef.current = leadId;
    setBusyLeadId(leadId);
    setActionError(null);
  }

  function finishBusy() {
    snapshot.current = null;
    busyRef.current = null;
    setBusyLeadId(null);
  }

  function revert(error: string) {
    if (snapshot.current) {
      setAlarm(snapshot.current.alarm);
      setQueue(snapshot.current.queue);
      setHasMore(snapshot.current.hasMore);
      setExitingAlarm([]);
    }
    snapshot.current = null;
    busyRef.current = null;
    setActionError(error);
    setBusyLeadId(null);
  }

  async function handleLogOutcome(input: LogOutcomeInput) {
    begin(input.leadId);
    const current = [...alarm, ...queue].find((row) => row.id === input.leadId);
    const payload: LogOutcomeInput = {
      ...input,
      clientEventId: input.clientEventId || newClientEventId(),
      clientLoggedAt: input.clientLoggedAt || new Date().toISOString(),
      clientSurface: input.clientSurface || detectClientSurface(),
      expectedLeadStatus: input.expectedLeadStatus ?? current?.status ?? null,
      expectedLastTouchAt: input.expectedLastTouchAt ?? current?.lastTouchAt ?? null,
      expectedFirstHumanTouchAt: input.expectedFirstHumanTouchAt ?? current?.firstHumanTouchAt ?? null,
    };

    const result = await logQueueOutcome(payload);
    if (!result.ok) {
      revert(result.error);
      return false;
    }
    finishBusy();
    if (result.discrepancy) setActionError(result.discrepancy);
    reconcile(
      await refreshQueue(filters, {
        limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current),
      })
    );
    return true;
  }

  async function handleAssign(input: {
    leadId: string;
    setterId: string | null;
    closerId: string | null;
  }) {
    begin(input.leadId);
    const setter = members.find((member) => member.id === input.setterId);
    const closer = members.find((member) => member.id === input.closerId);
    const patch = (row: QueueRow) =>
      row.id === input.leadId
        ? {
            ...row,
            assignedSetterId: input.setterId,
            assignedCloserId: input.closerId,
            assignedSetterName: setter?.displayName ?? null,
            assignedCloserName: closer?.displayName ?? null,
          }
        : row;
    setAlarm((rows) => rows.map(patch));
    setQueue((rows) => rows.map(patch));

    const result = await assignQueueLead(input);
    if (!result.ok) {
      revert(result.error);
      return false;
    }
    finishBusy();
    reconcile(
      await refreshQueue(filters, {
        limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current),
      })
    );
    return true;
  }

  async function handleComplete(input: { leadId: string; nextActionId: string }) {
    setInteracting(input.leadId);
    begin(input.leadId);
    const clearAction = (row: QueueRow) =>
      row.id === input.leadId ? { ...row, nextAction: null } : row;
    setAlarm((rows) => rows.map(clearAction));
    setQueue((rows) => rows.map(clearAction));
    const result = await completeQueueNextAction(input);
    if (!result.ok) {
      revert(result.error);
      setInteracting(null);
      return false;
    }
    finishBusy();
    reconcile(
      await refreshQueue(filters, {
        limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current),
      })
    );
    return true;
  }

  async function handleFollowOn(input: {
    leadId: string;
    actionText: string;
    dueAt: string | null;
  }) {
    begin(input.leadId);
    const result = await createQueueFollowOn(input);
    if (!result.ok) {
      revert(result.error);
      return false;
    }
    finishBusy();
    reconcile(
      await refreshQueue(filters, {
        limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current),
      })
    );
    return true;
  }

  async function pullRefresh() {
    setRefreshing(true);
    try {
      reconcile(
        await refreshQueue(filters, {
          limit: Math.max(QUEUE_PAGE_SIZE, loadedCount.current),
        })
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    const last = queue[queue.length - 1];
    if (!last || !hasMore) return;
    setLoadingMore(true);
    try {
      const payload = await refreshQueue(filters, {
        cursor: cursorFromRow(last),
        limit: QUEUE_PAGE_SIZE,
      });
      const incoming = payload.queue.filter((row) => !queue.some((existing) => existing.id === row.id));
      setQueue((rows) => [...rows, ...incoming]);
      setHasMore(payload.hasMore);
      loadedCount.current += incoming.length;
      for (const row of incoming) seenIds.current.add(row.id);
    } finally {
      setLoadingMore(false);
    }
  }

  const integrations = canOpenIntegrations ? (
    <Link href="/app/settings/integrations" className={`${btnSecondary} ${btnSizeSm}`}>
      Open integrations
    </Link>
  ) : null;

  const alarmVisible = useMemo(() => {
    const exitingIds = new Set(exitingAlarm.map((row) => row.id));
    const live = alarm.filter((row) => !exitingIds.has(row.id));
    return [...exitingAlarm, ...live];
  }, [alarm, exitingAlarm]);

  const showWorkingSurface = emptyKind === null || emptyKind === "nothing_to_work";

  return (
    <div
      onTouchStart={(event) => {
        if (window.scrollY > 8) return;
        (event.currentTarget as HTMLElement).dataset.pullY = String(
          event.changedTouches[0]?.clientY ?? 0
        );
      }}
      onTouchEnd={(event) => {
        const start = Number((event.currentTarget as HTMLElement).dataset.pullY ?? 0);
        const y = event.changedTouches[0]?.clientY ?? 0;
        if (start && y - start > 72) void pullRefresh();
      }}
    >
      {actionError ? <p className={`${errorClass} mb-4`}>{actionError}</p> : null}

      {connectionBanner === "broken" ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="The CRM connection is broken"
            detail="GoHighLevel is linked but token refresh failed. Reconnect in Integrations. Existing leads stay on this screen so the outage is not hidden."
            action={integrations}
          />
        </div>
      ) : null}

      {connectionBanner === "not_connected" ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="The CRM is not connected"
            detail="New inbound will not land until GoHighLevel is linked. Leads already in this workspace still need action below."
            action={integrations}
          />
        </div>
      ) : null}

      {canOpenIntegrations && voiceExampleCount < MIN_VOICE_EXAMPLES ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="Add real messages this business has sent"
            detail="Follow-up drafts copy those examples more than any slider. Paste two to five on the Follow-up settings tab before you start approving."
            action={
              <Link href="/app/settings/follow-up" className={`${btnPrimary} ${btnSizeSm}`}>
                Open follow-up settings
              </Link>
            }
          />
        </div>
      ) : null}

      {emptyKind === "not_connected" ? (
        <EmptyState
          kind="unconfigured"
          title="The queue is empty until the CRM is connected"
          detail="New leads land here after GoHighLevel is linked and scoring can rank them. Nothing is missing on your side yet — the connection has not been set up."
          action={integrations}
        />
      ) : null}

      {emptyKind === "broken" ? (
        <EmptyState
          kind="unconfigured"
          title="The queue cannot load while the CRM connection is broken"
          detail="GoHighLevel is linked but token refresh failed. Reconnect in Integrations. Showing an empty queue would hide this outage."
          action={integrations}
        />
      ) : null}

      {emptyKind === "no_leads" ? (
        <EmptyState
          kind="empty"
          title="No leads yet"
          detail="GoHighLevel is connected and working. Nothing has come in yet. The first contact will appear here after it ingests."
        />
      ) : null}

      {showWorkingSurface ? (
        <>
          {pendingDrafts.length > 0 ? (
            <section className="mb-8" aria-label="Follow-up drafts">
              <p className={sectionLabel}>Follow-up drafts</p>
              <p className="mt-2 text-sm text-dim">
                Approve one at a time. Each message is grounded in a specific call and does not send until you read it.
              </p>
              <ul className="mt-4 space-y-3">
                {pendingDrafts.map((item) => (
                  <li key={item.id} className="panel rounded-2xl p-4">
                    <p className="text-sm text-white">
                      {item.leadName} · {FOLLOW_UP_BRANCH_LABELS[item.branch]} ·{" "}
                      {FOLLOW_UP_CHANNEL_LABELS[item.channel]}
                      {item.lowConfidence ? " · low confidence" : ""}
                      {item.stale ? " · stale" : ""}
                    </p>
                    <p className="mt-1 text-xs text-dim">
                      {FOLLOW_UP_STATUS_LABELS[item.status]} · expires {formatQueueUntil(item.expiresAt, now)}
                      {item.lowConfidenceReason ? ` · ${item.lowConfidenceReason}` : ""}
                      {item.failureReason ? ` · ${item.failureReason}` : ""}
                    </p>
                    <div className="mt-3">
                      <Link href={`/app/follow-ups/${item.id}`} className={`${btnPrimary} ${btnSizeSm}`}>
                        Review
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mb-8" aria-label="Speed-to-lead alarm">
            <p className={sectionLabel}>Speed-to-lead</p>
            {filters.breached ? (
              <p className="mt-2 text-sm text-silver">
                Showing breached leads. This band cannot be dismissed.
              </p>
            ) : null}
            {alarmVisible.length === 0 ? (
              <p className="mt-3 text-sm text-dim">
                Nothing unworked past the speed-to-lead window.
              </p>
            ) : (
              <>
                <div className="mt-4 md:hidden">
                  <QueueMobileList
                    rows={alarmVisible}
                    now={now}
                    variant="alarm"
                    members={members}
                    role={org.role}
                    memberId={org.memberId}
                    isPlatformAdmin={org.isPlatformAdmin}
                    arrivingIds={arrivingIds}
                    exitingIds={new Set(exitingAlarm.map((row) => row.id))}
                    busyLeadId={busyLeadId}
                    error={actionError}
                    onAssign={handleAssign}
                    onComplete={handleComplete}
                    onFollowOn={handleFollowOn}
                  />
                </div>
                <div className="panel mt-4 hidden overflow-hidden rounded-2xl md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {ALARM_COLUMNS.map((column) => (
                        <TableHead
                          key={column.label}
                          className={column.hideOnMobile ? "hidden md:table-cell" : undefined}
                        >
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alarmVisible.map((row) => (
                      <QueueLeadRow
                        key={row.id}
                        row={row}
                        now={now}
                        variant="alarm"
                        members={members}
                        role={org.role}
                        memberId={org.memberId}
                        isPlatformAdmin={org.isPlatformAdmin}
                        arriving={arrivingIds.has(row.id)}
                        exiting={exitingAlarm.some((item) => item.id === row.id)}
                        busy={busyLeadId === row.id}
                        error={busyLeadId === row.id ? actionError : null}
                        colSpan={ALARM_COLUMNS.length}
                        onInteract={setInteracting}
                        onLogOutcome={handleLogOutcome}
                        onAssign={handleAssign}
                        onComplete={handleComplete}
                        onFollowOn={handleFollowOn}
                      />
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </section>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeLg} md:hidden`}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
            </button>
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeLg} md:hidden`}
              disabled={refreshing}
              onClick={() => void pullRefresh()}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className={filtersOpen ? "md:block" : "hidden md:block"}>
            <QueueFilters filters={filters} sources={sources} />
          </div>

          {emptyKind === "nothing_to_work" ? (
            <EmptyState
              kind="empty"
              title="Nothing to work"
              detail="Every lead that needed a touch is handled. This is the state the day is supposed to reach."
            />
          ) : filters.breached ? null : (
            <section aria-label="Working queue">
              <p className={sectionLabel}>Queue</p>
              <div className="mt-4 md:hidden">
                {queue.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-dim">
                    No leads match these filters. The alarm band above still shows every breach.
                  </p>
                ) : (
                  <QueueMobileList
                    rows={queue}
                    now={now}
                    variant="queue"
                    members={members}
                    role={org.role}
                    memberId={org.memberId}
                    isPlatformAdmin={org.isPlatformAdmin}
                    arrivingIds={arrivingIds}
                    busyLeadId={busyLeadId}
                    error={actionError}
                    onAssign={handleAssign}
                    onComplete={handleComplete}
                    onFollowOn={handleFollowOn}
                  />
                )}
              </div>
              <div className="panel mt-4 hidden overflow-hidden rounded-2xl md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {QUEUE_COLUMNS.map((column) => (
                        <TableHead
                          key={column.label}
                          className={column.hideOnMobile ? "hidden md:table-cell" : undefined}
                        >
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <td
                          colSpan={QUEUE_COLUMNS.length}
                          className="px-4 py-12 text-center text-sm text-dim"
                        >
                          No leads match these filters. The alarm band above still shows every
                          breach.
                        </td>
                      </TableRow>
                    ) : (
                      queue.map((row) => (
                        <QueueLeadRow
                          key={row.id}
                          row={row}
                          now={now}
                          variant="queue"
                          members={members}
                          role={org.role}
                          memberId={org.memberId}
                          isPlatformAdmin={org.isPlatformAdmin}
                          arriving={arrivingIds.has(row.id)}
                          busy={busyLeadId === row.id}
                          error={busyLeadId === row.id ? actionError : null}
                          colSpan={QUEUE_COLUMNS.length}
                          onInteract={setInteracting}
                          onLogOutcome={handleLogOutcome}
                          onAssign={handleAssign}
                          onComplete={handleComplete}
                          onFollowOn={handleFollowOn}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className={`${btnPrimary} ${btnSizeSm}`}
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
