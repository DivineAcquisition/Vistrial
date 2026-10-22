"use client";

import { CompassIcon, ScaleIcon, ScrollTextIcon, SendIcon, ShieldIcon, SparklesIcon, type LucideIcon } from "lucide-react";

import { Avatar, type AvatarColor, type AvatarSize } from "@/components/ui/heroui-avatar";
import { AGENT_ACCENTS, AGENTS, type AgentAccentKey, type AgentGlyph as GlyphName, type LiveAgentId } from "@/lib/agents/roster";
import { PRESENCE_TONE, type PresenceState } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const GLYPHS: Record<GlyphName, LucideIcon> = {
  scroll: ScrollTextIcon,
  shield: ShieldIcon,
  send: SendIcon,
  compass: CompassIcon,
  scale: ScaleIcon,
  spark: SparklesIcon,
};

/** Soft wash plus icon color, including the dark variants so they win over the avatar's built-in palette. */
const SURFACE: Record<AgentAccentKey, string> = {
  brand: "bg-brand-500/12 text-brand-300 dark:bg-brand-500/12 dark:text-brand-300",
  "chart-2": "bg-chart-2/12 text-chart-2 dark:bg-chart-2/12 dark:text-chart-2",
  info: "bg-info/12 text-info dark:bg-info/12 dark:text-info",
  "chart-4": "bg-chart-4/12 text-chart-4 dark:bg-chart-4/12 dark:text-chart-4",
  "chart-3": "bg-chart-3/12 text-chart-3 dark:bg-chart-3/12 dark:text-chart-3",
  neutral: "bg-overlay/8 text-silver dark:bg-overlay/8 dark:text-silver",
};

const AVATAR_COLOR: Record<AgentAccentKey, AvatarColor> = {
  brand: "accent",
  "chart-2": "success",
  info: "accent",
  "chart-4": "warning",
  "chart-3": "accent",
  neutral: "default",
};

const AVATAR_SIZE: Record<"xs" | "sm" | "md" | "lg", AvatarSize> = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "lg",
};

const BOX = {
  xs: "size-6 rounded-lg",
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
} as const;

const ICON = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-5",
} as const;

const DOT = {
  xs: "size-1.5 border",
  sm: "size-2 border-2",
  md: "size-2.5 border-2",
  lg: "size-3 border-2",
} as const;

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
  const Icon = GLYPHS[glyph] ?? SparklesIcon;
  const tone = AGENT_ACCENTS[accent] ?? AGENT_ACCENTS.neutral;
  return (
    <span aria-hidden data-glyph={glyph} className={cn("relative inline-flex shrink-0", className)}>
      <Avatar color={AVATAR_COLOR[accent]} size={AVATAR_SIZE[size]} variant="soft" className={BOX[size]}>
        <Avatar.Fallback className={SURFACE[accent]}>
          <Icon className={ICON[size]} />
        </Avatar.Fallback>
      </Avatar>
      {working ? (
        <span className={cn("live-pulse absolute right-0 bottom-0 rounded-full border-background", DOT[size], tone.dot)} />
      ) : null}
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
