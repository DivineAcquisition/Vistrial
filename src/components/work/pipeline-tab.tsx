"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Activity, Check, CheckCircle2, CircleDot, Clock, Hourglass, Kanban, MoonIcon, Settings2, SunIcon, Target, TrendingUp, Users, XCircle, type LucideIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle, WorkHero } from "./work-shell";

export type BoardData = Extract<FunctionReturnType<typeof api.pipelineBoard.board>, { connected: true }>;
export type TeamData = FunctionReturnType<typeof api.dealmakerTeam.team>;
type Card = BoardData["stages"][number]["cards"][number];
type Health = Card["health"];

/** Colour is never alone: every health has an icon and its word. */
const HEALTH_STYLE: Record<Health, { icon: LucideIcon; edge: string; badge: "success" | "warning" | "outline" | "info" | "error" }> = {
  active: { icon: Activity, edge: "border-l-success", badge: "success" },
  cooling: { icon: Hourglass, edge: "border-l-warning", badge: "warning" },
  quiet: { icon: MoonIcon, edge: "border-l-muted-foreground", badge: "outline" },
  won: { icon: CheckCircle2, edge: "border-l-info", badge: "info" },
  lost: { icon: XCircle, edge: "border-l-destructive", badge: "error" },
};
const TEMP_ICON = { hot: SunIcon, warm: CircleDot, cold: MoonIcon } as const;

