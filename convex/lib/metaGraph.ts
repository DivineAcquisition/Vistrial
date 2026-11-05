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
