"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityFiltersForm } from "@/app/app/activity/activity-filters";
import { ActivityLineView } from "@/app/app/activity/activity-event";
import { refreshOrgActivity } from "@/app/app/activity/actions";
import { useOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { batchActivityEvents } from "@/lib/activity/batch";
import { ACTIVITY_REALTIME_TABLES } from "@/lib/activity/realtime";
import {
  ACTIVITY_LIVE_CAP,
  ACTIVITY_PAGE_SIZE,
  type ActivityActorOption,
  type ActivityCursor,
  type ActivityEvent,
  type ActivityFilters,
  type ActivityPage,
} from "@/lib/activity/types";
import { createClient } from "@/lib/supabase/client";

type ChannelState = "connecting" | "live" | "stalled";

function cursorFromEvent(event: ActivityEvent): ActivityCursor {
  return { at: event.occurredAt, id: event.id };
}

export function ActivityScreen({
  initial,
  filters,
  actors,
}: {
  initial: ActivityPage;
  filters: ActivityFilters;
  actors: ActivityActorOption[];
}) {
  const org = useOrg();
  const [events, setEvents] = useState(initial.events);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [paused, setPaused] = useState(false);
  const [pendingWhilePaused, setPendingWhilePaused] = useState(false);
  const [channelState, setChannelState] = useState<ChannelState>("connecting");
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [loadingOlder, setLoadingOlder] = useState(false);
  const liveCap = useRef(initial.events.length <= ACTIVITY_LIVE_CAP);
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
    const page = await refreshOrgActivity(filters, { limit: ACTIVITY_PAGE_SIZE });
    if (pausedRef.current) {
      setPendingWhilePaused(true);
      return;
    }
    const fresh = page.events.filter((row) => !seenIds.current.has(row.id)).map((row) => row.id);
    for (const id of fresh) seenIds.current.add(id);
    if (fresh.length > 0) {
      setArrivingIds((current) => new Set([...current, ...fresh]));
      window.setTimeout(() => {
        setArrivingIds((current) => {
          const next = new Set(current);
          for (const id of fresh) next.delete(id);
          return next;
        });
      }, 8000);
    }
    if (loadedOlder.current) {
      setEvents((current) => {
        const merged = [...page.events, ...current.filter((row) => !page.events.some((n) => n.id === row.id))];
        return merged;
      });
      return;
    }
    const next = liveCap.current ? page.events.slice(0, ACTIVITY_LIVE_CAP) : page.events;
    setEvents(next);
    setHasMore(page.hasMore || page.events.length > ACTIVITY_LIVE_CAP);
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

    let channel = supabase.channel(`activity:${org.org.id}`);
    for (const table of ACTIVITY_REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `org_id=eq.${org.org.id}` },
        pull
      );
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
  }, [applyLive, org.org.id]);

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
    <div>
      {channelState === "stalled" ? (
        <Notice tone="critical" className="mb-6" title="The live feed is not connected">
          This is not a quiet system. The live list stopped updating, so new work will not appear
          until the connection returns.
        </Notice>
      ) : channelState === "connecting" ? (
        <Notice tone="warning" className="mb-6" title="Connecting to the live feed">
          The live list is still connecting. This is not a quiet system.
        </Notice>
      ) : null}

      {paused ? (
        <Notice
          tone="warning"
          className="mb-6"
          title="Feed paused"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void unpause()}>
              Resume
            </Button>
          }
        >
          {pendingWhilePaused
            ? "New events arrived while you were reading. Resume to prepend them without jumping the page."
            : "The feed is held still so you can read."}
        </Notice>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => (paused ? void unpause() : setPaused(true))}
        >
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>

      <ActivityFiltersForm
        filters={filters}
        actors={actors}
        isPlatformAdmin={org.isPlatformAdmin}
      />

      <ol className="mt-6 space-y-3">
        {lines.length === 0 ? (
          <li className="text-sm text-dim">Nothing in this view yet.</li>
        ) : (
          lines.map((line) => {
            const key = line.type === "single" ? line.event.id : line.key;
            const arriving =
              line.type === "single"
                ? arrivingIds.has(line.event.id)
                : line.events.some((item) => arrivingIds.has(item.id));
            return (
              <li
                key={key}
                className={arriving ? "rounded-xl ring-1 ring-brand-500/40" : undefined}
              >
                <ActivityLineView line={line} now={now} onRetried={() => void applyLive()} />
              </li>
            );
          })
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
              liveCap.current = false;
              void refreshOrgActivity(filters, {
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
    </div>
  );
}
