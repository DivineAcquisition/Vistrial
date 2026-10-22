"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, WifiOffIcon } from "lucide-react";

import { setAgentPausedAction } from "@/app/(workspace)/app/agents/actions";
import { runAgentNowAction, setAgentHiddenAction } from "@/app/(workspace)/app/agents/roster-actions";
import { useOrg } from "@/components/app/org-provider";
import { useAgentSummary } from "@/components/agents/summary-context";
import { formatClock, GlyphMark, PresenceDot } from "@/components/live/agent-identity";
import { useLiveMeta } from "@/components/live/live-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { agentContract } from "@/lib/agents/contract";
import { rowLabel, type AgentSummary, type AgentSummaryRow, type AreaSummary, type SummaryPresence } from "@/lib/agents/summary";
import type { WorkspaceRole } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

/** Rows per area before "Show all" (decision 8). */
export const ROWS_PER_AREA = 8;

const AGENT_PAGE_ROLES: WorkspaceRole[] = ["owner", "service_team", "platform_admin"];

const TONE: Record<SummaryPresence, string> = {
  idle: "text-muted-foreground",
  working: "text-brand-300",
  waiting: "text-warning",
  attention: "text-warning",
  paused: "text-muted-foreground",
  stopped: "text-destructive",
};

function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** A row that changed shows a brief, quiet highlight. Calm mode and reduced motion skip it. */
function useChanged(key: string): boolean {
  const { calm } = useLiveMeta();
  const [seen, setSeen] = useState(key);
  const [changed, setChanged] = useState(false);
  if (seen !== key) {
    setSeen(key);
    if (!calm) setChanged(true);
  }
  useEffect(() => {
    if (!changed) return;
    const timer = setTimeout(() => setChanged(false), 1500);
    return () => clearTimeout(timer);
  }, [changed, key]);
  return changed;
}

function collapsedKey(orgId: string, areaId: string): string {
  return `vistrial:area-collapsed:${orgId}:${areaId}`;
}

const collapseListeners = new Set<() => void>();

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Collapsed areas are remembered per person on this device. Remembering is a convenience only. */
function useAreaCollapsed(orgId: string, areaId: string): [boolean, (next: boolean) => void] {
  const key = collapsedKey(orgId, areaId);
  const collapsed = useSyncExternalStore(
    (listener) => {
      collapseListeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        collapseListeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    () => readCollapsed(key),
    () => false
  );
  return [
    collapsed,
    (next) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // The area still opens and closes; it just is not remembered.
      }
      for (const listener of collapseListeners) listener();
    },
  ];
}

function StateLine({ row }: { row: AgentSummaryRow }) {
  const presence = row.presence ?? "idle";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", row.state === "on" ? TONE[presence] : "text-warning")}>
      {row.state === "on" ? <PresenceDot state={presence} /> : null}
      <span className="truncate">{row.stateLabel}</span>
    </span>
  );
}

