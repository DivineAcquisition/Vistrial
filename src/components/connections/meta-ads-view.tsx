"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Eye,
  Lock,
  MousePointerClick,
  Plug,
  RefreshCw,
  ShieldCheck,
  Target,
  Unplug,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { ApiUsage, Observations, SyncActivity, type Observation, type SyncRun, type Usage } from "@/components/connections/meta-effort";
import { MetaLogo } from "@/components/connections/meta-logo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SegmentedControl } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type Tone = "good" | "warning" | "critical" | "neutral";

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  resultLabel: string | null;
  results: number | null;
  costPerResult: number | null;
};

export type MetaStatus = {
  configured: boolean;
  canManage: boolean;
  connection: {
    source: string;
    status: string;
    metaUserName: string;
    connectedAt: number;
    tokenExpiresAt: number | null;
    scopes: string[];
    adAccountId: string | null;
    adAccountName: string | null;
    currency: string | null;
    range: string;
    lastSyncAt: number | null;
    lastSyncCode: string | null;
    calls: { ok: number; failed: number; successRate: number | null };
  } | null;
  snapshot: {
    currency: string;
    range: string;
    dateStart: string;
    dateStop: string;
    syncedAt: number;
    totals: { spend: number; impressions: number; clicks: number; reach: number; active: number; ctr: number | null; cpc: number | null };
    daily: { date: string; spend: number; impressions: number; clicks: number }[];
    campaigns: MetaCampaign[];
  } | null;
  runs: SyncRun[];
  usage: Usage | null;
  observations: Observation[];
};

export type AccountChoice = { id: string; name: string; currency: string; business: string | null; status: { label: string; tone: Tone }; usable: boolean };

export type MetaActions = {
  connect: () => Promise<void>;
  loadAccounts: () => Promise<{ code: string; accounts: AccountChoice[] }>;
  chooseAccount: (id: string) => Promise<{ code: string }>;
  sync: (range?: string) => Promise<{ code: string }>;
  disconnect: () => Promise<void>;
};

const RANGES = [
  { value: "last_30d", label: "30 days" },
  { value: "last_90d", label: "90 days" },
  { value: "maximum", label: "All time" },
];

const OBJECTIVE_WORDS: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Sales",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_APP_PROMOTION: "App promotion",
};

const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "good" },
  PAUSED: { label: "Paused", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "Paused", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  DELETED: { label: "Deleted", tone: "neutral" },
  IN_PROCESS: { label: "Processing", tone: "warning" },
  WITH_ISSUES: { label: "Has issues", tone: "critical" },
};

/** What a short code from the server means for the person. */
export const META_CODE_WORDS: Record<string, string> = {
  token_expired: "Meta signed Vistrial out. Reconnect to keep reading results.",
  token_rejected: "Meta no longer accepts this connection. Reconnect to keep reading results.",
  permission_missing: "This Meta account cannot read that ad account. Pick another, or ask its admin for access.",
  rate_limited: "Meta asked Vistrial to slow down. It tries again on its next refresh.",
  connection_failed: "Meta could not be reached. Try again in a minute.",
  bad_request: "Meta did not accept the request for that ad account.",
  provider_error: "Meta returned an error. Try again in a minute.",
  no_account: "Choose an ad account first.",
};

export const RETURN_WORDS: Record<string, { text: string; tone: Tone }> = {
  connected: { text: "Connected. Now choose the ad account Vistrial should read.", tone: "good" },
  cancelled: { text: "Facebook Login was cancelled. Nothing was connected.", tone: "neutral" },
  expired: { text: "That login link expired. Start again.", tone: "warning" },
  failed: { text: "Meta did not finish the connection. Start again.", tone: "warning" },
  missing_permission: { text: "Vistrial needs permission to read your ads (ads_read). Start again and allow it.", tone: "warning" },
  not_configured: { text: "The Meta app is not set up on this deployment yet.", tone: "warning" },
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

function percent(n: number | null) {
  return n === null ? "–" : `${(n * 100).toFixed(2)}%`;
}

function when(time: number) {
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const CAN = ["Read your campaigns, ad sets and ads", "Read results: spend, reach, clicks, leads and cost per result", "Show those results to your team, and only your team"];
const CANNOT = ["Create, edit, pause or delete ads", "Spend money or change budgets", "Post anything or message anyone"];

function MetaMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm", className)}>
      <MetaLogo className="h-5" />
    </span>
  );
}

