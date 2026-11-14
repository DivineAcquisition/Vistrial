"use client";

import {
  ArrowRight,
  BarChart3,
  CalendarIcon,
  Check,
  CircleDollarSign,
  Clock,
  Eye,
  Kanban,
  Lock,
  MessagesSquare,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  Unplug,
  Users,
  X,
} from "@/components/icons";
import Link from "next/link";
import { useState } from "react";

import { SyncActivity, type StepWords, type SyncRun } from "@/components/connections/meta-effort";
import { ToolMark } from "@/components/connectors/tool-mark";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { Summary } from "../../../convex/lib/highLevel";

type Tone = "good" | "warning" | "neutral";

/** What `highLevel.status` returns. No token is ever in it. */
export type HighLevelStatus = {
  configured: boolean;
  canConnect: boolean;
  canRefresh: boolean;
  isOwner: boolean;
  connection: {
    status: string;
    accountId: string;
    accountName: string;
    currency: string;
    connectedAt: number;
    scopes: string[];
    lastSyncAt: number | null;
    lastSyncCode: string | null;
    running: boolean;
    /** An Owner let Vistrial act here, each change approved by a person. */
    acting?: boolean;
    calls: { ok: number; failed: number; successRate: number | null };
  } | null;
  summary: (Summary & { syncedAt: number }) | null;
  runs: SyncRun[];
  usage: { days: { day: string; ok: number; failed: number }[]; ok: number; failed: number; successRate: number | null } | null;
};

export type HighLevelActions = {
  connect: () => Promise<void>;
  sync: () => Promise<{ code: string }>;
  disconnect: () => Promise<void>;
};

/** What a short code from the server means for the person. */
export const HL_CODE_WORDS: Record<string, string> = {
  token_rejected: "HighLevel no longer accepts this connection. Reconnect to keep reading.",
  permission_missing: "HighLevel refused a read this sub-account needs. Reconnect and allow every permission.",
  rate_limited: "HighLevel asked Vistrial to slow down. It reads again on its next schedule.",
  connection_failed: "HighLevel could not be reached. Try again in a minute.",
  provider_down: "HighLevel is having trouble. Vistrial tries again on its next schedule.",
  bad_request: "HighLevel did not accept a read. Try again; if it repeats, tell us.",
  not_found: "HighLevel could not find this sub-account. Reconnect it.",
  provider_error: "HighLevel returned an error. Try again in a minute.",
  token_failed: "HighLevel did not renew access. Try again in a minute.",
  busy: "A read is already running.",
  not_connected: "This connection was removed.",
  not_configured: "HighLevel is not set up on this deployment yet.",
};

export const HL_RETURN_WORDS: Record<string, { text: string; tone: Tone }> = {
  connected: { text: "Connected. Vistrial is reading the sub-account now.", tone: "good" },
  cancelled: { text: "The HighLevel install was cancelled. Nothing was connected.", tone: "neutral" },
  expired: { text: "That install link expired. Start again.", tone: "warning" },
  failed: { text: "HighLevel did not finish the connection. Start again.", tone: "warning" },
  missing_permission: { text: "Vistrial needs every read permission it asked for. Start again and allow them all.", tone: "warning" },
  agency_install: { text: "That was the agency, not a sub-account. Start again and choose this business's sub-account.", tone: "warning" },
  already_connected: { text: "That sub-account is already connected to another client. Disconnect it there first.", tone: "warning" },
  not_configured: { text: "HighLevel is not set up on this deployment yet.", tone: "warning" },
};

export const HL_STEP_WORDS: StepWords = {
  access: { icon: ShieldCheck, doing: "Checking access to the sub-account", done: "Checked access to the sub-account", unit: "sub-account" },
  pipelines: { icon: Kanban, doing: "Reading pipelines and stages", done: "Read pipelines and stages", unit: "pipelines" },
  deals: { icon: CircleDollarSign, doing: "Reading deals", done: "Read deals", unit: "deals" },
  contacts: { icon: Users, doing: "Reading recent leads", done: "Read recent leads", unit: "leads" },
  activity: { icon: MessagesSquare, doing: "Reading calls and messages (facts only)", done: "Read calls and messages (facts only)", unit: "activities" },
  appointments: { icon: CalendarIcon, doing: "Reading appointments", done: "Read appointments", unit: "appointments" },
  save: { icon: Save, doing: "Saving for this organization", done: "Saved for this organization", unit: "rows" },
};

