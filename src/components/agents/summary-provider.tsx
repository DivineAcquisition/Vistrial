"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fetchAgentSummaryAction } from "@/app/(workspace)/app/agents/roster-actions";
import { AgentSummaryContext } from "@/components/agents/summary-context";
import { useLiveMeta, useLiveState } from "@/components/live/live-provider";
import type { AgentSummary } from "@/lib/agents/summary";

/** Rows change at most this often, so a busy agent never flickers. */
const MIN_REFRESH_MS = 2000;
/** Sentry windows and Assay tiers do not ride the live channel; this catches them. */
const BACKSTOP_MS = 30_000;

/**
 * Keeps the shared summary current. It starts from the summary the page was
 * rendered with (no wait on first paint), then refetches the one summary
 * request whenever the live channel reports a change, batched so a burst of
 * events is one refresh.
 */
export function AgentSummaryProvider({
  orgId,
  initial,
  children,
}: {
  orgId: string;
  initial: AgentSummary | null;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<AgentSummary | null>(initial);
  const live = useLiveState();
  const { offline } = useLiveMeta();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  const load = useCallback(async () => {
    if (offline) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    last.current = Date.now();
    try {
      const result = await fetchAgentSummaryAction(orgId).catch(() => null);
      if (result?.ok && result.data.orgId === orgId) setSummary(result.data);
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        schedule();
      }
    }
    // schedule is stable through the refs it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, orgId]);

  const schedule = useCallback(() => {
    if (timer.current) return;
    const wait = Math.max(0, last.current + MIN_REFRESH_MS - Date.now());
    timer.current = setTimeout(() => {
      timer.current = null;
      void load();
    }, wait);
  }, [load]);

  // A live event of any kind: refresh the summary, batched.
  const version = live.version;
  const seen = useRef(version);
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    schedule();
  }, [schedule, version]);

  useEffect(() => {
    const backstop = setInterval(() => schedule(), BACKSTOP_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(backstop);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  const connection = live.connection;
  const value = useMemo(
    () => ({
      summary,
      refresh: () => void load(),
      reconnecting: Boolean(summary?.reconnecting) || connection === "reconnecting" || connection === "polling",
    }),
    [connection, load, summary]
  );

  return <AgentSummaryContext.Provider value={value}>{children}</AgentSummaryContext.Provider>;
}