function Notice({ text, tone }: { text: string; tone: Tone }) {
  const styles: Record<Tone, string> = {
    good: "border-success/30 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    critical: "border-destructive/30 bg-destructive/5 text-destructive",
    neutral: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <p role="status" className={cn("rounded-lg border px-3 py-2 text-sm", styles[tone])}>
      {text}
    </p>
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

const STEPS = [
  { icon: Plug, title: "Connect with Facebook", words: "Sign in with Meta and allow read-only access to your ads." },
  { icon: Target, title: "Choose an ad account", words: "Pick the account for this business. You can change it later." },
  { icon: BarChart3, title: "See what your ads did", words: "Vistrial reads results and keeps them fresh every few hours." },
];

function Steps({ at }: { at: number }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="Steps">
      {STEPS.map((step, index) => {
        const done = index < at;
        const current = index === at;
        const Icon = done ? Check : step.icon;
        return (
          <li
            key={step.title}
            className={cn(
              "relative grid content-start gap-2 rounded-xl border p-4",
              current ? "border-primary/40 bg-primary/5" : done ? "border-success/30 bg-success/5" : "border-border bg-background/60",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-medium",
                  current ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="text-xs text-muted-foreground">Step {index + 1}</span>
            </span>
            <p className="text-sm font-medium text-card-foreground">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.words}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Eye; label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-xl border border-border bg-background/60 p-3">
      <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <span className="truncate font-heading text-xl text-card-foreground tabular-nums">{value}</span>
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Spend over the window as bars, with a readout for the bar under the pointer or keyboard focus. */
function SpendBars({ daily, currency }: { daily: { date: string; spend: number; clicks: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (daily.length === 0) return <p className="text-sm text-muted-foreground">No spend in this window.</p>;
  const max = Math.max(...daily.map((row) => row.spend), 1);
  const total = daily.reduce((sum, row) => sum + row.spend, 0);
  const shown = hover !== null ? daily[hover] : null;
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {shown ? `${shown.date}: ${money(shown.spend, currency)} · ${compact(shown.clicks)} clicks` : `${money(total, currency)} across ${daily.length} ${daily.length > 40 ? "days" : "periods"}. Point at a bar for its figure.`}
      </p>
      <div className="flex h-32 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {daily.map((row, index) => (
          <button
            key={row.date}
            type="button"
            aria-label={`${row.date}: ${money(row.spend, currency)}`}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            className="flex h-full min-w-[3px] flex-1 items-end rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <motion.span
              className={cn("block w-full rounded-t-[4px]", hover === null || hover === index ? "bg-primary" : "bg-primary/40")}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, (row.spend / max) * 100)}%` }}
              transition={{ delay: index * 0.01, type: "spring", stiffness: 200, damping: 26 }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{daily[0].date}</span>
        <span>Peak {money(max, currency)}</span>
        <span>{daily.at(-1)!.date}</span>
      </div>
    </div>
  );
}

function CampaignTable({ campaigns, currency, focus = [] }: { campaigns: MetaCampaign[]; currency: string; focus?: string[] }) {
  if (campaigns.length === 0) return <p className="text-sm text-muted-foreground">No campaigns in this account.</p>;
  return (
    <>
      <ul className="grid gap-2 sm:hidden" aria-label="Campaigns">
        {campaigns.map((row) => {
          const status = CAMPAIGN_STATUS[row.status] ?? { label: row.status.toLowerCase(), tone: "neutral" as const };
          return (
            <li key={row.id} className={cn("grid gap-2 rounded-xl border p-3 transition-colors", focus.includes(row.id) ? "border-primary bg-primary/5" : "border-border")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm break-words text-card-foreground">{row.name}</p>
                  {row.objective ? <p className="text-xs text-muted-foreground">{OBJECTIVE_WORDS[row.objective] ?? row.objective}</p> : null}
                </div>
                <StatusBadge label={status.label} tone={status.tone} className="shrink-0 [&_span]:normal-case" />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Spend</dt>
                  <dd className="text-sm text-card-foreground tabular-nums">{money(row.spend, currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{row.resultLabel ?? "Results"}</dt>
                  <dd className="text-sm text-card-foreground tabular-nums">{row.results === null ? "–" : compact(row.results)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Per result</dt>
                  <dd className="text-sm text-card-foreground tabular-nums">{row.costPerResult === null ? "–" : money(row.costPerResult, currency)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Campaign</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Spend</th>
            <th className="px-3 py-2 text-right font-medium">Results</th>
            <th className="px-3 py-2 text-right font-medium">Cost per result</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((row) => {
            const status = CAMPAIGN_STATUS[row.status] ?? { label: row.status.toLowerCase(), tone: "neutral" as const };
            return (
              <tr key={row.id} className={cn("border-t border-border transition-colors", focus.includes(row.id) && "bg-primary/5")}>
                <td className="max-w-[18rem] px-3 py-2">
                  <p className="truncate text-card-foreground" title={row.name}>
                    {row.name}
                  </p>
                  {row.objective ? <p className="text-xs text-muted-foreground">{OBJECTIVE_WORDS[row.objective] ?? row.objective}</p> : null}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge label={status.label} tone={status.tone} className="[&_span]:normal-case" />
                </td>
                <td className="px-3 py-2 text-right text-card-foreground tabular-nums">{money(row.spend, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.results === null ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <>
                      <span className="text-card-foreground">{compact(row.results)}</span> <span className="text-xs text-muted-foreground">{row.resultLabel?.toLowerCase()}</span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-card-foreground tabular-nums">{row.costPerResult === null ? "–" : money(row.costPerResult, currency)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{percent(row.ctr)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function AccountPicker({ actions, canManage, onChosen }: { actions: MetaActions; canManage: boolean; onChosen: () => void }) {
  const [accounts, setAccounts] = useState<AccountChoice[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => {
    setWorking(true);
    setNotice(null);
    const result = await actions.loadAccounts().catch(() => ({ code: "provider_error", accounts: [] }));
    setWorking(false);
    if (result.code !== "ok") setNotice(META_CODE_WORDS[result.code] ?? META_CODE_WORDS.provider_error);
    setAccounts(result.accounts);
    setPicked(result.accounts.find((row) => row.usable)?.id ?? null);
  };
  const choose = async () => {
    if (!picked) return;
    setWorking(true);
    setNotice(null);
    const result = await actions.chooseAccount(picked).catch(() => ({ code: "provider_error" }));
    setWorking(false);
    if (result.code !== "ok") setNotice(META_CODE_WORDS[result.code] ?? META_CODE_WORDS.provider_error);
    else onChosen();
  };

  if (!canManage) return <p className="text-sm text-muted-foreground">An Owner chooses the ad account.</p>;
  if (accounts === null)
    return (
      <div className="grid gap-3">
        <Button className="w-fit" onClick={() => void load()} loading={working}>
          Show my ad accounts <ArrowRight aria-hidden className="size-4" />
        </Button>
        {notice ? <Notice text={notice} tone="warning" /> : null}
      </div>
    );
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Ad accounts" className="grid gap-2 sm:grid-cols-2">
        {accounts.map((row) => (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={picked === row.id}
            disabled={!row.usable}
            onClick={() => setPicked(row.id)}
            className={cn(
              "grid min-w-0 gap-1 rounded-xl border p-3 text-left transition-colors",
              picked === row.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-background hover:border-primary/40",
              !row.usable && "cursor-not-allowed opacity-55 hover:border-border",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-card-foreground">{row.name}</span>
              <StatusBadge label={row.status.label} tone={row.status.tone} className="shrink-0 [&_span]:normal-case" />
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {row.business ? `${row.business} · ` : ""}
              {row.id.replace("act_", "")} · {row.currency}
            </span>
          </button>
        ))}
      </div>
      {accounts.length === 0 ? <p className="text-sm text-muted-foreground">This Meta account cannot reach any ad accounts.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void choose()} loading={working} disabled={!picked}>
          Use this account
        </Button>
        <Button variant="ghost" onClick={() => void load()} disabled={working}>
          Refresh list
        </Button>
      </div>
      {notice ? <Notice text={notice} tone="warning" /> : null}
    </div>
  );
}

/** The Meta ads connection card: connect, choose an account, then the account's results. */
export function MetaAdsView({ status, actions, returned }: { status: MetaStatus; actions: MetaActions; returned?: string | null }) {
  const [working, setWorking] = useState<null | "connect" | "sync">(null);
  const [notice, setNotice] = useState<{ text: string; tone: Tone } | null>(returned ? (RETURN_WORDS[returned] ?? null) : null);
  const [changing, setChanging] = useState(false);
  const [focus, setFocus] = useState<string[]>([]);
  const connection = status.connection;
  const snapshot = status.snapshot;
  const needsReconnect = connection?.status === "needsReconnect";
  const stage = !connection ? 0 : !connection.adAccountId || changing ? 1 : 2;
  const currency = snapshot?.currency ?? connection?.currency ?? "USD";

  const connect = async () => {
    setWorking("connect");
    try {
      await actions.connect();
    } catch {
      setNotice({ text: "Could not start Facebook Login. Try again.", tone: "warning" });
      setWorking(null);
    }
  };
  const sync = async (range?: string) => {
    setWorking("sync");
    const result = await actions.sync(range).catch(() => ({ code: "provider_error" }));
    setWorking(null);
    setNotice(result.code === "ok" ? null : { text: META_CODE_WORDS[result.code] ?? META_CODE_WORDS.provider_error, tone: "warning" });
  };

  const badge = !connection
    ? { label: "Not connected", tone: "neutral" as const }
    : needsReconnect
      ? { label: "Reconnect needed", tone: "warning" as const }
      : { label: "Connected", tone: "good" as const };

  return (
    <Panel className="grid gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MetaMark />
          <div className="min-w-0">
            <h2 className="font-heading text-lg text-card-foreground">Meta ads</h2>
            <p className="text-sm text-muted-foreground">Facebook and Instagram ad results, read-only.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="size-3.5" /> Read-only
          </span>
          <StatusBadge label={badge.label} tone={badge.tone} className="[&_span]:normal-case" />
        </div>
      </div>

      {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
      {needsReconnect ? (
        <div className="grid gap-2">
          <Notice text={META_CODE_WORDS.token_expired} tone="warning" />
          {status.canManage && status.configured ? (
            <Button variant="gradient" className="w-fit" onClick={() => void connect()} loading={working === "connect"}>
              <Plug aria-hidden className="size-4" /> Reconnect with Facebook
            </Button>
          ) : null}
        </div>
      ) : null}

      {stage < 2 ? <Steps at={stage} /> : null}

      {stage === 0 ? (
        <div className="grid gap-4">
          <CanCannot />
          {!status.configured ? (
            <Notice text="The Meta app is not set up on this deployment yet." tone="warning" />
          ) : status.canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="gradient" onClick={() => void connect()} loading={working === "connect"}>
                <Plug aria-hidden className="size-4" /> Connect with Facebook
              </Button>
              <span className="text-xs text-muted-foreground">You sign in on Meta&apos;s own page. Vistrial never sees your password.</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">An Owner connects Meta ads for this workspace.</p>
          )}
        </div>
      ) : null}

      {stage === 1 && connection ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Connected as <span className="text-card-foreground">{connection.metaUserName}</span>. Choose the ad account for this business.
          </p>
          <AccountPicker actions={actions} canManage={status.canManage} onChosen={() => setChanging(false)} />
          {changing ? (
            <Button variant="ghost" className="w-fit" onClick={() => setChanging(false)}>
              Keep {connection.adAccountName}
            </Button>
          ) : null}
        </div>
      ) : null}

      {stage === 2 && connection ? (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-card-foreground">{connection.adAccountName}</p>
              <p className="text-xs text-muted-foreground">
                Connected as {connection.metaUserName}
                {connection.lastSyncAt ? ` · Updated ${when(connection.lastSyncAt)}` : " · Not read yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl<string> label="Window" options={RANGES} value={connection.range} onChange={(value) => void sync(value)} />
              <Button variant="outline" size="sm" onClick={() => void sync()} loading={working === "sync"}>
                <RefreshCw aria-hidden className="size-3.5" /> Refresh
              </Button>
            </div>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 content-start gap-5">
              {snapshot ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    <Kpi icon={CircleDollarSign} label="Spend" value={money(snapshot.totals.spend, currency)} hint={`${snapshot.dateStart} to ${snapshot.dateStop}`} />
                    <Kpi icon={Eye} label="Impressions" value={compact(snapshot.totals.impressions)} hint={`Reach ${compact(snapshot.totals.reach)}`} />
                    <Kpi icon={MousePointerClick} label="Clicks" value={compact(snapshot.totals.clicks)} hint={`CTR ${percent(snapshot.totals.ctr)}`} />
                    <Kpi icon={Target} label="Cost per click" value={snapshot.totals.cpc === null ? "–" : money(snapshot.totals.cpc, currency)} />
                    <Kpi icon={BarChart3} label="Campaigns" value={String(snapshot.campaigns.length)} hint={`${snapshot.totals.active} active`} />
                  </div>
                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium text-card-foreground">Spend over time</h3>
                    <SpendBars daily={snapshot.daily} currency={currency} />
                  </div>
                  <Observations items={status.observations} onFocus={(ids) => setFocus((current) => (current.join() === ids.join() ? [] : ids))} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{connection.lastSyncCode && connection.lastSyncCode !== "ok" ? META_CODE_WORDS[connection.lastSyncCode] : "Reading the account…"}</p>
              )}
            </div>
            <aside className="grid min-w-0 content-start gap-4" aria-label="What Vistrial did">
              <SyncActivity runs={status.runs} />
              {status.usage ? <ApiUsage usage={status.usage} /> : null}
            </aside>
          </div>
          {snapshot ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-card-foreground">Campaigns</h3>
                {focus.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setFocus([])}>
                    Clear highlight
                  </Button>
                ) : null}
              </div>
              <CampaignTable campaigns={snapshot.campaigns} currency={currency} focus={focus} />
              <p className="text-xs text-muted-foreground">These are your own results as Meta reports them. Vistrial only reads them, and only this workspace sees them.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Connected {new Date(connection.connectedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Disconnecting removes everything Vistrial saved.</p>
            {status.canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
                  Change account
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive-outline" size="sm">
                      <Unplug aria-hidden className="size-3.5" /> Disconnect
                    </Button>
                  }
                  title="Disconnect Meta ads?"
                  description="Vistrial deletes its access and every result it saved. Nothing changes in your Meta account."
                  confirmLabel="Disconnect"
                  onConfirm={actions.disconnect}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
