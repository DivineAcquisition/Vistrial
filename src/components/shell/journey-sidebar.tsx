"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Bell,
  BookOpen,
  ChevronRight,
  Coins,
  FileSearch,
  Home,
  Kanban,
  MessagesSquare,
  Newspaper,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "@/components/icons";
import { LiveChatList } from "@/components/chat/chat-library";
import { AgentAvatar } from "@/components/live/agent-avatar";
import { ClientPicker } from "@/components/shell/client-picker";
import { OrganizationSwitcher } from "@/components/shell/organization-switcher";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/input";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import {
  JOURNEY_TABS,
  MAIN_ITEMS,
  MEMORY_HREF,
  agentDot,
  agentsForTab,
  agentTabs,
  agentsOffJourney,
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
import { creditCount } from "@/lib/credits";

const TAB_STORE = "vistrial.journeyTab.v1";

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
  const tabs = agentTabs(agent);
  const expandable = tabs.length > 0;
  const groupId = `agent-tabs-${agent.slug}`;
  const inner = (
    <>
      <AgentAvatar slug={agent.slug} size="xs" working={dot === "working"} className={cn(!live && "opacity-60 grayscale")} />
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

/** Library holds what work produced. Chats (every chat session started) sits above these, with a dropdown of the newest. Memory is in Settings. */
const LIBRARY: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/app/research", label: "Sessions", icon: BookOpen },
  { href: "/app/evidence", label: "Evidence", icon: FileSearch },
  { href: "/app/leads", label: "Customers", icon: Users },
];

const MAIN_ICON: Record<(typeof MAIN_ITEMS)[number]["key"], LucideIcon> = { home: Home, tasks: Kanban, briefing: Newspaper };

/**
 * The sidebar, top to bottom: which organization and which client; the customer journey tabs; Home, Tasks
 * and Briefing; the agents of the chosen tab; the library; and what Vistrial knows and the credit balance
 * at the foot.
 */
export function JourneySidebarView({
  agents,
  data,
  pathname,
  onNavigate,
  renderSearch,
  scope,
  chatList,
}: {
  agents: RailAgent[];
  data: SidebarData;
  pathname: string;
  onNavigate?: () => void;
  /** What sits at the very top: which organization is open (and, under it, which client). Stories pass their own. */
  scope?: React.ReactNode;
  renderSearch?: (text: string, close: () => void) => React.ReactNode;
  /** The newest chats, shown when Library > Chats is opened. Rendered only then, so a closed list reads nothing. */
  chatList?: React.ReactNode;
}) {
  const { overview, credits } = data;
  const [chatsOpen, setChatsOpen] = useState(false);
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
        {scope ?? (
          <>
            <OrganizationSwitcher name={overview?.workspaceName ?? "Your business"} onNavigate={onNavigate} />
            <ClientPicker organizationName={overview?.workspaceName ?? "Your business"} onNavigate={onNavigate} />
          </>
        )}
      </div>

      <div className="px-3 pt-2">
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
      </div>

      <ul className="grid gap-0.5 border-b border-border px-3 pt-2 pb-3" aria-label="Main">
        {MAIN_ITEMS.map((item) => {
          const Icon = MAIN_ICON[item.key];
          const active = isActive(pathname, item.href, item.key === "home");
          const count = item.key === "home" ? waiting : item.key === "tasks" ? (overview?.nav.tasks ?? 0) : (overview?.nav.briefing ?? 0);
          const label = item.key === "home" ? `${count} ${waitingLabel.toLowerCase()}` : item.key === "tasks" ? `${count} proposed` : `${count} new`;
          return (
            <li key={item.key}>
              <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(row, active && "bg-accent")}>
                <Icon aria-hidden className={cn("size-4 shrink-0", item.key === "home" && waiting ? "text-warning" : "text-muted-foreground")} />
                <span className="truncate">{item.label}</span>
                <Count value={count} tone={item.key === "home" ? "warning" : "neutral"} label={label} />
              </Link>
            </li>
          );
        })}
        <li>
          <SidebarSearch renderResults={renderSearch ?? ((text, close) => <LiveSearchResults text={text} close={close} />)} />
        </li>
      </ul>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4">
        <div className="grid gap-1">
          <p className={heading}>{JOURNEY_TABS.find((row) => row.value === tab)?.label} agents</p>
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
            <li>
              <div className={cn("flex items-center gap-1 rounded-lg", isActive(pathname, "/app/chats") && "bg-accent")}>
                <Link href="/app/chats" onClick={onNavigate} aria-current={isActive(pathname, "/app/chats") ? "page" : undefined} className={cn(row, "min-w-0 flex-1")}>
                  <MessagesSquare aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">Chats</span>
                </Link>
                <button
                  type="button"
                  aria-expanded={chatsOpen}
                  aria-controls="sidebar-chats"
                  aria-label={chatsOpen ? "Hide recent chats" : "Show recent chats"}
                  onClick={() => {
                    setChatsOpen((open) => !open);
                    // The list opens at the foot of the sidebar: bring it into view.
                    requestAnimationFrame(() => document.getElementById("sidebar-chats")?.scrollIntoView({ block: "nearest" }));
                  }}
                  className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-overlay/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", chatsOpen && "rotate-90")} />
                </button>
              </div>
              {chatsOpen ? (
                <div id="sidebar-chats" className="mt-0.5 ml-4 border-l border-border pl-2">
                  {chatList ?? <LiveChatList onNavigate={onNavigate} />}
                </div>
              ) : null}
            </li>
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
                  <AgentAvatar slug={agent.slug} size="xs" className="opacity-60 grayscale" />
                  <span className="truncate">{agent.name}</span>
                  <span className="ml-auto shrink-0 rounded-md border border-border px-1.5 text-[10px] leading-4 tracking-wide uppercase">Soon</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border px-3 py-3">
        <Link href={knowledge?.next?.href ?? MEMORY_HREF} onClick={onNavigate} className="grid gap-1.5 rounded-lg px-2 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
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
            <span className="truncate tabular-nums">{credits?.on && credits.balanceCents !== null ? creditCount(credits.balanceCents) : "Billing"}</span>
            {credits?.on ? <span className="text-[11px] text-muted-foreground">credits</span> : null}
          </Link>
          <Link href="/app/settings" onClick={onNavigate} aria-label="Settings" className={cn(row, "size-8 justify-center px-0")}>
            <Settings aria-hidden className="size-4 text-muted-foreground" />
          </Link>
          <Link href="/app/briefing" onClick={onNavigate} aria-label={`Briefing: ${overview?.nav.briefing ?? 0} new`} className={cn(row, "relative size-8 justify-center px-0")}>
            <Bell aria-hidden className="size-4 text-muted-foreground" />
            {overview?.nav.briefing ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 font-medium text-background tabular-nums">
                {overview.nav.briefing > 99 ? "99+" : overview.nav.briefing}
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
