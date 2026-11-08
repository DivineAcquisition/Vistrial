/**
 * Meta Marketing API, read-only. Helpers that shape what Graph returns into what Vistrial keeps.
 * Nothing here writes to Meta: no campaign is created, changed, paused or funded.
 */

export const GRAPH_VERSION_DEFAULT = "v25.0";

export function graphVersion() {
  return process.env.META_GRAPH_VERSION || GRAPH_VERSION_DEFAULT;
}

/** What Facebook Login asks for. Read-only by default. */
export function oauthScopes() {
  return (process.env.META_OAUTH_SCOPES || "ads_read").split(",").map((row) => row.trim()).filter(Boolean);
}

/** Meta's ad account status codes, in plain words. */
export const ACCOUNT_STATUS: Record<number, { label: string; tone: "good" | "warning" | "critical" | "neutral" }> = {
  1: { label: "Active", tone: "good" },
  2: { label: "Disabled", tone: "critical" },
  3: { label: "Unsettled balance", tone: "warning" },
  7: { label: "Under risk review", tone: "warning" },
  8: { label: "Pending settlement", tone: "warning" },
  9: { label: "In grace period", tone: "warning" },
  100: { label: "Closing", tone: "neutral" },
  101: { label: "Closed", tone: "neutral" },
  201: { label: "Any active", tone: "good" },
  202: { label: "Any closed", tone: "neutral" },
};

/** Where the person may be sent back to after Facebook Login. Anything else goes to the app's own page. */
export function safeReturnOrigin(origin: string | undefined) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const allowed =
      (url.protocol === "https:" && (host === "vistrial.io" || host.endsWith(".vistrial.io") || (host.endsWith(".vercel.app") && host.startsWith("vistrial")))) ||
      (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"));
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
}

/** The windows a person can read, as Graph date presets, with the series step for each. */
export const RANGES = {
  last_30d: { label: "Last 30 days", step: "1" },
  last_90d: { label: "Last 90 days", step: "1" },
  maximum: { label: "All time", step: "monthly" },
} as const;
export type RangeKey = keyof typeof RANGES;
export function isRange(value: string | undefined): value is RangeKey {
  return value !== undefined && value in RANGES;
}

/** Only app pages: a path under /app/ with no scheme, host or traversal. */
export function safeReturnPath(path: string | undefined) {
  if (!path) return null;
  return /^\/app\/[A-Za-z0-9/_?=&.-]*$/.test(path) && !path.includes("//") && !path.includes("..") ? path.slice(0, 300) : null;
}

/** act_123 ids only. */
export function isAdAccountId(id: string) {
  return /^act_\d{3,25}$/.test(id);
}

type Action = { action_type?: string; value?: string };

