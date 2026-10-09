"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { fetchLiveSince, setCalmModeAction } from "@/app/(workspace)/app/agents/actions";
import { AGENTS } from "@/lib/agents/roster";
import {
  deriveAllPresence,
  mapControl,
  isOpenRequest,
  mapEvent,
  mapOutput,
  mapRun,
  mapStep,
  mapWaiting,
  presenceForWorkspaceStatus,
  type AgentControl,
  type AgentPresence,
  type LiveEvent,
  type LiveOutput,
  type LiveRun,
  type LiveStep,
  type WaitingItem,
} from "@/lib/live/model";
import type { LiveSnapshot } from "@/lib/live/load";
import { createClient } from "@/lib/supabase/client";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "polling" | "lost";

type State = {
  runs: Map<string, LiveRun>;
  events: LiveEvent[];
  controls: Map<string, AgentControl>;
  waiting: Map<string, WaitingItem>;
  steps: Map<string, LiveStep[]>;
  outputs: Map<string, LiveOutput[]>;
  /** id → when it last changed, for fading highlights. Runs and leads. */
  touched: Map<string, number>;
  connection: ConnectionState;
  lastSeenAt: string;
  version: number;
};

const EVENT_CAP = 300;
const FLUSH_MS = 200;

type Store = {
  get: () => State;
  subscribe: (listener: () => void) => () => void;
  apply: (fn: (draft: State) => void) => void;
};

function createStore(initial: State): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  let pending: Array<(draft: State) => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (pending.length === 0) return;
    const next: State = {
      ...state,
      runs: new Map(state.runs),
      controls: new Map(state.controls),
      waiting: new Map(state.waiting),
      steps: new Map(state.steps),
      outputs: new Map(state.outputs),
      touched: new Map(state.touched),
      events: state.events,
      version: state.version + 1,
    };
    for (const fn of pending) fn(next);
    pending = [];
    if (next.events.length > EVENT_CAP) next.events = next.events.slice(0, EVENT_CAP);
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: (fn) => {
      pending.push(fn);
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    },
  };
}