/** "Show its work": up to three of the agent's latest outputs, as safe summary lines. */
function ShowItsWork({ row, onNavigate }: { row: AgentSummaryRow; onNavigate?: () => void }) {
  const { workspaceRole } = useOrg();
  const lines = row.outputs.slice(0, 3);
  return (
    <div className="space-y-1">
      {lines.length ? (
        <ul className="space-y-1">
          {lines.map((line) => (
            <li key={line.id} className="text-xs text-muted-foreground">
              {line.href ? (
                <Link href={line.href} onClick={onNavigate} className="hover:text-card-foreground hover:underline">
                  {line.text}
                </Link>
              ) : (
                line.text
              )}
              <span className="text-muted-foreground/70">, {formatClock(line.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing yet today.</p>
      )}
      {AGENT_PAGE_ROLES.includes(workspaceRole) ? (
        <Link href={`/app/agents/${row.id}`} onClick={onNavigate} className="text-xs font-medium text-brand-300 hover:underline">
          See all
        </Link>
      ) : null}
    </div>
  );
}

export function PauseAction({ row }: { row: AgentSummaryRow }) {
  const { isStaff } = useOrg();
  const { refresh } = useAgentSummary();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const text = agentContract(row.id).pause(row.name);
  if (row.paused?.byVistrial) {
    return <p className="text-xs text-muted-foreground">Paused by the Vistrial team. They will resume it.</p>;
  }
  const paused = Boolean(row.paused);
  return (
    <>
      <ConfirmDialog
        trigger={
          <Button size="xs" variant="outline">
            {paused ? "Resume" : "Pause"}
          </Button>
        }
        title={paused ? `Resume ${row.name}?` : `Pause ${row.name}?`}
        description={paused ? text.resume : text.stops}
        confirmLabel={paused ? "Resume" : "Pause"}
        confirmVariant={paused ? "default" : "destructive"}
        onConfirm={async () => {
          setError(null);
          const result = await setAgentPausedAction(row.id, !paused, reason.trim() || undefined);
          if (!result.ok) setError(result.error);
          refresh();
        }}
      >
        {paused ? null : (
          <div className="space-y-3 pb-2 text-sm text-muted-foreground">
            <p>{text.continues}</p>
            <p>{text.resume}</p>
            {isStaff ? (
              <label className="block space-y-1">
                <span className="text-xs text-card-foreground">Why you are pausing it. The Owner sees this.</span>
                <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} />
              </label>
            ) : null}
          </div>
        )}
      </ConfirmDialog>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}

function RunNowAction({ row }: { row: AgentSummaryRow }) {
  const run = agentContract(row.id).quickActions.runNow;
  const { refresh } = useAgentSummary();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!run || row.state !== "on" || row.paused) return null;
  return (
    <div className="space-y-1">
      <Button
        size="xs"
        variant="outline"
        loading={pending}
        loadingLabel="Starting"
        title={run.description}
        onClick={() =>
          start(async () => {
            const result = await runAgentNowAction(row.id);
            setNote(result.ok ? { ok: true, text: result.data.message } : { ok: false, text: result.error });
            refresh();
          })
        }
      >
        {run.label}
      </Button>
      <p className="text-xs text-muted-foreground">{run.description}</p>
      {note ? (
        <p role={note.ok ? "status" : "alert"} className={cn("text-xs", note.ok ? "text-success" : "text-warning")}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function HideAction({ row }: { row: AgentSummaryRow }) {
  const { refresh } = useAgentSummary();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      loading={pending}
      title="Only you stop seeing this row. The agent keeps working. Show it again from your account menu."
      onClick={() =>
        start(async () => {
          await setAgentHiddenAction(row.id, true);
          refresh();
        })
      }
    >
      Hide from my sidebar
    </Button>
  );
}

function QuickActions({ row, onNavigate }: { row: AgentSummaryRow; onNavigate?: () => void }) {
  const { workspaceRole } = useOrg();
  const contract = agentContract(row.id);
  const canPause = contract.quickActions.pause.includes(workspaceRole);
  const page = contract.pages(row.id).find((item) => item.kind === "agent" && item.roles.includes(workspaceRole));
  if (!canPause && !page) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {canPause && row.state === "on" ? <PauseAction row={row} /> : null}
      {canPause ? <RunNowAction row={row} /> : null}
      {page ? (
        <Button size="xs" variant="ghost" render={<Link href={page.href} onClick={onNavigate} />}>
          Open page
        </Button>
      ) : null}
      {workspaceRole === "owner" ? <HideAction row={row} /> : null}
    </div>
  );
}

/** One live row: glyph and name, state with a label, one live line, a count, and an expand chevron. */
export function AgentRow({ row, onNavigate, readOnly = false }: { row: AgentSummaryRow; onNavigate?: () => void; readOnly?: boolean }) {
  const { workspaceRole } = useOrg();
  const [open, setOpen] = useState(false);
  const changed = useChanged(`${row.state}:${row.presence}:${row.line}:${row.waiting.total}`);
  const canOpenPage = AGENT_PAGE_ROLES.includes(workspaceRole);
  const href =
    row.state === "needs_setup" && row.setupStep
      ? row.setupStep.href
      : row.state === "pending"
        ? `/app/agents/library#${row.id}`
        : canOpenPage
          ? `/app/agents/${row.id}`
          : null;
  const attention = row.presence === "attention" || row.presence === "stopped";

  return (
    <li
      className={cn(
        "rounded-lg transition-colors duration-700 motion-reduce:transition-none",
        changed && "bg-brand-500/10",
        attention && "ring-1 ring-warning/30"
      )}
    >
      <div className="flex min-w-0 items-start gap-2 px-2 py-1.5" aria-label={rowLabel(row)}>
        <GlyphMark glyph={row.glyph} accent={row.accent} size="sm" working={row.presence === "working"} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {href ? (
              <Link href={href} onClick={onNavigate} className="truncate text-sm font-medium text-sidebar-accent-foreground hover:underline">
                {row.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-sidebar-accent-foreground">{row.name}</span>
            )}
            {row.waiting.total > 0 ? (
              <Badge size="sm" variant="secondary" className="ml-auto shrink-0" aria-hidden>
                {countLabel(row.waiting.total)}
              </Badge>
            ) : null}
          </div>
          <StateLine row={row} />
          <p className="truncate text-xs text-muted-foreground" title={row.line}>
            {row.line}
          </p>
        </div>
        {row.state === "on" ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Hide ${row.name}'s work` : `Show ${row.name}'s work`}
            onClick={() => setOpen((value) => !value)}
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {open ? <ChevronDownIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 px-2 pb-2 pl-10">
          <ShowItsWork row={row} onNavigate={onNavigate} />
          {readOnly ? null : <QuickActions row={row} onNavigate={onNavigate} />}
        </div>
      ) : null}
    </li>
  );
}

function AreaSection({
  area,
  rows,
  orgId,
  onNavigate,
  readOnly,
}: {
  area: AreaSummary;
  rows: AgentSummaryRow[];
  orgId: string;
  onNavigate?: () => void;
  readOnly: boolean;
}) {
  const [collapsed, setCollapsed] = useAreaCollapsed(orgId, area.id);
  const shown = rows.slice(0, ROWS_PER_AREA);
  const urgentLabel = area.urgent && area.urgent !== "idle" ? area.urgent : null;
  return (
    <section aria-label={`${area.name}${area.waiting ? `, ${area.waiting} waiting on you` : ""}`} className="space-y-0.5">
      <div className="flex min-w-0 items-center gap-1 px-2 pt-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${area.name}` : `Collapse ${area.name}`}
          onClick={() => setCollapsed(!collapsed)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRightIcon className="size-3.5" aria-hidden /> : <ChevronDownIcon className="size-3.5" aria-hidden />}
        </button>
        {area.homePage ? (
          <Link href={area.homePage} onClick={onNavigate} className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-card-foreground">
            {area.name}
          </Link>
        ) : (
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{area.name}</span>
        )}
        {urgentLabel ? (
          <span className={cn("inline-flex items-center gap-1 text-xs", TONE[urgentLabel])}>
            <PresenceDot state={urgentLabel} />
            <span className="sr-only">{urgentLabel}</span>
          </span>
        ) : null}
        {area.waiting > 0 ? (
          <Badge size="sm" variant="secondary" className="ml-auto shrink-0">
            {countLabel(area.waiting)}
          </Badge>
        ) : null}
      </div>
      {collapsed ? null : (
        <>
          {area.workPage ? (
            <Link
              href={area.workPage.href}
              onClick={onNavigate}
              className="ml-8 flex min-h-8 items-center rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {area.workPage.label}
            </Link>
          ) : null}
          <ul className="space-y-0.5">
            {shown.map((row) => (
              <AgentRow key={row.id} row={row} onNavigate={onNavigate} readOnly={readOnly} />
            ))}
          </ul>
          {rows.length > ROWS_PER_AREA && area.homePage ? (
            <Link href={area.homePage} onClick={onNavigate} className="ml-10 text-xs font-medium text-brand-300 hover:underline">
              Show all
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" className="space-y-2 px-2 py-2">
      <span className="sr-only">Loading your agents.</span>
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rows the person sees: in the sidebar, not hidden by them. */
export function visibleRows(summary: AgentSummary): AgentSummaryRow[] {
  return summary.agents.filter((row) => row.inSidebar && !row.hidden);
}

/** Agents the workspace can still turn on or ask about, for the "Add agents" count. */
export function addableCount(summary: AgentSummary): number {
  return summary.agents.filter((row) => row.state === "available" || row.state === "locked" || row.availability === "beta" && row.state === "not_available").length;
}

/** The Operator view: only agents with something about their own leads, slim, no controls. */
function OperatorRoster({ summary, onNavigate }: { summary: AgentSummary; onNavigate?: () => void }) {
  const rows = visibleRows(summary).filter((row) => row.waiting.total > 0 || row.outputs.length > 0);
  if (!rows.length) return <p className="px-2 py-1 text-xs text-muted-foreground">Nothing about your leads right now.</p>;
  return (
    <ul className="space-y-0.5">
      {rows.map((row) => {
        const first = row.outputs.find((line) => line.href);
        const count = row.waiting.total;
        return (
          <li key={row.id}>
            <Link
              href={first?.href ?? "/app/today"}
              onClick={onNavigate}
              aria-label={`${row.name}${count ? `, ${count} for you` : ""}: ${first?.text ?? row.line}`}
              className="flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-sidebar-accent"
            >
              <GlyphMark glyph={row.glyph} accent={row.accent} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-sidebar-accent-foreground">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{first?.text ?? row.line}</span>
              </span>
              {count > 0 ? (
                <Badge size="sm" variant="secondary" className="shrink-0">
                  {countLabel(count)}
                </Badge>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The quiet note when live delivery or the copy is behind. Rows never pretend to be live. */
export function ReconnectingNote() {
  const { reconnecting } = useAgentSummary();
  if (!reconnecting) return null;
  return (
    <p role="status" className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
      <WifiOffIcon className="size-3.5" aria-hidden />
      Reconnecting. Showing the last saved state.
    </p>
  );
}

/** The roster: Compass above the areas, then each area with its work page and agent rows. */
export function AgentRoster({ onNavigate }: { onNavigate?: () => void }) {
  const { summary } = useAgentSummary();
  const { workspaceRole, org } = useOrg();
  if (!summary || summary.orgId !== org.id) return <SkeletonRows />;
  if (workspaceRole === "operator") return <OperatorRoster summary={summary} onNavigate={onNavigate} />;

  const readOnly = workspaceRole === "member";
  const rows = visibleRows(summary);
  const across = rows.filter((row) => row.area === null);
  const areas = summary.areas.filter((area) => area.inSidebar);

  return (
    <div className="space-y-1">
      {across.length ? (
        <ul className="space-y-0.5">
          {across.map((row) => (
            <AgentRow key={row.id} row={row} onNavigate={onNavigate} readOnly={readOnly} />
          ))}
        </ul>
      ) : null}
      {areas.map((area) => (
        <AreaSection
          key={area.id}
          area={area}
          rows={rows.filter((row) => row.area === area.id)}
          orgId={summary.orgId}
          onNavigate={onNavigate}
          readOnly={readOnly}
        />
      ))}
      {!across.length && !areas.length ? <p className="px-2 py-1 text-xs text-muted-foreground">No agents are on yet.</p> : null}
    </div>
  );
}

/** Sidebar footer: Add agents, with a dot when something new can be turned on. */
export function AddAgentsLink({ onNavigate }: { onNavigate?: () => void }) {
  const { summary } = useAgentSummary();
  const { workspaceRole } = useOrg();
  if (workspaceRole === "operator" || !summary) return null;
  const count = addableCount(summary);
  const member = workspaceRole === "member";
  return (
    <Link
      href="/app/agents/library"
      onClick={onNavigate}
      className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
    >
      <PlusIcon className="size-4" aria-hidden />
      <span className="truncate">{member ? "Agents in this workspace" : "Add agents"}</span>
      {!member && count > 0 ? (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-brand-400" />
          {count}
          <span className="sr-only"> to turn on or ask about</span>
        </span>
      ) : null}
    </Link>
  );
}

/** The icon rail: each agent as its glyph with a state marker and count; a flyout holds the row. */
export function AgentRail() {
  const { summary } = useAgentSummary();
  const { workspaceRole, org } = useOrg();
  if (!summary || summary.orgId !== org.id) return null;
  const rows = visibleRows(summary);
  const shown = workspaceRole === "operator" ? rows.filter((row) => row.waiting.total > 0 || row.outputs.length > 0) : rows;
  return (
    <ul className="flex flex-col items-center gap-1 py-1">
      {shown.map((row, index) => {
        const newArea = index > 0 && row.area !== shown[index - 1].area;
        return (
          <li key={row.id} className={cn(newArea && "mt-1 border-t border-sidebar-border pt-1")}>
            <Popover>
              <PopoverTrigger
                aria-label={rowLabel(row)}
                className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <GlyphMark glyph={row.glyph} accent={row.accent} size="sm" working={row.presence === "working"} />
                {row.presence && row.presence !== "idle" ? (
                  <span className="absolute bottom-1 right-1">
                    <PresenceDot state={row.presence} />
                  </span>
                ) : null}
                {row.waiting.total > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-ink-950">
                    {countLabel(row.waiting.total)}
                  </span>
                ) : null}
              </PopoverTrigger>
              <PopoverPopup side="right" align="start" className="w-72">
                <ul>
                  <AgentRow row={row} readOnly={workspaceRole === "member" || workspaceRole === "operator"} />
                </ul>
              </PopoverPopup>
            </Popover>
          </li>
        );
      })}
    </ul>
  );
}
