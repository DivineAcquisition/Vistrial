"use client";

import { MetaAdsView, type AccountChoice, type MetaCampaign, type MetaStatus } from "@/components/connections/meta-ads-view";

/** Shapes from the dev test run against the Bay Area Cleaning Professionals account (all time). */
const CAMPAIGNS: MetaCampaign[] = [
  { id: "1", name: "BACP | New Customer $50 Special", status: "PAUSED", objective: "OUTCOME_LEADS", spend: 3913.89, impressions: 151200, reach: 98000, clicks: 1874, ctr: 0.0124, cpc: 2.09, resultLabel: "Leads", results: 182, costPerResult: 21.5 },
  { id: "2", name: "Bay Area Cleaning | Residential V2", status: "ARCHIVED", objective: null, spend: 526.15, impressions: 30100, reach: 21000, clicks: 116, ctr: 0.0039, cpc: 4.54, resultLabel: "Link clicks", results: 116, costPerResult: 4.54 },
  { id: "3", name: "Bay Area Cleaning | Res & Comm Retargeting", status: "ARCHIVED", objective: null, spend: 326.77, impressions: 18700, reach: 9100, clicks: 117, ctr: 0.0063, cpc: 2.79, resultLabel: "Link clicks", results: 117, costPerResult: 2.79 },
  { id: "4", name: "Bay Area Cleaning | Commercial V2", status: "ARCHIVED", objective: null, spend: 193.81, impressions: 11200, reach: 8800, clicks: 71, ctr: 0.0063, cpc: 2.73, resultLabel: "Link clicks", results: 71, costPerResult: 2.73 },
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
  { id: "act_994917815468301", name: "Bay Area Cleaning Professionals", currency: "USD", business: "Divine Acquisition", status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_1378731370211787", name: "Vistrial", currency: "USD", business: "Divine Acquisition", status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_1304122571312103", name: "AlphaLuxClean", currency: "USD", business: null, status: { label: "Active", tone: "good" }, usable: true },
  { id: "act_866758759339348", name: "NovaraCleaning", currency: "USD", business: null, status: { label: "Unsettled balance", tone: "warning" }, usable: false },
  { id: "act_1395536585160786", name: "JJ Cleaning Services", currency: "USD", business: null, status: { label: "Closed", tone: "neutral" }, usable: false },
];

const CONNECTION = {
  source: "oauth",
  status: "connected",
  metaUserName: "Malik Sannie",
  connectedAt: 1793900000000,
  tokenExpiresAt: 1798900000000,
  scopes: ["ads_read"],
  adAccountId: "act_994917815468301",
  adAccountName: "Bay Area Cleaning Professionals",
  currency: "USD",
  range: "maximum",
  lastSyncAt: 1793902000000,
  lastSyncCode: "ok",
  calls: { ok: 48, failed: 1, successRate: 48 / 49 },
};

function statusFor(state: string): MetaStatus {
  if (state === "none") return { configured: true, canManage: true, connection: null, snapshot: null };
  if (state === "accounts") return { configured: true, canManage: true, connection: { ...CONNECTION, adAccountId: null, adAccountName: null, lastSyncAt: null }, snapshot: null };
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
  return { configured: true, canManage: true, connection: { ...CONNECTION, status: state === "reconnect" ? "needsReconnect" : "connected" }, snapshot };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function MetaConnectionStory({ state }: { state: string }) {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto grid max-w-5xl gap-4">
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          Meta connection story. Fixtures from the dev test run. States: none, accounts, connected, reconnect.
        </p>
        <MetaAdsView
          status={statusFor(state)}
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
