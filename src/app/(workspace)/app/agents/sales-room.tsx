"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { lockApprovalAction, saveApprovalAction } from "@/app/(workspace)/app/settings/approvals/actions";
import { ConnectionNotice } from "@/components/live/agent-panel";
import { AgentGlyph, formatAgo } from "@/components/live/agent-identity";
import { AgentRequestCard } from "@/components/live/request-card";
import { useLiveMeta, useLiveState, usePresence } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OnboardCard } from "@/components/ui/onboard-card";
import { GlowCard, glowColorForAccent } from "@/components/ui/spotlight-card";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { AGENTS, SALES_ROOM_IDS, agentCredit, type LiveAgentId } from "@/lib/agents/roster";
import {
  APPROVAL_MODE_LABELS,
  APPROVAL_MODES,
  actionType,
  type ApprovalMode,
} from "@/lib/home/catalog";
import { departmentFeed, type LiveRun } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: "Messages to leads", ids: ["first_reply", "quiet_lead_follow_up", "no_show_rebook", "send_text", "send_email"] },
  { label: "Your systems", ids: ["crm_stage_change", "drive_store", "create_asset", "client_report"] },
  { label: "Your team", ids: ["slack_post", "discord_post", "setter_nudge", "owner_escalation"] },
];

const AGENTS_FOR: Record<string, LiveAgentId[]> = {
  first_reply: ["relay"],
  quiet_lead_follow_up: ["relay"],
  no_show_rebook: ["relay"],
  send_text: ["relay"],
  send_email: ["relay"],
  setter_nudge: ["sentry"],
};

export type AutomationRow = {
  id: string;
  label: string;
  description: string;
  mode: ApprovalMode;
  reachesPeople: boolean;
  locked: boolean;
  lockReason: string | null;
};

function participants(id: string): string {
  const agents = AGENTS_FOR[id] ?? [];
  if (!agents.length) return "A person does this.";
  return agents.map((agentId) => agentCredit(agentId)).join(", ");
}

function TeamCard({
  agentId,
  selected,
  compact,
  onSelect,
}: {
  agentId: LiveAgentId;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  const presence = usePresence().find((item) => item.agentId === agentId);
  const agent = AGENTS[agentId];
  const line = presence?.liveLabel ?? presence?.runSummary ?? "Nothing to do right now.";
  return (
    <GlowCard
      customSize
      glowColor={glowColorForAccent(agent.accentKey)}
      borderWidth={2}
      edge={selected ? "primary" : "default"}
      className={cn("h-full p-0", compact ? "w-56 shrink-0" : "w-full")}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={agent.description}
        className="flex h-full min-w-0 w-full items-start gap-3 p-3 text-left focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentGlyph agentId={agentId} size="md" working={presence?.state === "working"} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-card-foreground">{agent.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{agent.sublabel}</span>
          <span className="mt-1 block text-xs font-medium text-card-foreground">{presence?.stateLabel ?? "Idle"}</span>
          {compact ? null : <span className="mt-0.5 block truncate text-xs text-muted-foreground">{line}</span>}
        </span>
      </button>
    </GlowCard>
  );
}

function RunLine({ run }: { run: LiveRun }) {
  const viewer = useRunViewer();
  const href = run.subjectHref ?? (run.leadId ? `/app/cases/${run.leadId}` : null);
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-card-foreground">{agentCredit(run.agentId)}</p>
      <p className="text-sm text-card-foreground">{run.subjectLabel}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {href ? (
          <Link href={href} className="underline-offset-2 hover:underline">
            Open the lead
          </Link>
        ) : null}
        <span>{formatAgo(run.lastProgressAt)}</span>
        <button type="button" className="font-medium text-brand-300 hover:underline" onClick={() => viewer.open(run.id)}>
          Why?
        </button>
      </p>
    </div>
  );
}

function ActivityFeed({ filter }: { filter: LiveAgentId | null }) {
  const state = useLiveState();
  const [shown, setShown] = useState(PAGE_SIZE);
  const items = useMemo(() => {
    const feed = departmentFeed([...state.runs.values()]);
    if (!filter) return feed;
    return feed.filter((item) => (item.kind === "single" ? item.run.agentId === filter : item.from.agentId === filter || item.to.agentId === filter));
  }, [state.runs, filter]);
  const page = items.slice(0, shown);
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing from that agent in this feed.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {page.map((item) => (
          <li key={item.id} className="rounded-2xl border border-border p-3">
            {item.kind === "handoff" ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium text-muted-foreground">Handed on</p>
                <RunLine run={item.from} />
                <RunLine run={item.to} />
              </div>
            ) : (
              <RunLine run={item.run} />
            )}
          </li>
        ))}
      </ul>
      {shown < items.length ? (
        <Button type="button" variant="secondary" onClick={() => setShown((value) => value + PAGE_SIZE)}>
          Older
        </Button>
      ) : null}
    </div>
  );
}

