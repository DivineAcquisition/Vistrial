"use client";

import { useState } from "react";

import type { SyncRun, Usage } from "@/components/connections/meta-effort";
import { MetaAdsView, type AccountChoice, type MetaCampaign, type MetaStatus } from "@/components/connections/meta-ads-view";
import { observe } from "../../../../convex/lib/metaGraph";

/** Shapes from the dev test run against the Northlight Growth account (all time). */
const CAMPAIGNS: MetaCampaign[] = [
  { id: "1", name: "BACP | New Customer $50 Special", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 3913.89, impressions: 151200, reach: 98000, clicks: 1874, ctr: 0.0124, cpc: 2.09, resultLabel: "Leads", results: 182, costPerResult: 21.5 },
  { id: "2", name: "Northlight | Residential V2", status: "ARCHIVED", objective: null, spend: 526.15, impressions: 30100, reach: 21000, clicks: 116, ctr: 0.0039, cpc: 4.54, resultLabel: "Link clicks", results: 116, costPerResult: 4.54 },
  { id: "3", name: "Northlight | Res & Comm Retargeting", status: "ARCHIVED", objective: null, spend: 326.77, impressions: 18700, reach: 9100, clicks: 117, ctr: 0.0063, cpc: 2.79, resultLabel: "Link clicks", results: 117, costPerResult: 2.79 },
  { id: "4", name: "Northlight | Commercial V2", status: "ARCHIVED", objective: null, spend: 193.81, impressions: 11200, reach: 8800, clicks: 71, ctr: 0.0063, cpc: 2.73, resultLabel: "Link clicks", results: 71, costPerResult: 2.73 },
  { id: "5", name: "BACP | Retargeting", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 168.44, impressions: 9400, reach: 4100, clicks: 88, ctr: 0.0094, cpc: 1.91, resultLabel: "Leads", results: 0, costPerResult: null },
  { id: "6", name: "HIRING - BAY / HOU", status: "PAUSED", objective: "OUTCOME_AWARENESS", spend: 155.67, impressions: 27400, reach: 23300, clicks: 160, ctr: 0.0058, cpc: 0.97, resultLabel: null, results: null, costPerResult: null },
];

const DAILY = ["2024-06-19", "2024-07-01", "2024-08-01", "2024-09-01", "2025-06-01", "2025-07-01", "2025-08-01", "2025-09-01"].map((date, index) => ({
  date,
  spend: [543.14, 644.09, 812.4, 401.2, 980.5, 657.12, 1220.3, 600.46][index],
  impressions: 20000,
  clicks: 300,
}));

