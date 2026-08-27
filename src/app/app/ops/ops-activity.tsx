"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityFiltersForm } from "@/app/app/activity/activity-filters";
import { ActivityLineView } from "@/app/app/activity/activity-event";
import { refreshOpsActivity } from "@/app/app/activity/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { Panel } from "@/components/ui/panel";
import { batchActivityEvents } from "@/lib/activity/batch";
import { ACTIVITY_REALTIME_TABLES } from "@/lib/activity/realtime";
import {
  ACTIVITY_LIVE_CAP,
  ACTIVITY_PAGE_SIZE,
  type ActivityCursor,
  type ActivityEvent,
  type ActivityFilters,
  type ActivityPage,
} from "@/lib/activity/types";
import { createClient } from "@/lib/supabase/client";
import { cardTitle, helperClass } from "@/lib/ui";

type ChannelState = "connecting" | "live" | "stalled";

function cursorFromEvent(event: ActivityEvent): ActivityCursor {
  return { at: event.occurredAt, id: event.id, failed: event.result === "failed" };
}

export function OpsActivity({
  initial,
  filters,
  clients,
}: {
  initial: ActivityPage;
  filters: ActivityFilters;
  clients: Array<{ id: string; name: string }>;
}) {
  const [events, setEvents] = useState(initial.events);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [paused, setPaused] = useState(false);
  const [pendingWhilePaused, setPendingWhilePaused] = useState(false);
  const [channelState, setChannelState] = useState<ChannelState>("connecting");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pausedRef = useRef(false);
  const seenIds = useRef(new Set(initial.events.map((row) => row.id)));
  const loadedOlder = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const applyLive = useCallback(async () => {
    const page = await refreshOpsActivity(filters, { limit: ACTIVITY_PAGE_SIZE });
    if (pausedRef.current) {
      setPendingWhilePaused(true);
      return;
    }
    for (const row of page.events) seenIds.current.add(row.id);
    if (loadedOlder.current) {
      setEvents((current) => {
        const merged = [
          ...page.events,
          ...current.filter((row) => !page.events.some((n) => n.id === row.id)),
        ];
        return merged;
      });
      return;
    }
    setEvents(page.events.slice(0, ACTIVITY_LIVE_CAP));
    setHasMore(page.hasMore);
  }, [filters]);

  useEffect(() => {
    const supabase = createClient();
    let debounce: number | null = null;
    const pull = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void applyLive();
      }, 400);
    };

    let channel = supabase.channel("ops-activity");
    for (const table of ACTIVITY_REALTIME_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, pull);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelState("live");
      else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
        setChannelState("stalled");
      }
    });

    return () => {
      if (debounce) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [applyLive]);

  const lines = useMemo(() => batchActivityEvents(events), [events]);

  async function unpause() {
    setPaused(false);
    pausedRef.current = false;
    if (pendingWhilePaused) {
      setPendingWhilePaused(false);
      await applyLive();
    }
  }

  return (
    <Panel className="mb-8 p-6">
      <h2 className={cardTitle}>Portfolio activity</h2>
      <p className={helperClass}>
        Failures across every client sit first. This is where a support conversation starts.
      </p>

      {channelState === "stalled" ? (
        <Notice tone="critical" className="mt-4" title="The live feed is not connected">
          This is not a quiet system. The stream is stalled.
        </Notice>
      ) : channelState === "connecting" ? (
        <Notice tone="warning" className="mt-4" title="Connecting to the live feed">
          The stream is not live yet. This is not a quiet system.
        </Notice>
      ) : null}

      {paused ? (
        <Notice
          tone="warning"
          className="mt-4"
          title="Feed paused"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void unpause()}>
              Resume
            </Button>
          }
        >
          {pendingWhilePaused ? "New events are waiting. Resume to prepend them." : "Held still so you can read."}
        </Notice>
      ) : (
        <div className="mt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => setPaused(true)}>
            Pause
          </Button>
        </div>
      )}

      <div className="mt-4">
        <ActivityFiltersForm filters={filters} actors={[]} basePath="/app/ops" clients={clients} />
      </div>

      <ol className="mt-6 space-y-3">
        {lines.length === 0 ? (
          <li className="text-sm text-dim">No activity in this window.</li>
        ) : (
          lines.map((line) => (
            <li key={line.type === "single" ? line.event.id : line.key}>
              <ActivityLineView line={line} now={now} showOrg onRetried={() => void applyLive()} />
            </li>
          ))
        )}
      </ol>

      {hasMore ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loadingOlder}
            onClick={() => {
              const last = events[events.length - 1];
              if (!last) return;
              setLoadingOlder(true);
              loadedOlder.current = true;
              void refreshOpsActivity(filters, {
                cursor: cursorFromEvent(last),
                limit: ACTIVITY_PAGE_SIZE,
              })
                .then((page) => {
                  setEvents((current) => {
                    const incoming = page.events.filter((row) => !current.some((e) => e.id === row.id));
                    for (const row of incoming) seenIds.current.add(row.id);
                    return [...current, ...incoming];
                  });
                  setHasMore(page.hasMore);
                })
                .finally(() => setLoadingOlder(false));
            }}
          >
            {loadingOlder ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