function WaitingColumn({ expanded, onSeeAll }: { expanded: boolean; onSeeAll?: () => void }) {
  const waiting = useLiveState().waiting;
  const items = [...waiting.values()]
    .filter((item) => item.status === "pending" || item.status === "approved")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const visible = expanded ? items : items.slice(0, 5);
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>;
  return (
    <div className="flex flex-col gap-3">
      {visible.map((item) => (
        <AgentRequestCard key={item.id} item={item} compact />
      ))}
      {!expanded && items.length > 5 && onSeeAll ? (
        <Button type="button" variant="secondary" onClick={onSeeAll}>
          See all
        </Button>
      ) : null}
    </div>
  );
}

function Automations({
  rows,
  canEdit,
  canLock,
}: {
  rows: AutomationRow[];
  canEdit: boolean;
  canLock: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h3 className="font-heading text-base text-card-foreground">{group.label}</h3>
          <ul className="flex flex-col gap-3">
            {group.ids.map((id) => {
              const row = rows.find((item) => item.id === id);
              if (!row) return null;
              return <AutomationRowView key={id} row={row} canEdit={canEdit} canLock={canLock} />;
            })}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-base text-card-foreground">Always on while the agent is on</h3>
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-card-foreground">Scribe builds a case file after every call.</p>
          <p className="text-xs text-muted-foreground">On while {AGENTS.scribe.name} is on.</p>
          <Link href="/app/agents/scribe" className="text-xs font-medium text-brand-300 hover:underline">
            Pause {AGENTS.scribe.name}
          </Link>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-sm font-medium text-card-foreground">Sentry checks response times around the clock.</p>
          <p className="text-xs text-muted-foreground">On while {AGENTS.sentry.name} is on.</p>
          <Link href="/app/agents/sentry" className="text-xs font-medium text-brand-300 hover:underline">
            Pause {AGENTS.sentry.name}
          </Link>
        </Card>
      </section>
    </div>
  );
}

function AutomationRowView({ row, canEdit, canLock }: { row: AutomationRow; canEdit: boolean; canLock: boolean }) {
  const [mode, setMode] = useState(row.mode);
  const [locked, setLocked] = useState(row.locked);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const definition = actionType(row.id);
  const canChange = canEdit && (!locked || canLock);

  async function change(next: ApprovalMode, confirmed = false) {
    setPending(true);
    setError(null);
    const result = await saveApprovalAction({ actionType: row.id, mode: next, approver: "owners_and_managers", confirmed });
    setPending(false);
    if (!result.ok && result.needsConfirmation) {
      const again = await saveApprovalAction({ actionType: row.id, mode: next, approver: "owners_and_managers", confirmed: true });
      if (!again.ok) setError(again.error);
      else setMode(next);
      return;
    }
    if (!result.ok) setError(result.error);
    else setMode(next);
  }

  return (
    <Card className="gap-2 p-4">
      <p className="text-sm font-medium text-card-foreground">{row.label}</p>
      <p className="text-xs text-muted-foreground">{row.description}</p>
      <p className="text-xs text-muted-foreground">{participants(row.id)}</p>
      {locked ? <p className="text-xs text-muted-foreground">Locked by your Vistrial team{row.lockReason ? `: ${row.lockReason}` : ""}.</p> : null}
      {canChange ? (
        <SegmentedRadioGroup
          aria-label={`${row.label} level`}
          size="sm"
          value={mode}
          options={APPROVAL_MODES.map((value) => ({ value, label: APPROVAL_MODE_LABELS[value] }))}
          onValueChange={(value) => void change(value as ApprovalMode)}
        />
      ) : (
        <p className="text-sm text-card-foreground">{APPROVAL_MODE_LABELS[mode]}</p>
      )}
      {canLock ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            const reason = locked ? "" : window.prompt("Why is this locked?") ?? "";
            if (!locked && reason.trim().length < 3) return;
            setPending(true);
            void lockApprovalAction({ actionType: row.id, locked: !locked, reason }).then((result) => {
              setPending(false);
              if (!result.ok) setError(result.error);
              else setLocked(!locked);
            });
          }}
        >
          {locked ? "Unlock" : "Lock"}
        </Button>
      ) : null}
      {definition?.reachesPeople && mode === "auto_run" ? (
        <p className="text-xs text-muted-foreground">Sending still checks consent, quiet hours, and do-not-contact.</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </Card>
  );
}

