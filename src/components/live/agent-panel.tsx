"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, WifiOffIcon } from "lucide-react";

import { AgentGlyph, formatClock, GlyphMark, PresenceDot, PresenceLabel, toneText } from "@/components/live/agent-identity";
import { useAgentEntries, useLiveMeta, useLiveState, useWaitingTotal } from "@/components/live/live-provider";
import { AgentRequestCard } from "@/components/live/request-card";
import { useRunViewer } from "@/components/live/run-viewer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { isLiveAgentId, type LiveAgentId } from "@/lib/agents/roster";
import {
  collapseBurst,
  groupFeed,
  PRESENCE_TONE,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  runOneLine,
  type LiveEvent,
} from "@/lib/live/model";
import { cn } from "@/lib/utils";

/** Open the panel, optionally at one agent. Click handlers may pass their event; it is ignored. */
type PanelContext = { open: (agentId?: unknown) => void };

const AgentPanelContext = createContext<PanelContext>({ open: () => undefined });

export function useAgentPanel(): PanelContext {
  return useContext(AgentPanelContext);
}

export function AgentPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<LiveAgentId | null>(null);
  const value = useMemo(
    () => ({
      open: (agentId?: unknown) => {
        setFocus(isLiveAgentId(agentId) ? agentId : null);
        setOpen(true);
      },
    }),
    []
  );
  return (
    <AgentPanelContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetPopup side="right" className="w-full max-w-md">
          <SheetPanel className="space-y-6 p-5">
            <SheetTitle className="pr-8 text-base font-semibold text-card-foreground">Agents</SheetTitle>
            {open ? <AgentPanelBody focus={focus} onNavigate={() => setOpen(false)} /> : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </AgentPanelContext.Provider>
  );
}