/** The result a campaign is judged by, from its objective. The first type present wins. */
const RESULT_TYPES: Record<string, { label: string; types: string[] }> = {
  OUTCOME_LEADS: { label: "Leads", types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"] },
  OUTCOME_SALES: { label: "Purchases", types: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"] },
  OUTCOME_ENGAGEMENT: { label: "Engagements", types: ["post_engagement", "page_engagement"] },
  OUTCOME_AWARENESS: { label: "Reach", types: [] },
  OUTCOME_TRAFFIC: { label: "Link clicks", types: ["link_click", "landing_page_view"] },
  OUTCOME_APP_PROMOTION: { label: "App installs", types: ["mobile_app_install", "app_install"] },
  LEAD_GENERATION: { label: "Leads", types: ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"] },
  CONVERSIONS: { label: "Conversions", types: ["offsite_conversion.fb_pixel_lead", "offsite_conversion.fb_pixel_purchase", "lead", "purchase"] },
  LINK_CLICKS: { label: "Link clicks", types: ["link_click"] },
  MESSAGES: { label: "Conversations", types: ["onsite_conversion.messaging_conversation_started_7d"] },
};

function num(value: unknown) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Results for an objective, from Graph's actions list. Null when the objective has no countable result. */
export function resultsFor(objective: string | null | undefined, actions: Action[] | undefined) {
  const spec = RESULT_TYPES[objective ?? ""] ?? { label: "Link clicks", types: ["link_click"] };
  for (const type of spec.types) {
    const hit = actions?.find((row) => row.action_type === type);
    if (hit) return { label: spec.label, count: num(hit.value) };
  }
  return spec.types.length ? { label: spec.label, count: 0 } : null;
}

export type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Action[];
  date_start?: string;
  date_stop?: string;
};

export type CampaignRow = { id?: string; name?: string; effective_status?: string; status?: string; objective?: string };

export type CampaignResult = {
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

/** One row per campaign: Graph's campaign list joined to its insights. Campaigns with no delivery keep zeros. */
export function joinCampaigns(campaigns: CampaignRow[], insights: InsightRow[]): CampaignResult[] {
  const byId = new Map(insights.filter((row) => row.campaign_id).map((row) => [row.campaign_id!, row]));
  const ids = new Set<string>();
  const out: CampaignResult[] = [];
  const add = (id: string, name: string, status: string, objective: string | null, insight: InsightRow | undefined) => {
    if (ids.has(id)) return;
    ids.add(id);
    const spend = num(insight?.spend);
    const impressions = num(insight?.impressions);
    const clicks = num(insight?.clicks);
    const result = resultsFor(objective, insight?.actions);
    out.push({
      id,
      name,
      status,
      objective,
      spend,
      impressions,
      reach: num(insight?.reach),
      clicks,
      ctr: impressions > 0 ? clicks / impressions : null,
      cpc: clicks > 0 ? spend / clicks : null,
      resultLabel: result?.label ?? null,
      results: result?.count ?? null,
      costPerResult: result && result.count > 0 ? spend / result.count : null,
    });
  };
  for (const row of campaigns) {
    if (!row.id) continue;
    add(row.id, row.name ?? `Campaign ${row.id}`, row.effective_status ?? row.status ?? "UNKNOWN", row.objective ?? null, byId.get(row.id));
  }
  for (const row of insights) {
    if (row.campaign_id) add(row.campaign_id, row.campaign_name ?? `Campaign ${row.campaign_id}`, "ARCHIVED", null, row);
  }
  return out.sort((a, b) => b.spend - a.spend);
}

export type DailyPoint = { date: string; spend: number; impressions: number; clicks: number };

export function dailySeries(rows: InsightRow[]): DailyPoint[] {
  return rows
    .filter((row) => row.date_start)
    .map((row) => ({ date: row.date_start!, spend: num(row.spend), impressions: num(row.impressions), clicks: num(row.clicks) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function totalsOf(campaigns: CampaignResult[]) {
  const spend = campaigns.reduce((sum, row) => sum + row.spend, 0);
  const impressions = campaigns.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
  const reach = campaigns.reduce((sum, row) => sum + row.reach, 0);
  const active = campaigns.filter((row) => row.status === "ACTIVE").length;
  return { spend, impressions, clicks, reach, active, ctr: impressions > 0 ? clicks / impressions : null, cpc: clicks > 0 ? spend / clicks : null };
}

/** Graph's error as a short code a screen can explain. Never the token, never the raw message. */
export function graphErrorCode(body: unknown): string {
  const error = (body as { error?: { code?: number; error_subcode?: number } } | null)?.error;
  if (!error) return "provider_error";
  if (error.code === 190) return error.error_subcode === 463 ? "token_expired" : "token_rejected";
  const code = error.code ?? 0;
  if (code === 10 || (code >= 200 && code < 300)) return "permission_missing";
  if (error.code === 4 || error.code === 17 || error.code === 32 || error.code === 613 || error.code === 80004) return "rate_limited";
  if (error.code === 100) return "bad_request";
  return "provider_error";
}

/** The steps of one read, in order. Screens name them; the server only uses the keys. */
export const SYNC_STEPS = ["access", "results", "campaigns", "trend", "save"] as const;
export type SyncStepKey = (typeof SYNC_STEPS)[number];

/** Meta's access tier counts the last 15 days; it asks for 500 calls at 85% success. */
export const TIER = { days: 15, calls: 500, successRate: 0.85 } as const;

export function utcDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

/** The last `days` UTC days, oldest first, each with its counts (zero when none). */
export function fillDays(rows: { day: string; ok: number; failed: number }[], now: number, days: number = TIER.days) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const out: { day: string; ok: number; failed: number }[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const day = utcDay(now - back * 86_400_000);
    out.push({ day, ok: byDay.get(day)?.ok ?? 0, failed: byDay.get(day)?.failed ?? 0 });
  }
  return out;
}

export type Observation = {
  key: string;
  kind: "share" | "best" | "noResults" | "spread" | "idle" | "clickRate";
  title: string;
  detail: string;
  tone: "good" | "warning" | "neutral";
  campaignIds: string[];
};

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * What the account's own numbers show, computed in code. Each line is a fact about these campaigns
 * compared with each other, never with outside benchmarks, so every one is Observed first-party evidence.
 */
export function observe(campaigns: CampaignResult[], totals: { spend: number; active: number; ctr?: number | null }, currency: string): Observation[] {
  const out: Observation[] = [];
  const spent = campaigns.filter((row) => row.spend > 0);
  if (spent.length === 0) return out;

  const top = spent[0];
  const share = totals.spend > 0 ? top.spend / totals.spend : 0;
  if (spent.length >= 2 && share >= 0.4) {
    out.push({
      key: "share",
      kind: "share",
      title: `${Math.round(share * 100)}% of spend went to one campaign`,
      detail: `${top.name} spent ${fmtMoney(top.spend, currency)} of ${fmtMoney(totals.spend, currency)}.`,
      tone: "neutral",
      campaignIds: [top.id],
    });
  }

  const byLabel = new Map<string, CampaignResult[]>();
  for (const row of spent) {
    if (row.resultLabel && row.results !== null && row.results > 0 && row.costPerResult !== null) {
      byLabel.set(row.resultLabel, [...(byLabel.get(row.resultLabel) ?? []), row]);
    }
  }
  for (const [label, rows] of byLabel) {
    const sorted = [...rows].sort((a, b) => a.costPerResult! - b.costPerResult!);
    const best = sorted[0];
    const unit = label.toLowerCase().replace(/s$/, "");
    if (sorted.length >= 2) {
      out.push({
        key: `best-${label}`,
        kind: "best",
        title: `Cheapest ${unit}: ${fmtMoney(best.costPerResult!, currency)}`,
        detail: `${best.name}, the lowest cost per ${unit} of ${sorted.length} campaigns that produced ${label.toLowerCase()}.`,
        tone: "good",
        campaignIds: [best.id],
      });
      const worst = sorted.at(-1)!;
      if (worst.costPerResult! >= best.costPerResult! * 2) {
        out.push({
          key: `spread-${label}`,
          kind: "spread",
          title: `Cost per ${unit} ranges ${(worst.costPerResult! / best.costPerResult!).toFixed(1)}×`,
          detail: `From ${fmtMoney(best.costPerResult!, currency)} (${best.name}) to ${fmtMoney(worst.costPerResult!, currency)} (${worst.name}).`,
          tone: "warning",
          campaignIds: [best.id, worst.id],
        });
      }
    } else {
      out.push({
        key: `best-${label}`,
        kind: "best",
        title: `${best.results} ${label.toLowerCase()} at ${fmtMoney(best.costPerResult!, currency)} each`,
        detail: `${best.name} is the only campaign that produced ${label.toLowerCase()} in this window.`,
        tone: "good",
        campaignIds: [best.id],
      });
    }
  }

  const empty = spent.filter((row) => row.resultLabel && row.results === 0);
  if (empty.length > 0) {
    const wasted = empty.reduce((sum, row) => sum + row.spend, 0);
    out.push({
      key: "noResults",
      kind: "noResults",
      title: `${fmtMoney(wasted, currency)} spent with no results`,
      detail:
        empty.length === 1
          ? `${empty[0].name} spent ${fmtMoney(empty[0].spend, currency)} and produced no ${empty[0].resultLabel!.toLowerCase()}.`
          : `${empty.length} campaigns spent money and produced none of the result they were set up for.`,
      tone: "warning",
      campaignIds: empty.map((row) => row.id),
    });
  }

  const rated = spent.filter((row) => row.ctr !== null && row.impressions >= 5000);
  if (rated.length >= 3) {
    const low = [...rated].sort((a, b) => a.ctr! - b.ctr!)[0];
    out.push({
      key: "clickRate",
      kind: "clickRate",
      title: `Lowest click rate: ${(low.ctr! * 100).toFixed(2)}%`,
      detail: `${low.name}, across ${low.impressions.toLocaleString("en-US")} impressions${totals.ctr ? `. The whole account: ${(totals.ctr * 100).toFixed(2)}%` : ""}.`,
      tone: "neutral",
      campaignIds: [low.id],
    });
  }

  if (totals.active === 0) {
    out.push({ key: "idle", kind: "idle", title: "Nothing is running now", detail: "No campaign in this account is active. These results are history.", tone: "neutral", campaignIds: [] });
  }
  return out.slice(0, 6);
}