export function SalesRoom({
  rows,
  crmConnected,
  canEdit,
  canLock,
  staff,
}: {
  rows: AutomationRow[];
  crmConnected: boolean;
  canEdit: boolean;
  canLock: boolean;
  staff: boolean;
}) {
  const [seeAll, setSeeAll] = useState(false);
  const [filter, setFilter] = useState<LiveAgentId | null>(null);
  const [phoneTab, setPhoneTab] = useState("activity");
  const [deskTab, setDeskTab] = useState("activity");
  const { workspaceStatus } = useLiveMeta();
  const presence = usePresence();
  const selected = filter ? AGENTS[filter] : null;
  const paused = workspaceStatus !== "active" || presence.some((item) => item.state === "paused");
  const runs = useLiveState().runs.size;

  const select = (agentId: LiveAgentId) => setFilter((current) => (current === agentId ? null : agentId));

  const empty = (
    <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
      <div className="flex min-w-0 flex-col items-start gap-3">
        <p className="text-sm text-card-foreground">Your team&apos;s work shows up here as it happens.</p>
        {crmConnected ? (
          <Button variant="primary" render={<Link href="/app/compass" />}>
            Ask Compass
          </Button>
        ) : (
          <Button variant="primary" render={<Link href="/app/settings/connections" />}>
            Connect your CRM
          </Button>
        )}
      </div>
      <OnboardCard step1="Standing by" step2="Watching new leads" step3="Drafts wait for you" />
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      {staff ? <p className="text-sm text-muted-foreground">You are working as the Vistrial team.</p> : null}
      <ConnectionNotice />
      {paused ? (
        <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground" role="status">
          {workspaceStatus !== "active"
            ? "This workspace is paused, so the team is not working."
            : "An agent is paused. A paused agent is not working."}
        </p>
      ) : null}

      <div className="hidden gap-3 md:grid md:grid-cols-5">
        {SALES_ROOM_IDS.map((agentId) => (
          <TeamCard key={agentId} agentId={agentId} selected={filter === agentId} onSelect={() => select(agentId)} />
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 md:hidden">
        {SALES_ROOM_IDS.map((agentId) => (
          <TeamCard key={agentId} agentId={agentId} compact selected={filter === agentId} onSelect={() => select(agentId)} />
        ))}
      </div>
      {selected ? <p className="text-sm text-muted-foreground md:hidden">{selected.description}</p> : null}

      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-6">
        <Tabs value={deskTab} onValueChange={setDeskTab}>
          <TabsList>
            <TabsTab value="activity">Activity</TabsTab>
            <TabsTab value="automations">Automations</TabsTab>
          </TabsList>
          <TabsPanel value="activity">{runs === 0 ? empty : <ActivityFeed filter={filter} />}</TabsPanel>
          <TabsPanel value="automations">
            <Automations rows={rows} canEdit={canEdit} canLock={canLock} />
          </TabsPanel>
        </Tabs>
        <section aria-labelledby="waiting-desktop" className="flex flex-col gap-3">
          <h2 id="waiting-desktop" className="font-heading text-base text-card-foreground">
            Waiting for you
          </h2>
          <WaitingColumn expanded={seeAll} onSeeAll={() => setSeeAll(true)} />
        </section>
      </div>

      <div className="md:hidden">
        <Tabs value={phoneTab} onValueChange={setPhoneTab}>
          <TabsList>
            <TabsTab value="activity">Activity</TabsTab>
            <TabsTab value="waiting">Waiting for you</TabsTab>
            <TabsTab value="automations">Automations</TabsTab>
          </TabsList>
          <TabsPanel value="activity">{runs === 0 ? empty : <ActivityFeed filter={filter} />}</TabsPanel>
          <TabsPanel value="waiting">
            <WaitingColumn expanded />
          </TabsPanel>
          <TabsPanel value="automations">
            <Automations rows={rows} canEdit={canEdit} canLock={canLock} />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  );
}
