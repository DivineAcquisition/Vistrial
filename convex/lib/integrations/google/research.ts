/**
 * The customer's own Google data for research: the last saved totals of each Google data connection granted
 * to the agent doing the work, saved on the project as `customerData` sources so a report can cite them as
 * "Your data". Read from the saved summary; nothing calls Google from here. Organization-level only: a
 * connection belongs to the organization, so work for a client leaves it out.
 */

import type { Doc, Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { GROWTH_ARCHITECT } from "../../../catalog";
import { canonicalUrl } from "../../sourceRefs";
import { analyticsLine, type AnalyticsSnapshot } from "./analytics";

export type GoogleKnown = { key: string; label: string; value: string; recordedAt: number };

const n = (value: number) => value.toLocaleString("en-US");

/** The rows one connection contributes, each a source a report can cite. */
function rowsFor(provider: string, connection: Doc<"integrationConnections">, data: unknown): { url: string; title: string; excerpt: string }[] {
  const selected = connection.selected!;
  if (provider === "google_analytics") {
    const snapshot = data as AnalyticsSnapshot;
    const id = selected.id.replace(/^properties\//, "");
    const base = `https://analytics.google.com/analytics/web/?vistrial=ga4&property=${id}`;
    return [
      { url: `${base}&view=overview`, title: `Your Google Analytics: ${selected.label} (last 28 days)`, excerpt: analyticsLine(snapshot) },
      ...(snapshot.sources.length
        ? [
            {
              url: `${base}&view=sources`,
              title: `Your traffic sources: ${selected.label}`,
              excerpt:
                snapshot.sources
                  .slice(0, 5)
                  .map((row) => `${row.name}: ${n(row.sessions)} sessions, ${n(row.keyEvents)} key events`)
                  .join("; ") + ". As reported by Google Analytics.",
            },
          ]
        : []),
      ...(snapshot.pages.length
        ? [
            {
              url: `${base}&view=pages`,
              title: `Your landing pages: ${selected.label}`,
              excerpt:
                snapshot.pages
                  .slice(0, 5)
                  .map((row) => `${row.path}: ${n(row.sessions)} sessions, ${n(row.keyEvents)} key events`)
                  .join("; ") + ". As reported by Google Analytics.",
            },
          ]
        : []),
    ];
  }
  return [];
}

const LABEL: Record<string, string> = { google_analytics: "Your Google Analytics" };

/** Saves (or refreshes) each granted Google data connection's totals as sources on the project. */
export async function saveGoogleSourcesFor(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; project: Doc<"researchProjects">; runId: Id<"agentRuns">; agentSlug: string },
): Promise<GoogleKnown[]> {
  if (args.project.clientId) return [];
  const connections = await ctx.db
    .query("integrationConnections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId))
    .take(50);
  const known: GoogleKnown[] = [];
  for (const connection of connections) {
    if (!LABEL[connection.provider] || connection.status !== "connected" || !connection.selected) continue;
    if (!(connection.agents ?? [GROWTH_ARCHITECT]).includes(args.agentSlug)) continue;
    const summary = await ctx.db
      .query("integrationSnapshots")
      .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", args.workspaceId).eq("provider", connection.provider).eq("kind", "summary"))
      .unique();
    if (!summary || (summary.data as { selectedId?: string }).selectedId !== connection.selected.id) continue;
    const rows = rowsFor(connection.provider, connection, summary.data);
    for (const row of rows) {
      const canonical = canonicalUrl(row.url) ?? row.url;
      const existing = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", args.workspaceId).eq("projectId", args.project._id).eq("canonicalUrl", canonical))
        .unique();
      const fields = {
        title: row.title.slice(0, 200),
        excerpt: row.excerpt.slice(0, 300),
        publisher: connection.selected.label.slice(0, 120),
        observedAt: summary.syncedAt,
        runId: args.runId,
        limitation: "Your own results as Google reports them. Not a competitor's.",
      };
      if (existing) await ctx.db.patch(existing._id, fields);
      else
        await ctx.db.insert("sourceRefs", {
          workspaceId: args.workspaceId,
          projectId: args.project._id,
          origin: "supplied",
          platform: "customerData",
          kind: "dataset",
          url: row.url,
          canonicalUrl: canonical,
          availability: "available",
          ...fields,
        });
    }
    if (rows.length)
      known.push({ key: `connection:${connection.provider}`, label: `${LABEL[connection.provider]}: ${connection.selected.label}`, value: rows[0].excerpt, recordedAt: summary.syncedAt });
  }
  return known;
}
