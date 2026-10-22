"use client";

import { AGENT_ACCENTS, AGENT_ORB_COLORS, AGENTS, type AgentAccentKey, type AgentGlyph as GlyphName, type LiveAgentId } from "@/lib/agents/roster";
import { PRESENCE_TONE, type PresenceState } from "@/lib/live/model";
import { LiveOrb } from "@/components/ui/live-orb";
import { cn } from "@/lib/utils";

export function AgentGlyph({
  agentId,
  size = "sm",
  working = false,
  className,
}: {
  agentId: LiveAgentId;
  size?: "xs" | "sm" | "md" | "lg";
  working?: boolean;
  className?: string;
}) {
  const agent = AGENTS[agentId];
  return <GlyphMark glyph={agent.glyph} accent={agent.accentKey} size={size} working={working} className={className} />;
}

/** A glyph from registry data, so an agent with no code of its own still has one. */
export function GlyphMark({
  glyph,
  accent,
  size = "sm",
  working = false,
  className,
}: {
  glyph: GlyphName;
  accent: AgentAccentKey;
  size?: "xs" | "sm" | "md" | "lg";
  working?: boolean;
  className?: string;
}) {
  const tone = AGENT_ACCENTS[accent] ?? AGENT_ACCENTS.neutral;
  const px = { xs: 20, sm: 24, md: 32, lg: 44 }[size];
  // The smallest marks sit in long lists. A painted face keeps the browser's
  // WebGL budget for the orbs a person is actually looking at.
  const still = size === "xs";
  return (
    <span aria-hidden data-glyph={glyph} className={cn("relative inline-flex shrink-0", className)}>
      <LiveOrb
        variant="webgl"
        size={px}
        colors={AGENT_ORB_COLORS[accent]}
        interactive={!still}
        blink={!still}
        still={still}
        className="pointer-events-none"
      />
      {working ? <span className={cn("live-pulse absolute -right-0.5 -top-0.5 size-1.5 rounded-full ring-2 ring-background", tone.dot)} /> : null}
    </span>
  );
}

/** Glyph and name together, so identity never rests on color. */
export function AgentName({
  agentId,
  size = "sm",
  className,
  showRole = false,
}: {
  agentId: LiveAgentId;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showRole?: boolean;
}) {
  const agent = AGENTS[agentId];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <AgentGlyph agentId={agentId} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-card-foreground">{agent.name}</span>
        {showRole ? <span className="block truncate text-xs text-muted-foreground">{agent.sublabel}</span> : null}
      </span>
    </span>
  );
}

/** "Drafted by Relay · 2:14 PM" */
export function ProducedBy({
  agentId,
  verb,
  at,
  className,
}: {
  agentId: LiveAgentId;
  verb: string;
  at?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <AgentGlyph agentId={agentId} size="xs" />
      <span>
        {verb} by <span className="font-medium text-card-foreground">{AGENTS[agentId].name}</span>
        {at ? <> · {formatClock(at)}</> : null}
      </span>
    </span>
  );
}

const TONE_TEXT: Record<string, string> = {
  brand: "text-brand-300",
  neutral: "text-muted-foreground",
  good: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

const TONE_DOT: Record<string, string> = {
  brand: "bg-brand-400",
  neutral: "bg-muted-foreground",
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

export function PresenceDot({ state }: { state: PresenceState }) {
  const tone = PRESENCE_TONE[state];
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_DOT[tone], state === "working" && "live-pulse")}
    />
  );
}

export function PresenceLabel({ state, label, className }: { state: PresenceState; label: string; className?: string }) {
  const tone = PRESENCE_TONE[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TONE_TEXT[tone], className)}>
      <PresenceDot state={state} />
      {label}
    </span>
  );
}

export function toneText(tone: string): string {
  return TONE_TEXT[tone] ?? TONE_TEXT.neutral;
}

export function toneDot(tone: string): string {
  return TONE_DOT[tone] ?? TONE_DOT.neutral;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