const HL_RUN_CODES: Record<string, string> = {
  ok: "Done",
  token_rejected: "Access refused",
  permission_missing: "No access",
  rate_limited: "Slowed by HighLevel",
  connection_failed: "Unreachable",
  provider_down: "HighLevel down",
  interrupted: "Interrupted",
  provider_error: "HighLevel error",
  bad_request: "Refused",
  not_connected: "Removed",
};

const CAN = [
  "Read pipelines, stages and how deals move",
  "Read won deals and their value",
  "Read where leads come from",
  "Read leads' names, emails and phone numbers",
  "Note calls, texts, emails and appointments: when, which way, and the outcome",
  "With approval: move deals, tag leads, add notes and create tasks",
];
const CANNOT = [
  "Change anything unless an Owner turns acting on, and then only what a person approves",
  "Delete anything",
  "Message, call or email your leads, or book appointments",
  "Keep what a message said, recordings or notes",
];

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function when(time: number) {
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Mark() {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
      <ToolMark id="gohighlevel" size={28} />
    </span>
  );
}

function CanCannot() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid content-start gap-2 rounded-xl border border-border bg-background/60 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <Eye aria-hidden className="size-4 text-success" /> Vistrial can
        </p>
        <ul className="grid gap-1.5">
          {CAN.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-muted-foreground">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid content-start gap-2 rounded-xl border border-border bg-background/60 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <Lock aria-hidden className="size-4 text-muted-foreground" /> Vistrial cannot
        </p>
        <ul className="grid gap-1.5">
          {CANNOT.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-muted-foreground">
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Eye; label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-xl border border-border bg-background/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p className="font-heading text-xl text-card-foreground tabular-nums">{value}</p>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Open deals per stage, as bars, for each pipeline. */
function Pipelines({ summary }: { summary: Summary }) {
  if (summary.pipelines.length === 0) return <p className="text-sm text-muted-foreground">No pipelines in this sub-account.</p>;
  return (
    <div className="grid gap-4">
      {summary.pipelines.slice(0, 4).map((pipeline) => {
        const most = Math.max(1, ...pipeline.stages.map((stage) => stage.open));
        return (
          <div key={pipeline.id} className="grid gap-2">
            <p className="text-sm font-medium text-card-foreground">{pipeline.name}</p>
            <ul className="grid gap-1.5" aria-label={`${pipeline.name} stages`}>
              {pipeline.stages.map((stage) => (
                <li key={stage.id} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
                  <span className="truncate text-muted-foreground">{stage.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(stage.open / most) * 100}%` }} />
                  </span>
                  <span className="text-right text-card-foreground tabular-nums">
                    {stage.open}
                    {stage.value > 0 ? <span className="text-muted-foreground"> · {money(stage.value, summary.currency)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Sources({ summary }: { summary: Summary }) {
  if (summary.sources.length === 0) return <p className="text-sm text-muted-foreground">No new leads or won deals in the last 90 days.</p>;
  return (
    <ul className="grid gap-1.5">
      {summary.sources.map((row) => (
        <li key={row.source} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-card-foreground">{row.source}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {row.leads} {row.leads === 1 ? "lead" : "leads"} · {row.won} won{row.value > 0 ? ` · ${money(row.value, summary.currency)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Calls per day over the last 15 days, for the Owner. */
function CallDays({ usage }: { usage: NonNullable<HighLevelStatus["usage"]> }) {
  const most = Math.max(1, ...usage.days.map((day) => day.ok + day.failed));
  return (
    <Panel className="grid gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-base text-card-foreground">HighLevel calls</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {usage.ok} ok · {usage.failed} failed · 15 days
        </p>
      </div>
      <div className="flex h-16 items-end gap-1" role="img" aria-label={`${usage.ok} successful and ${usage.failed} failed calls in the last 15 days`}>
        {usage.days.map((day) => (
          <span key={day.day} className="flex h-full flex-1 flex-col justify-end" title={`${day.day}: ${day.ok} ok, ${day.failed} failed`}>
            <span className="block rounded-t-sm bg-destructive/60" style={{ height: `${(day.failed / most) * 100}%` }} />
            <span className={cn("block bg-primary/60", day.failed === 0 && "rounded-t-sm")} style={{ height: `${(day.ok / most) * 100}%`, minHeight: day.ok > 0 ? 2 : 0 }} />
          </span>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
        Changes Vistrial made are listed under Acting in HighLevel, each with who approved it.
      </p>
    </Panel>
  );
}

/**
 * The HighLevel card for one client (or the organization). `compact` is the onboarding version: the state,
 * the button, and three numbers once connected.
 */
export function HighLevelView({
  status,
  actions,
  returned,
  forName,
  compact = false,
  manageHref,
}: {
  status: HighLevelStatus;
  actions: HighLevelActions;
  returned?: string | null;
  /** The client's name, or null for the organization itself. */
  forName?: string | null;
  compact?: boolean;
  manageHref?: string;
}) {
  const [working, setWorking] = useState<null | "connect" | "sync">(null);
  const [notice, setNotice] = useState<{ text: string; tone: Tone } | null>(returned ? (HL_RETURN_WORDS[returned] ?? null) : null);
  const connection = status.connection;
  const summary = status.summary;
  const needsReconnect = connection?.status === "needsReconnect";
  const running = Boolean(connection?.running) || working === "sync";
  const who = forName ?? "this organization";

  const connect = async () => {
    setWorking("connect");
    try {
      await actions.connect();
    } catch {
      setNotice({ text: "Could not open HighLevel. Try again.", tone: "warning" });
      setWorking(null);
    }
  };
  const sync = async () => {
    setWorking("sync");
    const result = await actions.sync().catch(() => ({ code: "provider_error" }));
    setWorking(null);
    setNotice(result.code === "ok" ? null : { text: HL_CODE_WORDS[result.code] ?? HL_CODE_WORDS.provider_error, tone: "warning" });
  };

  const badge = !connection
    ? { label: "Not connected", tone: "neutral" as const }
    : needsReconnect
      ? { label: "Reconnect needed", tone: "warning" as const }
      : running
        ? { label: "Reading", tone: "brand" as const }
        : { label: "Connected", tone: "good" as const };

  const connectButton = (label: string) =>
    status.canConnect && status.configured ? (
      <Button variant="gradient" className="w-fit" onClick={() => void connect()} loading={working === "connect"}>
        <Plug aria-hidden className="size-4" /> {label}
      </Button>
    ) : null;

  const lastProblem = connection?.lastSyncCode && connection.lastSyncCode !== "ok" && !needsReconnect ? HL_CODE_WORDS[connection.lastSyncCode] ?? HL_CODE_WORDS.provider_error : null;

  return (
    <Panel className={cn("grid gap-5", compact ? "p-4" : "p-4 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Mark />
          <div className="min-w-0">
            <h2 className="font-heading text-lg text-card-foreground">HighLevel</h2>
            <p className="text-sm text-muted-foreground">
              {compact && connection ? connection.accountName : "Pipelines, deals and lead activity"}
              {connection?.acting ? ", changes only with approval" : ", read-only"}
              {forName ? ` · for ${forName}` : ""}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="size-3.5" /> {connection?.acting ? "Acts with approval" : "Read-only"}
          </span>
          <StatusBadge label={badge.label} tone={badge.tone} className="[&_span]:normal-case" />
        </div>
      </div>

      {notice ? <Banner compact tone={notice.tone} title={notice.text} /> : null}
      {!status.configured && !connection ? <Banner compact tone="warning" title={HL_CODE_WORDS.not_configured} /> : null}

      {needsReconnect ? (
        <div className="grid gap-2">
          <Banner compact tone="warning" title={HL_CODE_WORDS.token_rejected} />
          {connectButton("Reconnect HighLevel") ?? <p className="text-sm text-muted-foreground">An Owner can reconnect it. Until then nothing new is read.</p>}
        </div>
      ) : null}

      {!connection ? (
        <div className="grid gap-4">
          {compact ? null : <CanCannot />}
          {status.configured ? (
            status.canConnect ? (
              <div className="flex flex-wrap items-center gap-3">
                {connectButton("Connect HighLevel")}
                <span className="text-xs text-muted-foreground">On HighLevel&apos;s page, choose the sub-account for {who}. Vistrial never sees your password.</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">An Owner connects HighLevel for {who}.</p>
            )
          ) : null}
          {compact ? <p className="text-xs text-muted-foreground">Vistrial reads first. It changes your CRM only if an Owner allows it and a person approves each change, and it never messages your leads.</p> : null}
        </div>
      ) : null}

      {connection ? (
        <div className="grid gap-5">
          {!compact ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-card-foreground">{connection.accountName}</p>
                <p className="text-xs text-muted-foreground">
                  Sub-account {connection.accountId}
                  {connection.lastSyncAt ? ` · Read ${when(connection.lastSyncAt)}` : " · Not read yet"} · Reads again every 6 hours
                </p>
              </div>
              {status.canRefresh && !needsReconnect ? (
                <Button variant="outline" size="sm" onClick={() => void sync()} loading={running}>
                  <RefreshCw aria-hidden className="size-3.5" /> Read again
                </Button>
              ) : null}
            </div>
          ) : null}
          {lastProblem ? <Banner compact tone="warning" title={lastProblem} /> : null}

          {summary ? (
            <div className={cn("grid min-w-0 gap-5", !compact && status.isOwner && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
              <div className="grid min-w-0 content-start gap-5">
                <div className={cn("grid grid-cols-2 gap-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-3 xl:grid-cols-3")}>
                  <Kpi icon={Kanban} label="Open pipeline" value={money(summary.open.value, summary.currency)} hint={`${summary.open.count} open ${summary.open.count === 1 ? "deal" : "deals"}`} />
                  <Kpi icon={CircleDollarSign} label="Won, 90 days" value={money(summary.won.d90.value, summary.currency)} hint={`${summary.won.d90.count} won${summary.winRate90 !== null ? ` · ${Math.round(summary.winRate90 * 100)}% of closed` : ""}`} />
                  <Kpi icon={Users} label="New leads, 30 days" value={String(summary.leads30)} hint={summary.sources[0] ? `Most from ${summary.sources[0].source}` : undefined} />
                  {!compact ? (
                    <>
                      <Kpi icon={TrendingUp} label="Won, 30 days" value={money(summary.won.d30.value, summary.currency)} hint={`${summary.won.d30.count} won · ${summary.won.d365.count} in a year`} />
                      <Kpi icon={MessagesSquare} label="Activity, 30 days" value={String(summary.activity30.calls + summary.activity30.messages)} hint={`${summary.activity30.calls} calls · ${summary.activity30.messages} messages`} />
                      <Kpi icon={CalendarIcon} label="Appointments" value={String(summary.activity30.appointments)} hint={`last 30 days · ${summary.upcoming} booked ahead`} />
                    </>
                  ) : null}
                </div>
                {!compact ? (
                  <>
                    <section className="grid gap-2" aria-label="Pipelines">
                      <h3 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                        <BarChart3 aria-hidden className="size-4 text-muted-foreground" /> Open deals by stage
                      </h3>
                      <Pipelines summary={summary} />
                      <p className="text-xs text-muted-foreground">
                        {summary.activity30.stageChanges} stage {summary.activity30.stageChanges === 1 ? "move" : "moves"} seen in the last 30 days.
                      </p>
                    </section>
                    <section className="grid gap-2" aria-label="Lead sources">
                      <h3 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                        <Target aria-hidden className="size-4 text-muted-foreground" /> Where leads come from, 90 days
                      </h3>
                      <Sources summary={summary} />
                    </section>
                    <p className="text-xs text-muted-foreground">
                      Kept: {summary.counts.deals} deals, {summary.counts.contacts} leads (name, email, phone, source) and {summary.counts.activities} activity facts. Message text, recordings and notes are never kept.
                    </p>
                  </>
                ) : null}
              </div>
              {!compact && status.isOwner ? (
                <aside className="grid min-w-0 content-start gap-4" aria-label="What Vistrial did">
                  <SyncActivity runs={status.runs} stepWords={HL_STEP_WORDS} codeWords={HL_RUN_CODES} emptyText="Each read of this sub-account shows here, step by step." />
                  {status.usage ? <CallDays usage={status.usage} /> : null}
                </aside>
              ) : null}
            </div>
          ) : !needsReconnect ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{running || !lastProblem ? "Reading the sub-account. This takes under a minute." : "Nothing has been read yet."}</p>
              {!compact && status.isOwner ? <SyncActivity runs={status.runs} stepWords={HL_STEP_WORDS} codeWords={HL_RUN_CODES} /> : null}
            </div>
          ) : null}

          {compact ? (
            manageHref ? (
              <Link href={manageHref} className="flex w-fit items-center gap-1 text-sm text-primary">
                See everything Vistrial read <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            ) : null
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock aria-hidden className="size-3.5" />
                Connected {new Date(connection.connectedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Disconnecting deletes everything Vistrial read.
              </p>
              {status.canConnect ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive-outline" size="sm">
                      <Unplug aria-hidden className="size-3.5" /> Disconnect
                    </Button>
                  }
                  title="Disconnect HighLevel?"
                  description="Vistrial deletes its access and everything it read: pipelines, deals, leads and activity. Nothing changes in HighLevel. To end its access there too, uninstall the Vistrial app in HighLevel."
                  confirmLabel="Disconnect"
                  onConfirm={actions.disconnect}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

