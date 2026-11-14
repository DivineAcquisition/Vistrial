/**
 * The calls the Objection Playbook counts (docs/rebuild/dealmaker.md, 0.8 and 4.5): passing call reviews and the
 * closer's notes, newest first, each with the deal's state from the CRM and the rep by name. A noted call that was
 * reviewed counts once. Read by the Playbook screen and by the talk-track run.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { settingsOf } from "../../playbookInterview";
import { crmFor } from "../crm/read";
import { OBJECTION_LIMITS, outcomeOf, reviewObjections, type HeardCall } from "./objections";
import { crmUserNames } from "./roles";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

/** The calls the business reviewed (passing reviews only) or noted, newest first. A noted call that was reviewed counts once. */
export async function heardCalls(ctx: Pick<QueryCtx, "db">, scope: Scope): Promise<HeardCall[]> {
  const [reviews, notes] = await Promise.all([
    ctx.db
      .query("callReviews")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(OBJECTION_LIMITS.calls),
    ctx.db
      .query("callNotes")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(OBJECTION_LIMITS.calls),
  ]);
  const passed = reviews.filter((row): row is Doc<"callReviews"> & { view: NonNullable<Doc<"callReviews">["view"]> } => row.status === "ready" && Boolean(row.view?.checksPassed));
  const reviewedNotes = new Set(passed.flatMap((row) => (row.callNoteId ? [row.callNoteId] : [])));
  const noteOf = new Map(notes.map((row) => [row._id, row]));

  const crm = await crmFor(ctx, scope);
  const dealRefs = [...new Set([...passed.map((row) => row.dealRef), ...notes.map((row) => row.dealRef)].filter((ref): ref is string => Boolean(ref)))];
  const deals = new Map(crm ? (await Promise.all(dealRefs.map(async (ref) => [ref, await crm.deal(ref)] as const))) : []);
  const settings = await settingsOf(ctx, scope);
  const members = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId))
    .take(500);
  const owners = [...new Set([...deals.values()].flatMap((deal) => (deal?.ownerRef ? [deal.ownerRef] : [])))];
  const repNames = crmUserNames(owners, settings?.team ?? [], (memberId) => members.find((member) => member._id === memberId)?.displayName ?? null);
  const repOf = (dealRef: string | undefined) => {
    const owner = dealRef ? deals.get(dealRef)?.ownerRef : null;
    return owner ? (repNames.get(owner) ?? null) : null;
  };

  const fromReviews: HeardCall[] = passed.map((row) => {
    const note = row.callNoteId ? noteOf.get(row.callNoteId) : undefined;
    return {
      id: row._id,
      from: "review",
      at: row.createdAt,
      leadName: row.leadName,
      dealRef: row.dealRef ?? null,
      rep: repOf(row.dealRef) ?? note?.writtenBy ?? null,
      outcome: outcomeOf(row.dealRef ? deals.get(row.dealRef)?.status : null, note?.outcome),
      objections: reviewObjections(row.view),
    };
  });
  const fromNotes: HeardCall[] = notes
    .filter((row) => !reviewedNotes.has(row._id) && row.outcome !== "noShow")
    .map((row) => ({
      id: row._id,
      from: "notes",
      at: row.createdAt,
      leadName: row.leadName,
      dealRef: row.dealRef ?? null,
      rep: repOf(row.dealRef) ?? row.writtenBy,
      outcome: outcomeOf(row.dealRef ? deals.get(row.dealRef)?.status : null, row.outcome),
      // The closer's account: heard, never quoted, and not known to be answered.
      objections: row.objections.map((item) => ({ title: item.title, itemId: item.itemId ?? null, quote: null, answered: false, answerQuote: null })),
    }));
  return [...fromReviews, ...fromNotes].sort((a, b) => b.at - a.at).slice(0, OBJECTION_LIMITS.calls);
}