function AgentPanelBody({ focus, onNavigate }: { focus: LiveAgentId | null; onNavigate: () => void }) {
  const state = useLiveState();
  const presence = useAgentEntries();
  const waitingTotal = useWaitingTotal();
  const { calm, setCalm } = useLiveMeta();
  const waiting = useMemo(
    () => [...state.waiting.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.waiting]
  );
  const groups = useMemo(() => groupFeed(collapseBurst(state.events)), [state.events]);
  const viewer = useRunViewer();
  const focusRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focus) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focus]);

  return (
    <>
      <ConnectionNotice />

      <section aria-labelledby="panel-waiting">
        <h3 id="panel-waiting" className="mb-2 text-xs font-medium uppercase tracking-wide text-warning">
          Waiting on you{waitingTotal ? ` (${waitingTotal})` : ""}
        </h3>
        {waiting.length ? (
          <div className="space-y-2">
            {waiting.slice(0, 10).map((item) => (
              <AgentRequestCard key={item.id} item={item} compact={item.status !== "approved"} />
            ))}
            {waitingTotal > 10 ? (
              <p className="text-xs text-muted-foreground">{waitingTotal - Math.min(waiting.length, 10)} more on Overview.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        )}
      </section>

      <section aria-labelledby="panel-agents">
        <h3 id="panel-agents" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your agents
        </h3>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {presence.map((item) => {
            return (
              <li
                key={item.id}
                ref={item.id === focus ? focusRef : undefined}
                aria-current={item.id === focus ? "true" : undefined}
                className={cn("flex items-start gap-3 p-3", item.id === focus && "bg-accent/60")}
              >
                <GlyphMark glyph={item.glyph} accent={item.accent} working={item.state === "working"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {item.known ? (
                      <Link
                        href={`/app/agents/${item.id}`}
                        onClick={onNavigate}
                        className="text-sm font-medium text-card-foreground hover:underline"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-card-foreground">{item.name}</span>
                    )}
                    <PresenceLabel state={item.state} label={item.stateLabel} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
                  <p className="truncate text-xs text-muted-foreground" title={item.liveLabel ?? item.runSummary ?? ""}>
                    {item.liveLabel ?? item.runSummary}
                  </p>
                  {item.currentRunId ? (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => viewer.open(item.currentRunId!)}
                    >
                      {item.state === "working" ? "Watch it work" : "View run"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="panel-feed">
        <h3 id="panel-feed" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </h3>
        {groups.length ? (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
                <ul className="space-y-1">
                  {group.events.map((event) => (
                    <FeedRow key={event.id} event={event} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No agent activity in the last two days.</p>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium text-card-foreground">Calm mode</p>
          <p className="text-xs text-muted-foreground">Fewer moving parts. Updates still arrive.</p>
        </div>
        <Switch checked={calm} onCheckedChange={(on) => setCalm(on)} aria-label="Calm mode" />
      </div>
    </>
  );
}

function FeedRow({ event }: { event: LiveEvent }) {
  const [open, setOpen] = useState(false);
  const state = useLiveState();
  const viewer = useRunViewer();
  const run = state.runs.get(event.runId) ?? null;
  const fresh = state.touched.has(event.runId);
  return (
    <li className={cn("rounded-md", fresh && "live-highlight")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 rounded-md p-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentGlyph agentId={event.agentId} size="xs" />
        <span className="min-w-0 flex-1 text-sm text-card-foreground">{event.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatClock(event.occurredAt)}</span>
        <ChevronDownIcon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="ml-7 space-y-1 border-l border-border py-1 pl-3 text-xs">
          {run ? (
            <>
              <p className={cn("font-medium", toneText(RUN_STATUS_TONE[run.status]))}>{RUN_STATUS_LABEL[run.status]}</p>
              <p className="text-muted-foreground">{runOneLine(run)}</p>
            </>
          ) : null}
          <button
            type="button"
            className="font-medium text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => viewer.open(event.runId)}
          >
            View full run
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Says plainly when live updates are not flowing. Silent when they are. */
export function ConnectionNotice({ compact = false }: { compact?: boolean }) {
  const { connection } = useLiveState();
  const { available } = useLiveMeta();
  if (!available || connection === "live" || connection === "connecting") return null;
  const text =
    connection === "lost"
      ? "This workspace is no longer open to you, so live updates stopped."
      : connection === "polling"
        ? "Live updates are slow right now. Checking every few seconds."
        : "Reconnecting. What you see is saved, and it will catch up.";
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-1.5 text-muted-foreground",
        compact ? "text-xs" : "rounded-lg border border-border p-2 text-xs"
      )}
    >
      <WifiOffIcon aria-hidden className="size-3.5 shrink-0" />
      <span className={cn(compact && "hidden sm:inline")}>{text}</span>
      {compact ? <span className="sm:hidden">{connection === "lost" ? "Stopped" : "Reconnecting"}</span> : null}
    </p>
  );
}

/** The thin live line under the header. Every agent, every width. */
export function LiveStatusStrip() {
  const { available } = useLiveMeta();
  const presence = useAgentEntries();
  const waitingTotal = useWaitingTotal();
  const panel = useAgentPanel();
  if (!available) return null;
  const working = presence.find((item) => item.state === "working");

  return (
    <div className="print:hidden border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2 px-4 py-1.5 sm:px-6">
        <button
          type="button"
          onClick={panel.open}
          aria-label={`Agents: ${presence.map((item) => `${item.name} ${item.stateLabel}`).join(", ")}. Open the agent panel.`}
          className="flex min-w-0 items-center gap-1 rounded-md p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
        >
          {presence.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1.5 px-1" title={`${item.name}: ${item.stateLabel}`}>
              <GlyphMark glyph={item.glyph} accent={item.accent} size="xs" working={item.state === "working"} />
              <span className="hidden text-xs font-medium text-card-foreground lg:inline">{item.name}</span>
              <PresenceDot state={item.state} />
              <span className={cn("hidden text-xs xl:inline", toneText(PRESENCE_TONE[item.state]))}>{item.stateLabel}</span>
            </span>
          ))}
        </button>
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block" aria-live="off">
          {working?.liveLabel ? <span className="live-shimmer-text">{working.liveLabel}</span> : null}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ConnectionNotice compact />
          {waitingTotal ? (
            <Button size="xs" variant="outline" onClick={panel.open} className="border-warning/40 text-warning">
              {waitingTotal} waiting on you
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
