"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrg } from "@/components/app/org-provider";
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
import { createClient } from "@/lib/supabase/client";
import { errorClass, sectionLabel } from "@/lib/ui";
import { Panel } from "@/components/ui/panel";

type QueueColumn = { label: string; hideOnMobile?: boolean };

const ALARM_COLUMNS: QueueColumn[] = [
  { label: "Who" },
  { label: "Waiting too long" },
  { label: "Waiting", hideOnMobile: true },
  { label: "" },
];

const QUEUE_COLUMNS: QueueColumn[] = [
  { label: "Who" },
  { label: "Waiting", hideOnMobile: true },
  { label: "" },
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
}: {
  initial: QueuePayload;
  filters: QueueFilterState;
  canOpenIntegrations: boolean;
}) {
  const org = useOrg();
  const [alarm, setAlarm] = useState(initial.alarm);
  const [queue, setQueue] = useState(initial.queue);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [members, setMembers] = useState(initial.members);
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
    sources: initial.sources,
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
    <Button variant="secondary" size="sm" render={<Link href="/app/settings/integrations" />}>
      Open integrations
    </Button>
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
            detail="Your CRM is linked but the connection expired. Reconnect in More, then Settings, then Integrations. People already here stay on this list so the outage is not hidden."
            action={integrations}
          />
        </div>
      ) : null}

      {connectionBanner === "not_connected" ? (
        <div className="mb-8">
          <EmptyState
            kind="unconfigured"
            title="The CRM is not connected"
            detail="New people will not land until your CRM is linked. People already in this workspace still need action below."
            action={integrations}
          />
        </div>
      ) : null}

      {emptyKind === "not_connected" ? (
        <EmptyState
          kind="unconfigured"
          title="This list is empty until the CRM is connected"
          detail="New people land here after your CRM is linked. Nothing is missing on your side yet — the connection has not been set up."
          action={integrations}
        />
      ) : null}

      {emptyKind === "broken" ? (
        <EmptyState
          kind="unconfigured"
          title="This list cannot load while the CRM connection is broken"
          detail="Your CRM is linked but the connection expired. Reconnect in More, then Settings, then Integrations. Showing an empty list would hide this outage."
          action={integrations}
        />
      ) : null}

      {emptyKind === "no_leads" ? (
        <EmptyState
          kind="empty"
          title="No one yet"
          detail="The CRM is connected and working. Nobody has come in yet. The first person will appear here when they arrive."
        />
      ) : null}

      {showWorkingSurface ? (
        <>
          <section className="mb-8" aria-label="Waiting too long">
            <p className={sectionLabel}>Waiting too long</p>
            {alarmVisible.length === 0 ? (
              <p className="mt-3 text-sm text-dim">Nobody has been waiting too long.</p>
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
                    onLogOutcome={handleLogOutcome}
                    onAssign={handleAssign}
                    onComplete={handleComplete}
                    onFollowOn={handleFollowOn}
                  />
                </div>
                <Panel className="mt-4 hidden overflow-hidden py-0 md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {ALARM_COLUMNS.map((column) => (
                        <TableHead
                          key={column.label || "actions"}
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
                </Panel>
              </>
            )}
          </section>

          <div className="mb-6 md:hidden">
            <Button
              type="button"
              variant="secondary"
              size="xl"
              disabled={refreshing}
              onClick={() => void pullRefresh()}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {emptyKind === "nothing_to_work" ? (
            <EmptyState
              kind="empty"
              title="Nothing to work"
              detail="Every lead that needed a touch is handled. This is the state the day is supposed to reach."
            />
          ) : (
            <section aria-label="Who to call">
              <p className={sectionLabel}>Next</p>
              <div className="mt-4 md:hidden">
                {queue.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-dim">
                    Everyone waiting too long is still listed above.
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
                    onLogOutcome={handleLogOutcome}
                    onAssign={handleAssign}
                    onComplete={handleComplete}
                    onFollowOn={handleFollowOn}
                  />
                )}
              </div>
              <Panel className="mt-4 hidden overflow-hidden py-0 md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {QUEUE_COLUMNS.map((column) => (
                        <TableHead
                          key={column.label || "actions"}
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
                          Everyone waiting too long is still listed above.
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
              </Panel>
              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