export type PipelineActions = {
  completeCommitment: (id: string) => Promise<unknown>;
  setRole: (memberId: string, salesRole: "setter" | "closer" | "lead" | null, crmUserRef?: string) => Promise<unknown>;
  setAutonomy: (kind: string, automatic: boolean) => Promise<unknown>;
};

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    showError(error);
  }
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function DealCard({ card, board, editor, actions }: { card: Card; board: BoardData; editor: boolean; actions: PipelineActions }) {
  const style = HEALTH_STYLE[card.health];
  const Icon = style.icon;
  const Temp = TEMP_ICON[card.temperature];
  const closed = card.health === "won" || card.health === "lost";
  return (
    <li className={cn("grid gap-2 rounded-lg border border-l-4 border-border bg-card p-3", style.edge)} data-deal={card.ref}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={style.badge} size="sm">
          <Icon aria-hidden className="size-3" />
          {board.words.health[card.health]}
        </Badge>
        <span className="text-sm font-medium text-foreground tabular-nums">{money(card.value, board.crm.currency)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{card.healthWhy}</p>
      {closed ? null : (
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-foreground" title={board.words.temperatureBasis}>
          <Temp aria-hidden className="size-3.5" />
          {board.words.temperature[card.temperature]}
          <span className="text-muted-foreground">· {card.temperatureWhy}</span>
        </span>
      </p>
      )}
      {closed ? null : <p className="text-xs font-medium text-foreground">{card.paused ? "Paused: the lead asked us to stop" : board.words.ball[card.ball]}</p>}
      {card.established.length ? (
        <ul className="grid gap-0.5 text-xs">
          {card.established.map((row) => (
            <li key={row.field} className="text-foreground">
              <span className="font-medium">{row.label}:</span> {row.value} <span className="text-muted-foreground">({row.kind}{row.author ? `, ${row.author}` : ""})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.unresolved.length && !closed ? <p className="text-xs text-muted-foreground">Unresolved: {card.unresolved.map((row) => row.label).join(", ")}</p> : null}
      {card.commitments.map((row) => (
        <div key={row.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
          <span className="text-foreground">
            {row.text}
            {row.due ? <span className="text-muted-foreground"> · due {new Date(row.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
          </span>
          {editor ? (
            <Button size="icon-sm" variant="ghost" aria-label={`Mark done: ${row.text}`} onClick={() => void run(() => actions.completeCommitment(row.id))}>
              <Check aria-hidden className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
      {card.move ? <p className="border-t border-border pt-2 text-xs font-medium text-foreground">Next: {card.move.words}</p> : null}
    </li>
  );
}

function TeamPanel({ team, actions }: { team: TeamData; actions: PipelineActions }) {
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-pipeline-team>
      <SectionTitle icon={Settings2}>Team and what Dealmaker may send on its own</SectionTitle>
      <div className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sales roles</h3>
        <ul className="grid gap-2">
          {team.members.map((member) => (
            <li key={member.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <span className="text-sm text-foreground">{member.name}</span>
              <Select
                aria-label={`${member.name}'s sales role`}
                disabled={!team.canSetTeam}
                value={member.salesRole ?? ""}
                onChange={(event) => void run(() => actions.setRole(member.id, (event.target.value || null) as "setter" | null, member.crmUserRef ?? undefined))}
                options={[{ value: "", label: "No sales role" }, ...team.roles.map((role) => ({ value: role.id, label: role.name }))]}
              />
              <Select
                aria-label={`${member.name}'s CRM user`}
                disabled={!team.canSetTeam || !member.salesRole}
                value={member.crmUserRef ?? ""}
                onChange={(event) => void run(() => actions.setRole(member.id, member.salesRole, event.target.value || undefined))}
                options={[{ value: "", label: "Not linked to a CRM user" }, ...team.crmUsers.map((user) => ({ value: user.ref, label: `${user.ref} (${user.deals} deals)` }))]}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sent without asking</h3>
        <p className="text-xs text-muted-foreground">Only the Owner can turn these on, and only for low-stakes messages. A price, a first message, a lead who said stop, and won or lost always wait for a person.</p>
        <ul className="grid gap-1.5">
          {team.kinds.map((kind) => (
            <li key={kind.id} className="flex items-center justify-between gap-3 text-sm">
              <span className={cn(kind.canBeAutomatic ? "text-foreground" : "text-muted-foreground")}>{kind.label}</span>
              {kind.canBeAutomatic ? (
                <Switch aria-label={`Send ${kind.label.toLowerCase()} without asking`} checked={kind.automatic} disabled={!team.canSetAutonomy} onCheckedChange={(checked) => void run(() => actions.setAutonomy(kind.id, checked))} />
              ) : (
                <span className="text-xs text-muted-foreground">Always waits</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/** The Pipeline with its data handed in, so a story can show it without a server. */
export function PipelineView({ board, team, editor, actions }: { board: BoardData; team: TeamData | null; editor: boolean; actions: PipelineActions }) {
  const [view, setView] = useState<"board" | "moves">("board");
  const canEdit = editor && board.canEdit;
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero icon={Kanban} agent="sales-conversion" eyebrow="Dealmaker · Pipeline" title="Every deal, and what it needs next" promise={`${board.scopeWhy} Worked out from your ${board.crm.label} on every visit; quiet after ${board.quietDays} days.`} />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Deals by health">
        {(Object.keys(HEALTH_STYLE) as Health[]).map((health) => {
          const Icon = HEALTH_STYLE[health].icon;
          return (
            <li key={health} className={cn("flex items-center gap-2 rounded-lg border border-l-4 border-border bg-card px-3 py-2", HEALTH_STYLE[health].edge)}>
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              <span className="text-sm text-foreground">{board.words.health[health]}</span>
              <span className="ml-auto font-heading text-lg text-foreground tabular-nums">{board.counts[health]}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2" role="group" aria-label="Show">
        <Button size="sm" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
          By stage
        </Button>
        <Button size="sm" variant={view === "moves" ? "default" : "outline"} onClick={() => setView("moves")}>
          Today&apos;s moves ({board.moves.length})
        </Button>
      </div>
      {view === "moves" ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={Target}>Today&apos;s moves</SectionTitle>
          {board.moves.length ? (
            <ol className="grid gap-2">
              {board.moves.map((move, index) => (
                <li key={move.ref} className="flex gap-3 rounded-lg border border-border p-3 text-sm">
                  <span className="font-heading text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="text-foreground">{move.words}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Deal {move.ref}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing needs a move right now.</p>
          )}
        </Panel>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:overflow-x-auto lg:pb-2" aria-label="Deals by stage">
          {board.stages.map((stage) => (
            <section key={stage.ref} className="grid min-w-0 content-start gap-2 lg:w-72 lg:shrink-0" aria-label={stage.name}>
              <h3 className="flex items-center justify-between text-sm font-medium text-foreground">
                {stage.name}
                <span className="text-xs text-muted-foreground tabular-nums">{stage.cards.length}</span>
              </h3>
              {stage.cards.length ? (
                <ul className="grid gap-2">
                  {stage.cards.map((card) => (
                    <DealCard key={card.ref} card={card} board={board} editor={canEdit} actions={actions} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No deals here.</p>
              )}
            </section>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={TrendingUp}>Forecast</SectionTitle>
          <p className="font-heading text-xl text-foreground">{board.forecast.range}</p>
          <p className="text-sm text-muted-foreground">{board.forecast.basis}</p>
        </Panel>
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={Clock}>Where deals come from</SectionTitle>
          <ul className="grid gap-1.5 text-sm">
            {board.sources.map((row) => (
              <li key={row.source} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
                <span className="text-foreground">{row.source}</span>
                <span className="text-xs text-muted-foreground">
                  {row.deals} deals · {row.won} won · {row.lost} lost · win rate {row.winRate}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {board.perRep ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={Users}>By person</SectionTitle>
          <p className="text-xs text-muted-foreground">For coaching, with their deals beside the figures. A gap in the records is not proof no work was done.</p>
          <ul className="grid gap-1.5 text-sm">
            {board.perRep.map((row) => (
              <li key={row.ownerRef} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
                <span className="text-foreground">{row.ownerRef === "unassigned" ? "Not assigned" : row.ownerRef}</span>
                <span className="text-xs text-muted-foreground">
                  {row.deals} deals · {row.active} active · {row.cooling} cooling · {row.quiet} quiet · {row.won} won · {row.lost} lost
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {team ? <TeamPanel team={team} actions={actions} /> : null}
    </div>
  );
}

/** Dealmaker's Pipeline for the organization or the client the picker names. */
export function PipelineTab({ workspaceId, editor }: { workspaceId: Id<"workspaces">; editor: boolean }) {
  const { clientId } = useClientScope();
  const board = useQuery(api.pipelineBoard.board, { workspaceId, clientId });
  const team = useQuery(api.dealmakerTeam.team, { workspaceId, clientId });
  const completeCommitment = useMutation(api.pipelineBoard.completeCommitment);
  const setRole = useMutation(api.dealmakerTeam.setRole);
  const setAutonomy = useMutation(api.dealmakerTeam.setAutonomy);
  if (board === undefined) return <p className="text-sm text-muted-foreground">Reading your pipeline…</p>;
  if (!board.connected) {
    return (
      <Panel className="grid gap-2 p-4 sm:p-6">
        <SectionTitle icon={Kanban}>Dealmaker · Pipeline</SectionTitle>
        <p className="text-sm text-muted-foreground">Connect your CRM in Connections and Dealmaker will show every deal here, worked out from your own records.</p>
      </Panel>
    );
  }
  const actions: PipelineActions = {
    completeCommitment: (id) => completeCommitment({ workspaceId, commitmentId: id as Id<"dealCommitments"> }),
    setRole: (memberId, salesRole, crmUserRef) => setRole({ workspaceId, clientId, memberId: memberId as Id<"members">, salesRole, crmUserRef }),
    setAutonomy: (kind, automatic) => setAutonomy({ workspaceId, clientId, kind, automatic }),
  };
  return <PipelineView board={board} team={team ?? null} editor={editor} actions={actions} />;
}