function fromSnapshot(snapshot: LiveSnapshot): State {
  return {
    runs: new Map(snapshot.runs.map((run) => [run.id, run])),
    events: [...snapshot.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    controls: new Map(snapshot.controls.map((control) => [control.agentId, control])),
    waiting: new Map(snapshot.waiting.map((item) => [item.id, item])),
    steps: new Map(),
    outputs: new Map(),
    touched: new Map(),
    connection: "connecting",
    lastSeenAt: snapshot.loadedAt,
    version: 0,
  };
}

function mergeSnapshot(draft: State, snapshot: LiveSnapshot) {
  for (const run of snapshot.runs) {
    draft.runs.set(run.id, run);
  }
  const known = new Set(draft.events.map((event) => event.id));
  const fresh = snapshot.events.filter((event) => !known.has(event.id));
  if (fresh.length) draft.events = [...fresh, ...draft.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  draft.controls = new Map(snapshot.controls.map((control) => [control.agentId, control]));
  draft.waiting = new Map(snapshot.waiting.map((item) => [item.id, item]));
  draft.lastSeenAt = snapshot.loadedAt;
}

type LiveContextValue = {
  store: Store;
  orgId: string;
  workspaceStatus: string;
  calm: boolean;
  setCalm: (on: boolean) => void;
  announce: (text: string) => void;
};

const LiveContext = createContext<LiveContextValue | null>(null);

const TABLES = [
  "agent_activity_runs",
  "agent_activity_steps",
  "agent_activity_events",
  "agent_activity_outputs",
  "agent_presence_controls",
  "approval_items",
] as const;

export function LiveProvider({
  orgId,
  workspaceStatus,
  initial,
  initialCalm,
  children,
}: {
  orgId: string;
  workspaceStatus: string;
  initial: LiveSnapshot;
  initialCalm: boolean;
  children: ReactNode;
}) {
  const [store] = useState(() => createStore(fromSnapshot(initial)));
  const [calm, setCalmState] = useState(initialCalm);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounce = useRef(0);

  const announce = useCallback((text: string) => {
    const now = Date.now();
    if (now - lastAnnounce.current < 8000) return;
    lastAnnounce.current = now;
    setAnnouncement(text);
  }, []);

  const setCalm = useCallback((on: boolean) => {
    setCalmState(on);
    void setCalmModeAction(on);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.calm = calm ? "true" : "false";
  }, [calm]);

  useEffect(() => {
    if (presenceForWorkspaceStatus(workspaceStatus) !== "active") {
      store.apply((draft) => {
        draft.connection = "live";
      });
    }
    const supabase = createClient();
    let disposed = false;
    let everLive = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const setConnection = (connection: ConnectionState) =>
      store.apply((draft) => {
        if (draft.connection !== "lost") draft.connection = connection;
      });

    const fill = async () => {
      const since = new Date(Date.parse(store.get().lastSeenAt) - 5000).toISOString();
      const result = await fetchLiveSince(orgId, since).catch(() => null);
      if (disposed || !result) return;
      if (!result.ok) {
        if (result.lost) {
          store.apply((draft) => {
            draft.connection = "lost";
          });
          void supabase.removeAllChannels();
        }
        return;
      }
      store.apply((draft) => mergeSnapshot(draft, result.data));
    };

    const startPolling = () => {
      if (poll) return;
      setConnection("polling");
      poll = setInterval(() => void fill(), 10_000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    const onChange = (table: (typeof TABLES)[number], payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (!row) return;
      const at = Date.now();
      store.apply((draft) => {
        draft.lastSeenAt = new Date().toISOString();
        switch (table) {
          case "agent_activity_runs": {
            const run = mapRun(row);
            if (!run) return;
            const before = draft.runs.get(run.id);
            draft.runs.set(run.id, run);
            draft.touched.set(run.id, at);
            if (run.leadId) draft.touched.set(run.leadId, at);
            if (before && before.status !== run.status && run.status === "waiting_person") {
              announce(`${AGENTS[run.agentId].name} needs you: ${run.subjectLabel}.`);
            }
            break;
          }
          case "agent_activity_steps": {
            const step = mapStep(row);
            const list = [...(draft.steps.get(step.runId) ?? [])];
            const index = list.findIndex((item) => item.seq === step.seq);
            if (index >= 0) list[index] = step;
            else list.push(step);
            list.sort((a, b) => a.seq - b.seq);
            draft.steps.set(step.runId, list);
            break;
          }
          case "agent_activity_events": {
            const event = mapEvent(row);
            if (!event || draft.events.some((item) => item.id === event.id)) return;
            draft.events = [event, ...draft.events];
            break;
          }
          case "agent_activity_outputs": {
            const output = mapOutput(row);
            if (!output) return;
            const list = draft.outputs.get(output.runId) ?? [];
            if (!list.some((item) => item.id === output.id)) draft.outputs.set(output.runId, [...list, output]);
            if (output.leadId) draft.touched.set(output.leadId, at);
            break;
          }
          case "agent_presence_controls": {
            const control = mapControl(row);
            if (control) draft.controls.set(control.agentId, control);
            break;
          }
          case "approval_items": {
            if (!row.agent_id) return;
            const item = mapWaiting(row);
            if (isOpenRequest(item.status)) {
              const isNew = !draft.waiting.has(item.id);
              draft.waiting.set(item.id, item);
              if (isNew) announce(`New request: ${item.title}.`);
            } else {
              draft.waiting.delete(item.id);
            }
            break;
          }
        }
      });
    };

    let channel = supabase.channel(`live:${orgId}`);
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => onChange(table, payload)
      );
    }
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        stopPolling();
        setConnection("live");
        if (everLive) void fill();
        everLive = true;
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
        setConnection("reconnecting");
        startPolling();
      }
    });
    fallbackTimer = setTimeout(() => {
      if (store.get().connection === "connecting") startPolling();
    }, 8000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void fill();
    };
    const onOnline = () => void fill();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    const expire = setInterval(() => {
      const cut = Date.now() - 4000;
      const stale = [...store.get().touched.entries()].some(([, at]) => at < cut);
      if (stale) {
        store.apply((draft) => {
          for (const [id, at] of draft.touched) if (at < cut) draft.touched.delete(id);
        });
      }
    }, 1000);

    return () => {
      disposed = true;
      stopPolling();
      clearInterval(expire);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [announce, orgId, store, workspaceStatus]);

  const value = useMemo(
    () => ({ store, orgId, workspaceStatus, calm, setCalm, announce }),
    [store, orgId, workspaceStatus, calm, setCalm, announce]
  );

  return (
    <LiveContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </LiveContext.Provider>
  );
}

function useLiveContext(): LiveContextValue | null {
  return useContext(LiveContext);
}

const EMPTY_STATE: State = {
  runs: new Map(),
  events: [],
  controls: new Map(),
  waiting: new Map(),
  steps: new Map(),
  outputs: new Map(),
  touched: new Map(),
  connection: "connecting",
  lastSeenAt: new Date(0).toISOString(),
  version: 0,
};

const noop = () => () => undefined;

export function useLiveState(): State {
  const ctx = useLiveContext();
  return useSyncExternalStore(
    ctx?.store.subscribe ?? noop,
    () => ctx?.store.get() ?? EMPTY_STATE,
    () => ctx?.store.get() ?? EMPTY_STATE
  );
}

export function useLiveMeta() {
  const ctx = useLiveContext();
  return {
    available: ctx !== null,
    orgId: ctx?.orgId ?? null,
    workspaceStatus: ctx?.workspaceStatus ?? "active",
    calm: ctx?.calm ?? false,
    setCalm: ctx?.setCalm ?? (() => undefined),
  };
}

export function usePresence(): AgentPresence[] {
  const state = useLiveState();
  const { workspaceStatus } = useLiveMeta();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return useMemo(
    () =>
      deriveAllPresence({
        runs: [...state.runs.values()],
        controls: [...state.controls.values()],
        waiting: [...state.waiting.values()],
        workspace: presenceForWorkspaceStatus(workspaceStatus),
        now,
      }),
    [state.version, workspaceStatus, now] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** Live merge for one run: steps and outputs arrive while the viewer is open. */
export function useRunLive(runId: string | null): {
  run: LiveRun | null;
  steps: LiveStep[];
  outputs: LiveOutput[];
  events: LiveEvent[];
} {
  const state = useLiveState();
  return useMemo(() => {
    if (!runId) return { run: null, steps: [], outputs: [], events: [] };
    return {
      run: state.runs.get(runId) ?? null,
      steps: state.steps.get(runId) ?? [],
      outputs: state.outputs.get(runId) ?? [],
      events: state.events.filter((event) => event.runId === runId),
    };
  }, [runId, state]);
}

/** Whether an id (run or lead) changed in the last few seconds. */
export function useRecentlyTouched(id: string | null | undefined): boolean {
  const state = useLiveState();
  return id ? state.touched.has(id) : false;
}

export function useLeadLive(leadId: string): { runs: LiveRun[]; waiting: WaitingItem[] } {
  const state = useLiveState();
  return useMemo(
    () => ({
      runs: [...state.runs.values()].filter((run) => run.leadId === leadId),
      waiting: [...state.waiting.values()].filter((item) => item.leadIds.includes(leadId)),
    }),
    [leadId, state]
  );
}
