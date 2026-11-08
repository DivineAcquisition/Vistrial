"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  CircleHelp,
  FileText,
  FolderClosed,
  FolderOpen,
  Gauge,
  LayoutList,
  Loader,
  MessagesSquare,
  Plug,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MetaLogo } from "@/components/connections/meta-logo";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { agentStateLabel, railFromCatalog, type RailAgent, type RailDepartment } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const STORE = "vistrial.folders.v1";

function readOpen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(STORE);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeOpen(open: Set<string>) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify([...open]));
  } catch {
    // Private windows and blocked storage: folders still work, they just are not remembered.
  }
}

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const SESSION_STATE: Record<string, { icon: LucideIcon; className: string; label: string; spin?: boolean }> = {
  working: { icon: Loader, className: "text-primary", label: "Working", spin: true },
  waiting: { icon: CircleHelp, className: "text-warning", label: "Waiting for you" },
  review: { icon: CircleDot, className: "text-primary", label: "Ready to review" },
  done: { icon: CheckCircle2, className: "text-success", label: "Done" },
  stopped: { icon: Square, className: "text-muted-foreground", label: "Stopped" },
  draft: { icon: CircleDot, className: "text-muted-foreground", label: "Not started" },
};

const CONNECTION_DOT: Record<string, string> = {
  on: "bg-success",
  attention: "bg-warning",
  notGranted: "bg-muted-foreground/40",
  off: "bg-muted-foreground/30",
};

const row = "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent";

