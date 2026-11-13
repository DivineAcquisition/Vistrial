/**
 * First-party results for research: the business's own Meta ad results, from the workspace connection the
 * Strategist is granted, saved on the project as `customerData` sources so a report can cite them as
 * "Your data". Read from the last saved read of the account; nothing calls Meta from here.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { GROWTH_ARCHITECT } from "../../catalog";
import { canonicalUrl } from "../../lib/sourceRefs";

/** At most this many campaigns become sources, highest spend first. */
const CAMPAIGNS = 5;
const RANGE_WORDS: Record<string, string> = { last_30d: "last 30 days", last_90d: "last 90 days", maximum: "all time" };

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function pct(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}

function accountId(id: string) {
  return id.replace(/^act_/, "");
}

export type FirstPartySummary = { label: string; value: string; recordedAt: number } | null;

/**
 * Saves (or refreshes) the business's own ad results as sources on this project. Returns a one-line
 * summary for the brief, or null when there is no granted connection with a saved read.
 */
export async function saveFirstPartySources(ctx: MutationCtx, workspaceId: Id<"workspaces">, project: Doc<"researchProjects">, runId: Id<"agentRuns">): Promise<FirstPartySummary> {
  const connection = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  if (!connection || connection.status !== "connected" || !connection.adAccountId) return null;
  if (!(connection.agents ?? [GROWTH_ARCHITECT]).includes(GROWTH_ARCHITECT)) return null;
  const snapshot = await ctx.db
    .query("metaAdSnapshots")
    .withIndex("by_workspace_account", (q) => q.eq("workspaceId", workspaceId).eq("adAccountId", connection.adAccountId!))
    .unique();
  if (!snapshot || snapshot.totals.spend <= 0) return null;

  const currency = snapshot.currency;
  const window = RANGE_WORDS[snapshot.range ?? "last_30d"] ?? "recent";
  const account = connection.adAccountName ?? connection.adAccountId;
  const managerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId(connection.adAccountId)}`;
  const rows: { url: string; title: string; excerpt: string }[] = [
    {
      url: managerUrl,
      title: `Your Meta ads: ${account} (${window})`,
      excerpt: `${fmt(snapshot.totals.spend, currency)} spent, ${snapshot.totals.impressions.toLocaleString("en-US")} impressions, ${snapshot.totals.clicks.toLocaleString("en-US")} clicks, CTR ${pct(snapshot.totals.ctr)}, cost per click ${snapshot.totals.cpc === null ? "n/a" : fmt(snapshot.totals.cpc, currency)}, ${snapshot.campaigns.length} campaigns, ${snapshot.totals.active} active. ${snapshot.dateStart} to ${snapshot.dateStop}, as reported by Meta.`,
    },
    ...snapshot.campaigns
      .filter((row) => row.spend > 0)
      .slice(0, CAMPAIGNS)
      .map((row) => ({
        url: `${managerUrl}&selected_campaign_ids=${encodeURIComponent(row.id)}`,
        title: `Your Meta campaign: ${row.name}`,
        excerpt: [
          `${fmt(row.spend, currency)} spent (${window})`,
          row.results !== null && row.resultLabel ? `${row.results} ${row.resultLabel.toLowerCase()}${row.costPerResult !== null ? ` at ${fmt(row.costPerResult, currency)} each` : ""}` : null,
          `CTR ${pct(row.ctr)}`,
          row.objective ? `objective ${row.objective.replace("OUTCOME_", "").toLowerCase()}` : null,
          `status ${row.status.toLowerCase()}`,
        ]
          .filter(Boolean)
          .join(", ")
          .concat(". As reported by Meta."),
      })),
  ];

  for (const row of rows) {
    const canonical = canonicalUrl(row.url);
    if (!canonical) continue;
    const existing = await ctx.db
      .query("sourceRefs")
      .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", workspaceId).eq("projectId", project._id).eq("canonicalUrl", canonical))
      .unique();
    const fields = {
      title: row.title.slice(0, 200),
      excerpt: row.excerpt.slice(0, 300),
      publisher: account,
      observedAt: snapshot.syncedAt,
      runId,
      limitation: "Your own results as Meta reports them. Not a competitor's.",
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else
      await ctx.db.insert("sourceRefs", {
        workspaceId,
        projectId: project._id,
        origin: "supplied",
        platform: "customerData",
        kind: "dataset",
        url: row.url,
        canonicalUrl: canonical,
        availability: "available",
        ...fields,
      });
  }

  const best = snapshot.campaigns.filter((row) => row.results && row.costPerResult !== null && row.resultLabel).sort((a, b) => a.costPerResult! - b.costPerResult!)[0];
  return {
    label: "Your Meta ads",
    value: `${account}: ${fmt(snapshot.totals.spend, currency)} spent (${window})${best ? `; best ${best.resultLabel!.toLowerCase()} cost ${fmt(best.costPerResult!, currency)} (${best.name})` : ""}`,
    recordedAt: snapshot.syncedAt,
  };
}
