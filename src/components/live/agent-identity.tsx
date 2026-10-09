"use client";

import { CompassIcon, ScrollTextIcon, SendIcon, ShieldIcon, type LucideIcon } from "lucide-react";

import { AGENTS, type AgentGlyph as GlyphName, type LiveAgentId } from "@/lib/agents/roster";
import { PRESENCE_TONE, type PresenceState } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const GLYPHS: Record<GlyphName, LucideIcon> = {
  scroll: ScrollTextIcon,
  shield: ShieldIcon,
  send: SendIcon,
  compass: CompassIcon,
};

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
  const Icon = GLYPHS[agent.glyph];
  const box = { xs: "size-5", sm: "size-6", md: "size-8", lg: "size-11" }[size];
  const icon = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" }[size];
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-md ring-1",
        agent.accent.soft,
        agent.accent.ring,
        box,
        className
      )}
    >
      <Icon className={cn(icon, agent.accent.text)} />
      {working ? <span className={cn("live-pulse absolute -right-0.5 -top-0.5 size-1.5 rounded-full", agent.accent.dot)} /> : null}
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
        {showRole ? <span className="block truncate text-xs text-muted-foreground">{agent.role}</span> : null}
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