const ACCOUNTS: AccountChoice[] = [
  { id: "act_994917815468301", name: "Northlight Growth", currency: "USD", business: "Divine Acquisition", status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_1378731370211787", name: "Vistrial", currency: "USD", business: "Divine Acquisition", status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_1304122571312103", name: "AlphaLux Coaching", currency: "USD", business: null, status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_866758759339348", name: "Novara Coaching", currency: "USD", business: null, status: { label: "Unsettled balance", tone: "warning" }, usable: false },
  { id: "act_1395536585160786", name: "JJ Consulting", currency: "USD", business: null, status: { label: "Closed", tone: "neutral" }, usable: false },
];

const CONNECTION = {
  source: "oauth",
  status: "connected",
  metaUserName: "Malik Sannie",
  connectedAt: 1793900000000,
  tokenExpiresAt: 1798900000000,
  scopes: ["ads_read"],
  adAccountId: "act_994917815468301",
  adAccountName: "Northlight Growth",
  currency: "USD",
  range: "maximum",
  lastSyncAt: 1793902000000,
  lastSyncCode: "ok",
  calls: { ok: 48, failed: 1, successRate: 48 / 49 },
};

const STEP_KEYS = ["access", "results", "campaigns", "trend", "save"];
const TIMES = [324, 1801, 335, 543, 69];
const ROWS = [1, 14, 6, 8, 14];

function runAt(now: number, id: string, trigger: SyncRun["trigger"], agoMs: number, liveAt?: number): SyncRun {
  const startedAt = now - agoMs;
  const steps = STEP_KEYS.map((key, index) => {
    if (liveAt === undefined || index < liveAt) return { key, status: "done" as const, calls: key === "save" ? 0 : 1, rows: ROWS[index], ms: TIMES[index] };
    return { key, status: index === liveAt ? ("working" as const) : ("waiting" as const), calls: 0 };
  });
  return {
    id,
    trigger,
    status: liveAt === undefined ? "done" : "running",
    code: liveAt === undefined ? "ok" : null,
    startedAt,
    finishedAt: liveAt === undefined ? startedAt + 3072 : null,
    steps,
    callsOk: liveAt === undefined ? 4 : liveAt,
    callsFailed: 0,
  };
}

function usageAt(now: number): Usage {
  const days = Array.from({ length: 15 }, (_, index) => {
    const day = new Date(now - (14 - index) * 86_400_000).toISOString().slice(0, 10);
    const ok = index < 9 ? 0 : [22, 31, 28, 35, 40, 44][index - 9];
    return { day, ok, failed: index === 12 ? 2 : 0 };
  });
  const ok = days.reduce((sum, row) => sum + row.ok, 0);
  const failed = days.reduce((sum, row) => sum + row.failed, 0);
  return { days, ok, failed, successRate: ok / (ok + failed), target: { calls: 500, successRate: 0.85, days: 15 } };
}

function statusFor(state: string, now: number): MetaStatus {
  const empty = { runs: [], usage: null, observations: [] };
  if (state === "none") return { configured: true, canManage: true, connection: null, snapshot: null, ...empty };
  if (state === "accounts") return { configured: true, canManage: true, connection: { ...CONNECTION, adAccountId: null, adAccountName: null, lastSyncAt: null }, snapshot: null, ...empty };
  const snapshot = {
    currency: "USD",
    range: "maximum",
    dateStart: "2024-06-20",
    dateStop: "2026-11-05",
    syncedAt: 1793902000000,
    totals: { spend: 5859.21, impressions: 248082, clicks: 3136, reach: 164353, active: 0, ctr: 3136 / 248082, cpc: 5859.21 / 3136 },
    daily: DAILY,
    campaigns: CAMPAIGNS,
  };
  const runs = [
    ...(state === "syncing" ? [runAt(now, "live", "manual", 2400, 2)] : []),
    runAt(now, "r1", "schedule", 42 * 60_000),
    runAt(now, "r2", "schedule", 3 * 3_600_000 + 42 * 60_000),
    runAt(now, "r3", "manual", 5 * 3_600_000),
    runAt(now, "r4", "connect", 26 * 3_600_000),
  ];
  return {
    configured: true,
    canManage: true,
    connection: { ...CONNECTION, status: state === "reconnect" ? "needsReconnect" : "connected" },
    snapshot,
    runs,
    usage: usageAt(now),
    observations: observe(CAMPAIGNS, snapshot.totals, "USD"),
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function MetaConnectionStory({ state }: { state: string }) {
  const [now] = useState(() => Date.now());
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto grid max-w-5xl gap-4">
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          Meta connection story. Fixtures from the dev test run. States: none, accounts, connected, syncing, reconnect.
        </p>
        <MetaAdsView
          status={statusFor(state, now)}
          returned={state === "accounts" ? "connected" : null}
          actions={{
            connect: async () => wait(300),
            loadAccounts: async () => (await wait(300), { code: "ok", accounts: ACCOUNTS }),
            chooseAccount: async () => (await wait(300), { code: "ok" }),
            sync: async () => (await wait(300), { code: "ok" }),
            disconnect: async () => wait(300),
          }}
        />
      </div>
    </div>
  );
}
