/**
 * Reference material copied in from another organization of the same account, as an agent sees it.
 * docs/rebuild/organizations-and-clients.md, section 11.
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { KnownItem } from "./businessContext";

/** What may be copied: an approved report or offer analysis. Nothing made for a client, and nothing else. */
export const COPYABLE_KINDS = ["researchReport", "marketReport", "offerAnalysis"] as const;
export const KIND_WORDS: Record<string, string> = { researchReport: "Research report", marketReport: "Market report", offerAnalysis: "Offer analysis" };

/** The most an organization may hold, and the most of one piece that is kept. */
export const MAX_REFERENCES = 20;
export const MAX_REFERENCE_CHARS = 60_000;
/** How many an agent is shown, newest first, and how much of each. */
export const CONTEXT_REFERENCES = 5;
export const CONTEXT_CHARS = 1_500;

export const REFERENCE_HEADING = "Reference from another of your organizations (not a fact about this business)";

function excerpt(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > CONTEXT_CHARS ? `${text.slice(0, CONTEXT_CHARS).trimEnd()}…` : text;
}

/** The newest copied pieces as known items, each labelled with the organization it came from. */
export async function referencesKnown(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<KnownItem[]> {
  const rows = await ctx.db
    .query("sharedReferences")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(CONTEXT_REFERENCES);
  return rows.map((row) => ({
    key: `reference:${row._id}`,
    label: `${REFERENCE_HEADING}: "${row.title}", from ${row.fromName}`,
    value: excerpt(row.body),
    origin: "reference" as const,
    status: "reference",
    recordedAt: row.copiedAt,
  }));
}