function Count({ value, tone = "neutral" }: { value: number; tone?: "neutral" | "brand" | "warning" }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 text-[11px] leading-5 tabular-nums",
        tone === "brand" && "bg-primary/15 text-primary",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

function Branch({
  id,
  open,
  onToggle,
  icon: Icon,
  label,
  href,
  pathname,
  trailing,
  children,
  onNavigate,
}: {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  icon: LucideIcon;
  label: string;
  href: string;
  pathname: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, href, Boolean(children));
  return (
    <li role="treeitem" aria-expanded={children ? open : undefined} aria-selected={active}>
      <div className={cn("group flex min-w-0 items-center rounded-lg", active && "bg-accent")}>
        {children ? (
          <button
            type="button"
            aria-label={open ? `Close ${label}` : `Open ${label}`}
            onClick={() => onToggle(id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(row, "flex-1 pl-1")}>
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          {trailing}
        </Link>
      </div>
      {children && open ? (
        <ul role="group" className="ml-[11px] grid gap-0.5 border-l border-border pl-2">
          {children}
        </ul>
      ) : null}
    </li>
  );
}

function Leaf({ href, pathname, children, onNavigate, title }: { href: string; pathname: string; children: React.ReactNode; onNavigate?: () => void; title?: string }) {
  const active = isActive(pathname, href, true);
  return (
    <li role="treeitem" aria-selected={active}>
      <Link href={href} onClick={onNavigate} title={title} aria-current={active ? "page" : undefined} className={cn(row, "text-[13px]", active && "bg-accent")}>
        {children}
      </Link>
    </li>
  );
}

export type FolderData = FunctionReturnType<typeof api.agentFolder.tree>;

type FolderProps = {
  agent: RailAgent;
  pathname: string;
  open: Set<string>;
  onToggle: (id: string) => void;
  onNavigate?: () => void;
};

/** A live agent's folder fed by Convex. */
function LiveAgentFolder({ workspaceId, ...props }: FolderProps & { workspaceId: Id<"workspaces"> }) {
  const data = useQuery(api.agentFolder.tree, { workspaceId, agentSlug: props.agent.slug });
  return <AgentFolder {...props} data={data} />;
}

/** One live agent's folder: sessions, connections, memory, reports and activity, with live counts. */
function AgentFolder({ agent, pathname, open, onToggle, onNavigate, data }: FolderProps & { data: FolderData | undefined }) {
  const base = `/app/agents/${agent.slug}`;
  const id = (part: string) => `${agent.slug}:${part}`;
  const state = agent.state ?? "off";
  const working = data?.sessions.some((row) => row.state === "working") ?? false;
  const waiting = data?.sessions.filter((row) => row.state === "waiting").length ?? 0;
  return (
    <Branch
      id={id("root")}
      open={open.has(id("root"))}
      onToggle={onToggle}
      icon={open.has(id("root")) ? FolderOpen : FolderClosed}
      label={agent.name}
      href={base}
      pathname={pathname}
      onNavigate={onNavigate}
      trailing={
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {working ? <Loader aria-label="Working" className="size-3.5 animate-spin text-primary motion-reduce:animate-none" /> : null}
          <span
            aria-label={agentStateLabel(agent)}
            title={agentStateLabel(agent)}
            className={cn("size-2 rounded-full", state === "on" ? "bg-success" : state === "suggesting" ? "bg-warning" : "bg-muted-foreground/40")}
          />
        </span>
      }
    >
      <Branch
        id={id("sessions")}
        open={open.has(id("sessions"))}
        onToggle={onToggle}
        icon={MessagesSquare}
        label="Sessions"
        href={`${base}/sessions`}
        pathname={pathname}
        onNavigate={onNavigate}
        trailing={<Count value={waiting || (data?.sessionCount ?? 0)} tone={waiting ? "warning" : "neutral"} />}
      >
        <Leaf href={`${base}/sessions/new`} pathname={pathname} onNavigate={onNavigate}>
          <Plus aria-hidden className="size-3.5 shrink-0 text-primary" />
          <span className="text-primary">New session</span>
        </Leaf>
        {(data?.sessions ?? []).map((session) => {
          const look = SESSION_STATE[session.state] ?? SESSION_STATE.draft;
          return (
            <Leaf key={session.id} href={`${base}/sessions/${session.id}`} pathname={pathname} onNavigate={onNavigate} title={`${session.title}: ${look.label}`}>
              <look.icon aria-label={look.label} className={cn("size-3.5 shrink-0", look.className, look.spin && "animate-spin motion-reduce:animate-none")} />
              <span className="truncate">{session.title}</span>
            </Leaf>
          );
        })}
        {data && data.sessionCount > data.sessions.length ? (
          <Leaf href={`${base}/sessions`} pathname={pathname} onNavigate={onNavigate}>
            <span className="pl-5 text-xs text-muted-foreground">All {data.sessionCount} sessions</span>
          </Leaf>
        ) : null}
      </Branch>
      <Branch
        id={id("connections")}
        open={open.has(id("connections"))}
        onToggle={onToggle}
        icon={Plug}
        label="Connections"
        href={`${base}/connections`}
        pathname={pathname}
        onNavigate={onNavigate}
        trailing={<Count value={data?.connections.filter((row) => row.state === "on").length ?? 0} />}
      >
        {(data?.connections ?? []).map((connection) => (
          <Leaf
            key={connection.key}
            href={connection.key === "meta" ? `${base}/connections/meta` : `${base}/connections#${connection.key}`}
            pathname={pathname}
            onNavigate={onNavigate}
            title={connection.detail ?? undefined}
          >
            {connection.key === "meta" ? <MetaLogo className="h-3 w-4 shrink-0" /> : <span aria-hidden className={cn("ml-1 size-2 shrink-0 rounded-full", CONNECTION_DOT[connection.state])} />}
            <span className="truncate">{connection.label}</span>
            {connection.key === "meta" ? <span aria-label={connection.state} className={cn("ml-auto size-2 shrink-0 rounded-full", CONNECTION_DOT[connection.state])} /> : null}
          </Leaf>
        ))}
      </Branch>
      <Branch id={id("memory")} open={false} onToggle={onToggle} icon={Brain} label="Memory" href={`${base}/memory`} pathname={pathname} onNavigate={onNavigate} trailing={<Count value={data?.counts.facts ?? 0} />} />
      <Branch
        id={id("reports")}
        open={false}
        onToggle={onToggle}
        icon={FileText}
        label="Reports"
        href={`${base}/reports`}
        pathname={pathname}
        onNavigate={onNavigate}
        trailing={<Count value={data?.counts.reportsWaiting || data?.counts.reports || 0} tone={data?.counts.reportsWaiting ? "brand" : "neutral"} />}
      />
      <Branch
        id={id("activity")}
        open={false}
        onToggle={onToggle}
        icon={Activity}
        label="Activity"
        href={`${base}/activity`}
        pathname={pathname}
        onNavigate={onNavigate}
        trailing={<Count value={data?.counts.runsOpen ?? 0} tone="brand" />}
      />
    </Branch>
  );
}

const ACROSS = [
  { href: "/app", label: "Decisions", icon: LayoutList, exact: true },
  { href: "/app/research", label: "All research", icon: BookOpen },
  { href: "/app/runs", label: "All activity", icon: Gauge },
  { href: "/app/assets", label: "All assets", icon: FileText },
];

const WORKSPACE = [
  { href: "/app/connections", label: "Connections", icon: Plug },
  { href: "/app/profile", label: "Profile", icon: Sparkles },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/controls", label: "Controls", icon: ShieldCheck },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/**
 * The workspace as folders: each live agent is a folder holding its sessions, connections, memory, reports
 * and activity. Planned agents show greyed. Opened folders are remembered in this browser only.
 */
export function FolderTree({
  departments,
  agents,
  pathname,
  onNavigate,
  fixtures,
}: {
  departments: RailDepartment[];
  agents: RailAgent[];
  pathname: string;
  onNavigate?: () => void;
  /** Story pages pass folder data by agent slug instead of reading Convex. */
  fixtures?: Record<string, FolderData>;
}) {
  const shell = useWorkspaceShell();
  const rail = railFromCatalog(agents, departments);
  const defaults = () => new Set(agents.filter((agent) => agent.status === "live").flatMap((agent) => [`${agent.slug}:root`, `${agent.slug}:sessions`]));
  const [open, setOpen] = useState<Set<string>>(() => (typeof window === "undefined" ? defaults() : (readOpen() ?? defaults())));

  // Opening a page inside a folder opens that folder.
  useEffect(() => {
    const match = pathname.match(/^\/app\/agents\/([^/]+)(?:\/([^/]+))?/);
    if (!match) return;
    const wanted = [`${match[1]}:root`, ...(match[2] ? [`${match[1]}:${match[2]}`] : [])];
    const timer = setTimeout(() => {
      setOpen((current) => {
        if (wanted.every((key) => current.has(key))) return current;
        const next = new Set(current);
        for (const key of wanted) next.add(key);
        writeOpen(next);
        return next;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeOpen(next);
      return next;
    });

  const flat = (items: typeof ACROSS) => (
    <ul className="grid gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href, "exact" in item && Boolean(item.exact));
        return (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(row, active && "bg-accent")}>
              <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="grid gap-5" aria-label="Workspace folders">
      {rail.departments.map((group) => (
        <div key={group.department} className="grid gap-1.5">
          <p className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.label}</p>
          <ul role="tree" aria-label={group.label} className="grid gap-0.5">
            {group.agents.map((agent) =>
              agent.status === "live" && fixtures ? (
                <AgentFolder key={agent.slug} agent={agent} data={fixtures[agent.slug]} pathname={pathname} open={open} onToggle={toggle} onNavigate={onNavigate} />
              ) : agent.status === "live" && shell ? (
                <LiveAgentFolder key={agent.slug} agent={agent} workspaceId={shell.workspaceId} pathname={pathname} open={open} onToggle={toggle} onNavigate={onNavigate} />
              ) : (
                <li key={agent.slug} role="treeitem" aria-selected={isActive(pathname, `/app/agents/${agent.slug}`)}>
                  <Link
                    href={`/app/agents/${agent.slug}`}
                    onClick={onNavigate}
                    className={cn(row, "pl-8 text-muted-foreground", isActive(pathname, `/app/agents/${agent.slug}`) && "bg-accent")}
                  >
                    <FolderClosed aria-hidden className="size-4 shrink-0 opacity-60" />
                    <span className="truncate">{agent.name}</span>
                    <span className="ml-auto shrink-0 text-[11px]">{agent.status === "planned" ? "Planned" : agentStateLabel(agent)}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      <div className="grid gap-1.5 border-t border-border pt-4">
        <p className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Across agents</p>
        {flat(ACROSS)}
      </div>
      <div className="grid gap-1.5">
        <p className="px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Workspace</p>
        {flat(WORKSPACE)}
      </div>
    </nav>
  );
}
