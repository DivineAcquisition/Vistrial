/**
 * The Objection Playbook in the Playbook's Objections folder (Dealmaker; docs/rebuild/dealmaker.md, 0.8 and 4.5).
 * This part is code only: the counts, the lead's own words, what was said back on calls that later closed, and
 * per rep for the Owner, worked out from the passing call reviews and the closer's notes each time it is read.
 * The figures live in lib/dealmaker/objections.ts.
 *
 * People can add the starter set (labelled "not yet heard on your calls") and add an objection heard on a call
 * that the Playbook does not hold yet. Neither reaches a lead.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { OBJECTION_LIMITS, STARTER_OBJECTIONS, titleKey, objectionPlaybook, outcomeOf, reviewObjections, type HeardCall } from "./lib/dealmaker/objections";
import { crmUserNames, dealScope, type TeamRow } from "./lib/dealmaker/roles";
import { LIMITS, PLAYBOOK_TEXT, basisFor, clean, itemsOf, objectionTag } from "./lib/playbook";
import { settingsOf } from "./playbookInterview";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** The calls the business reviewed (passing reviews only) or noted, newest first. A noted call that was reviewed counts once. */
async function heardCalls(ctx: Pick<QueryCtx, "db">, scope: Scope): Promise<HeardCall[]> {
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

/** The Objection Playbook for the organization or a client. */
export const view = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const items = (await itemsOf(ctx, scope)).filter((row) => row.kind === "objection");
    const calls = await heardCalls(ctx, scope);
    const settings = await settingsOf(ctx, scope);
    const team = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    // Leads' names are shown to those who see every deal; per rep, to the Owner only (0.8).
    const showLeads = dealScope(ctx.member.role, team).kind === "all";
    const result = objectionPlaybook({
      items: items.map((row) => ({ id: row._id, title: row.title, tag: row.tag ?? null, starter: row.source.type === "starter" })),
      calls,
      showLeads,
      showReps: ctx.role === "owner",
    });
    const held = new Set(items.map((row) => titleKey(row.title)));
    return {
      ...result,
      starterMissing: STARTER_OBJECTIONS.filter((row) => !held.has(titleKey(row.title))).length,
      canEdit: ctx.role !== "viewer",
      isOwner: ctx.role === "owner",
    };
  },
});

/** Adds the starter objections the Playbook does not hold yet, each labelled "not yet heard on your calls". */
export const addStarter = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const live = await itemsOf(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    const held = new Set(live.filter((row) => row.kind === "objection").map((row) => titleKey(row.title)));
    const missing = STARTER_OBJECTIONS.filter((row) => !held.has(titleKey(row.title)));
    if (live.length + missing.length > LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
    const now = Date.now();
    for (const row of missing) {
      await ctx.db.insert("playbookItems", {
        workspaceId: ctx.workspaceId,
        ...forClient,
        folder: "objections",
        kind: "objection",
        tag: row.tag,
        title: row.title,
        body: row.body,
        source: { type: "starter" },
        basis: basisFor("starter"),
        status: "active",
        createdBy: ctx.identity.subject,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.starter_objections_added", subject: forClient.clientId ?? ctx.workspaceId, count: missing.length });
    return missing.length;
  },
});

/**
 * A person adds an objection heard on a reviewed call to the Objections folder. It is filed as from that call;
 * the quote kept is the buyer's own words from the review, only when the review has them.
 */
export const addHeard = workspaceMutation({
  args: { reviewId: v.id("callReviews"), title: v.string(), tag: objectionTag },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.workspaceId !== ctx.workspaceId || review.status !== "ready" || !review.view) notFound();
    ctx.clients.require(review.clientId);
    const title = clean(args.title, LIMITS.title);
    if (!title) throw userError(PLAYBOOK_TEXT.emptyTitle);
    const scope = { workspaceId: ctx.workspaceId, ...(review.clientId ? { clientId: review.clientId } : {}) };
    const live = await itemsOf(ctx, scope);
    if (live.length >= LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
    const existing = live.find((row) => row.kind === "objection" && titleKey(row.title) === titleKey(title));
    if (existing) return existing._id;
    const said = review.view.objections.find((row) => titleKey(row.text) === titleKey(args.title) && row.kind === "Buyer's words");
    const now = Date.now();
    const id = await ctx.db.insert("playbookItems", {
      ...scope,
      folder: "objections",
      kind: "objection",
      tag: args.tag,
      title,
      body: "",
      ...(said ? { quote: said.quote } : {}),
      source: { type: "call", ref: review._id, label: `Call review: ${review.leadName}` },
      basis: basisFor("call"),
      status: "active",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.item_added", subject: id });
    return id;
  },
});
