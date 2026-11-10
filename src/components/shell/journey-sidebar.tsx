"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Bell,
  BookOpen,
  Brain,
  ChevronRight,
  Building2,
  Check,
  ChevronsUpDownIcon,
  Coins,
  FileSearch,
  Gauge,
  Hourglass,
  Plus,
  Search,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "@/components/icons";
import { GlyphMark } from "@/components/live/agent-identity";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/input";
import { Menu, MenuGroupLabel, MenuItem, MenuLinkItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { money } from "@/lib/research/words";
import {
  AGENT_MARK,
  JOURNEY_TABS,
  agentDot,
  agentsForTab,
  agentTabs,
  agentsOffJourney,
  chatHref,
  defaultTab,
  isJourneyTab,
  workTabsFor,
  tabForPath,
  type AgentActivity,
  type AgentDot,
  type JourneyTab,
} from "@/lib/shell/journey";
import type { RailAgent } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const TAB_STORE = "vistrial.journeyTab.v1";
const NEW_CHAT = chatHref("growth-architect");

function readTab(): JourneyTab | null {
  try {
    const value = window.localStorage.getItem(TAB_STORE);
    return isJourneyTab(value) ? value : null;
  } catch {
    return null;
  }
}

function writeTab(tab: JourneyTab) {
  try {
    window.localStorage.setItem(TAB_STORE, tab);
  } catch {
    // Private windows and blocked storage: the tab still works, it just is not remembered.
  }
}

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const row =
  "flex min-h-8 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

const heading = "px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase";

function Count({ value, tone = "neutral", label }: { value: number; tone?: "neutral" | "warning"; label?: string }) {
  if (!value) return null;
  return (
    <span
      aria-label={label}
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 text-[11px] leading-5 font-medium tabular-nums",
        tone === "warning" ? "bg-warning/15 text-warning" : "bg-overlay/[0.06] text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

const DOT: Record<AgentDot, { label: string; className: string }> = {
  working: { label: "Working", className: "bg-primary animate-pulse motion-reduce:animate-none" },
  waiting: { label: "Waiting on you", className: "bg-warning" },
  idle: { label: "Idle", className: "bg-muted-foreground/40" },
};

export type HomeOverview = FunctionReturnType<typeof api.home.overview>;
export type SearchHit = FunctionReturnType<typeof api.home.search>[number];
export type Credits = { on: boolean; balanceCents: number | null } | null;

export type SidebarData = {
  overview: HomeOverview | undefined;
  credits: Credits | undefined;
};

/** The workspace name and a small menu. One business per person today; switching will live here. */
function BusinessHeader({ name, onNavigate }: { name: string; onNavigate?: () => void }) {
  const items: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/app/settings", label: "Settings", icon: Settings },
    { href: "/app/billing", label: "Billing", icon: Wallet },
  ];
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 font-heading text-sm text-primary">
          {name.trim().charAt(0).toUpperCase() || "V"}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-heading text-sm text-foreground">{name}</span>
          <span className="text-[11px] text-muted-foreground">Business menu</span>
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-60">
        <MenuGroupLabel>{name}</MenuGroupLabel>
        {items.map((item) => (
          <MenuLinkItem key={item.href} render={<Link href={item.href} onClick={onNavigate} />}>
            <item.icon aria-hidden /> {item.label}
          </MenuLinkItem>
        ))}
        <MenuSeparator />
        <MenuItem disabled>
          <Building2 aria-hidden />
          <span className="grid">
            <span className="flex items-center gap-1.5">
              {name} <Check aria-hidden className="size-3.5 text-primary" />
            </span>
            <span className="text-xs text-muted-foreground">Switching businesses comes later</span>
          </span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/** Search sessions and reports by title. The results come from a slot so stories can feed their own. */
function SidebarSearch({ renderResults }: { renderResults: (text: string, close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = () => {
    setOpen(false);
    setText("");
  };
  return (
    <>
      <button type="button" className={cn(row, "w-full text-muted-foreground")} onClick={() => setOpen(true)}>
        <Search aria-hidden className="size-4 shrink-0" />
        <span>Search</span>
        <span className="ml-auto text-[11px]">Sessions, reports</span>
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogPopup className="p-4 sm:p-5">
          <DialogTitle className="mb-3 font-heading text-base">Search sessions and reports</DialogTitle>
          <SearchInput autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a title or a question you asked" />
          <div className="mt-3 max-h-[50dvh] min-h-16 overflow-y-auto">{renderResults(text, close)}</div>
        </DialogPopup>
      </Dialog>
    </>
  );
}

export function SearchResults({ text, hits, close }: { text: string; hits: SearchHit[] | undefined; close: () => void }) {
  if (text.trim().length < 2) return <p className="px-1 text-sm text-muted-foreground">Type at least two letters.</p>;
  if (hits === undefined) return <p className="px-1 text-sm text-muted-foreground">Searching.</p>;
  if (hits.length === 0) return <p className="px-1 text-sm text-muted-foreground">Nothing matches &ldquo;{text.trim()}&rdquo;.</p>;
  return (
    <ul className="grid gap-0.5">
      {hits.map((hit) => (
        <li key={`${hit.kind}:${hit.id}`}>
          <Link href={hit.href} onClick={close} className={row}>
            {hit.kind === "session" ? <BookOpen aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <FileSearch aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{hit.title}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hit.kind === "session" ? "Session" : "Report"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LiveSearchResults({ text, close }: { text: string; close: () => void }) {
  const shell = useWorkspaceShell();
  const trimmed = text.trim();
  const hits = useQuery(api.home.search, shell && trimmed.length >= 2 ? { workspaceId: shell.workspaceId, text: trimmed } : "skip");
  return <SearchResults text={text} hits={hits} close={close} />;
}

const ROWS_STORE = "vistrial.agentRows.v1";

function readRows(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(ROWS_STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")) : null;
  } catch {
    return null;
  }
}

function writeRows(open: Set<string>) {
  try {
    window.localStorage.setItem(ROWS_STORE, JSON.stringify([...open]));
  } catch {
    // Private windows and blocked storage: rows still open and close, they just are not remembered.
  }
}

export type SkillCounts = Record<string, { running: number; review: number }>;

/** A work tab's count: what is running first, otherwise what is waiting for review. */
function TabCount({ counts }: { counts: { running: number; review: number } | undefined }) {
  if (counts?.running) {
    return (
      <span aria-label={`${counts.running} running`} className="ml-auto shrink-0 rounded-full bg-primary/12 px-1.5 text-[11px] leading-5 font-medium text-primary tabular-nums">
        {counts.running} running
      </span>
    );
  }
  if (counts?.review) {
    return (
      <span aria-label={`${counts.review} to review`} className="ml-auto shrink-0 rounded-full bg-warning/15 px-1.5 text-[11px] leading-5 font-medium text-warning tabular-nums">
        {counts.review} to review
      </span>
    );
  }
  return null;
}

function AgentRow({
  agent,
  activity,
  skillCounts,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  agent: RailAgent;
  activity: AgentActivity | undefined;
  skillCounts: SkillCounts | undefined;
  pathname: string;
  open: boolean;
  onToggle: (slug: string) => void;
  onNavigate?: () => void;
}) {
  const live = agent.status === "live";
  const href = `/app/agents/${agent.slug}`;
  const active = isActive(pathname, href, true);
  const dot = agentDot(activity);
  const mark = AGENT_MARK[agent.slug] ?? { glyph: "spark" as const, accent: "neutral" as const };
  const tabs = agentTabs(agent);
  const expandable = tabs.length > 0;
  const groupId = `agent-tabs-${agent.slug}`;
  const inner = (
    <>
      <GlyphMark glyph={mark.glyph} accent={mark.accent} size="xs" working={dot === "working"} className={cn(!live && "opacity-50")} />
      <span className="truncate">{agent.name}</span>
      {live ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <Count value={activity?.waiting ?? 0} tone="warning" label={`${activity?.waiting ?? 0} waiting on you`} />
          <span role="img" aria-label={DOT[dot].label} title={DOT[dot].label} className={cn("size-2 rounded-full", DOT[dot].className)} />
        </span>
      ) : (
        <span className="ml-auto shrink-0 rounded-md border border-border px-1.5 text-[10px] leading-4 tracking-wide text-muted-foreground uppercase">Soon</span>
      )}
    </>
  );
  const shared = [
    { href: `/app/agents/${agent.slug}/memory`, label: "Memory" },
    { href: "/app/evidence", label: "Evidence" },
    { href: "/app/settings?section=data", label: "Connections" },
  ];
  return (
    <li className="grid gap-0.5">
      <div className={cn("flex min-w-0 items-center rounded-lg", active && "bg-accent")}>
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={groupId}
            aria-label={open ? `Close ${agent.name}` : `Open ${agent.name}`}
            onClick={() => onToggle(agent.slug)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        {/* The agent's name opens its home (the overview); the arrow beside it opens and closes its tabs. */}
        <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(row, "flex-1 pl-1", !live && "text-muted-foreground")}>
          {inner}
        </Link>
      </div>
      {expandable && open ? (
        <div id={groupId} className="ml-[11px] grid gap-0.5 border-l border-border pl-2">
          <ul className="grid gap-0.5" aria-label={`${agent.name} work`}>
            {tabs.map((tab) => {
              const tabActive = isActive(pathname, tab.href);
              return (
                <li key={tab.tab}>
                  <Link href={tab.href} onClick={onNavigate} aria-current={tabActive ? "page" : undefined} className={cn(row, "text-[13px]", tabActive && "bg-accent")}>
                    <span className="truncate">{tab.label}</span>
                    {tab.skillSlug ? <TabCount counts={skillCounts?.[tab.skillSlug]} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="flex flex-wrap items-center gap-x-1 px-2 pt-0.5 pb-1 text-[11px] text-muted-foreground">
            {shared.map((item, index) => (
              <span key={item.label} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden>·</span> : null}
                <Link href={item.href} onClick={onNavigate} className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  {item.label}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </li>
  );
}

const LIBRARY: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/app/research", label: "Sessions", icon: BookOpen },
  { href: "/app/evidence", label: "Evidence", icon: FileSearch },
  { href: "/app/agents/growth-architect/memory", label: "Memory", icon: Brain },
  { href: "/app/leads", label: "Customers", icon: Users },
];

/**
 * The sidebar: the business, what is waiting, a new session and search always at the top; agents grouped by
 * the customer journey; the library; and what Vistrial knows and the credit balance at the foot.
 */
export function JourneySidebarView({
  agents,
  data,
  pathname,
  onNavigate,
  renderSearch,
}: {
  agents: RailAgent[];
  data: SidebarData;
  pathname: string;
  onNavigate?: () => void;
  renderSearch?: (text: string, close: () => void) => React.ReactNode;
}) {
  const { overview, credits } = data;
  const liveSlugs = () => new Set(agents.filter((agent) => workTabsFor(agent).length > 0).map((agent) => agent.slug));
  const [openRows, setOpenRows] = useState<Set<string>>(() => (typeof window === "undefined" ? liveSlugs() : (readRows() ?? liveSlugs())));
  const toggleRow = (slug: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      writeRows(next);
      return next;
    });
  const [tab, setTab] = useState<JourneyTab>(() => (typeof window === "undefined" ? defaultTab(agents) : (readTab() ?? defaultTab(agents))));

  // Opening an agent's page shows its tab.
  useEffect(() => {
    const wanted = tabForPath(pathname, agents);
    if (!wanted) return;
    const timer = setTimeout(() => setTab((current) => (current === wanted ? current : wanted)), 0);
    return () => clearTimeout(timer);
  }, [pathname, agents]);

  const waiting = overview?.waiting.total ?? 0;
  const waitingLabel = overview && !overview.actionable ? "Waiting on the team" : "Waiting on you";
  const shown = agentsForTab(agents, tab);
  const offJourney = agentsOffJourney(agents);
  const knowledge = overview?.knowledge;

  return (
    <nav aria-label="Workspace" className="flex h-full min-h-0 flex-col">
      <div className="grid gap-1 px-3 pt-3">
        <BusinessHeader name={overview?.workspaceName ?? "Your business"} onNavigate={onNavigate} />
      </div>

      <ul className="grid gap-0.5 border-b border-border px-3 pt-2 pb-3" aria-label="Always here">
        <li>
          <Link href="/app" onClick={onNavigate} aria-current={pathname === "/app" ? "page" : undefined} className={cn(row, pathname === "/app" && "bg-accent")}>
            <Hourglass aria-hidden className={cn("size-4 shrink-0", waiting ? "text-warning" : "text-muted-foreground")} />
            <span className="truncate">{waitingLabel}</span>
            <Count value={waiting} tone="warning" label={`${waiting} waiting`} />
          </Link>
        </li>
        <li>
          <Link href={NEW_CHAT} onClick={onNavigate} className={cn(row, "text-primary")}>
            <Plus aria-hidden className="size-4 shrink-0" />
            <span>New chat</span>
          </Link>
        </li>
        <li>
          <SidebarSearch renderResults={renderSearch ?? ((text, close) => <LiveSearchResults text={text} close={close} />)} />
        </li>
      </ul>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="grid gap-2">
          <SegmentedRadioGroup
            aria-label="Customer journey"
            size="sm"
            className="w-full flex-nowrap"
            value={tab}
            onValueChange={(next) => {
              if (!isJourneyTab(next)) return;
              setTab(next);
              writeTab(next);
            }}
            options={JOURNEY_TABS}
          />
          <ul className="grid gap-1" aria-label={`${JOURNEY_TABS.find((row) => row.value === tab)?.label} agents`}>
            {shown.length ? (
              shown.map((agent) => (
                <AgentRow
                  key={agent.slug}
                  agent={agent}
                  activity={overview?.agents[agent.slug]}
                  skillCounts={overview?.skills}
                  pathname={pathname}
                  open={openRows.has(agent.slug)}
                  onToggle={toggleRow}
                  onNavigate={onNavigate}
                />
              ))
            ) : (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No agents here yet.</li>
            )}
          </ul>
        </div>

        <div className="mt-5 grid gap-1">
          <p className={heading}>Library</p>
          <ul className="grid gap-0.5">
            {LIBRARY.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(row, active && "bg-accent")}>
                    <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            {offJourney.map((agent) => (
              <li key={agent.slug}>
                <Link href={`/app/agents/${agent.slug}`} onClick={onNavigate} className={cn(row, "text-muted-foreground")}>
                  <Gauge aria-hidden className="size-4 shrink-0 opacity-60" />
                  <span className="truncate">{agent.name}</span>
                  <span className="ml-auto shrink-0 rounded-md border border-border px-1.5 text-[10px] leading-4 tracking-wide uppercase">Soon</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border px-3 py-3">
        <Link href={knowledge?.next?.href ?? "/app/agents/growth-architect/memory"} onClick={onNavigate} className="grid gap-1.5 rounded-lg px-2 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <Meter value={knowledge?.percent ?? 0} aria-label="What Vistrial knows" className="gap-1.5">
            <span className="flex items-center justify-between text-xs">
              <span className="text-foreground">Knowledge</span>
              <span className="text-muted-foreground tabular-nums">{knowledge ? `${knowledge.percent}%` : "…"}</span>
            </span>
            <MeterTrack className="h-1.5 rounded-full">
              <MeterIndicator className="rounded-full" />
            </MeterTrack>
          </Meter>
          <span className="truncate text-[11px] text-muted-foreground">{knowledge ? (knowledge.next ? `Next: ${knowledge.next.label}` : "Everything Vistrial asks for is in.") : " "}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/app/billing" onClick={onNavigate} className={cn(row, "min-w-0 flex-1")} aria-label="Credits balance, open Billing">
            <Coins aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate tabular-nums">{credits?.on && credits.balanceCents !== null ? money(credits.balanceCents) : "Billing"}</span>
            {credits?.on ? <span className="text-[11px] text-muted-foreground">credits</span> : null}
          </Link>
          <Link href="/app/settings" onClick={onNavigate} aria-label="Settings" className={cn(row, "size-8 justify-center px-0")}>
            <Settings aria-hidden className="size-4 text-muted-foreground" />
          </Link>
          <Link href="/app" onClick={onNavigate} aria-label={`Notifications: ${waiting} waiting`} className={cn(row, "relative size-8 justify-center px-0")}>
            <Bell aria-hidden className="size-4 text-muted-foreground" />
            {waiting ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 font-medium text-background tabular-nums">
                {waiting > 99 ? "99+" : waiting}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** The sidebar fed by Convex. Before a workspace loads it shows the agents with nothing counted. */
export function JourneySidebar({ agents, pathname, onNavigate }: { agents: RailAgent[]; pathname: string; onNavigate?: () => void }) {
  const shell = useWorkspaceShell();
  if (!shell) return <JourneySidebarView agents={agents} data={{ overview: undefined, credits: undefined }} pathname={pathname} onNavigate={onNavigate} />;
  return <LiveJourneySidebar agents={agents} pathname={pathname} onNavigate={onNavigate} workspaceId={shell.workspaceId} />;
}

function LiveJourneySidebar({
  workspaceId,
  ...props
}: {
  agents: RailAgent[];
  pathname: string;
  onNavigate?: () => void;
  workspaceId: NonNullable<ReturnType<typeof useWorkspaceShell>>["workspaceId"];
}) {
  const overview = useQuery(api.home.overview, { workspaceId });
  const credits = useQuery(api.billing.status, { workspaceId });
  return <JourneySidebarView {...props} data={{ overview, credits: credits ? { on: credits.on, balanceCents: credits.balanceCents } : undefined }} />;
}
