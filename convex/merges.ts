import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { writeAudit } from "./lib/audit";
import { mergeConsent, type ConsentSnapshot } from "./lib/consent";
import { notAllowed, notFound } from "./lib/errors";
import { workspaceMutation, workspaceQuery } from "./lib/builders";

const SIMILAR_CAP = 50;

export const listMatches = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role === "rep") notAllowed();
    const rows = await ctx.db
      .query("possibleMatches")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "pending"))
      .take(SIMILAR_CAP);
    const visible = [];
    for (const row of rows) {
      const left = await ctx.db.get(row.personAId);
      const right = await ctx.db.get(row.personBId);
      visible.push({
        id: row._id,
        reason: row.reason,
        left: left ? { id: left._id, name: left.displayName } : null,
        right: right ? { id: right._id, name: right.displayName } : null,
      });
    }
    return visible;
  },
});

export const listMerges = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.member.role === "rep") notAllowed();
    const rows = await ctx.db
      .query("mergeRecords")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(20);
    const visible = [];
    for (const row of rows) {
      if (row.revertedAt !== undefined) continue;
      const survivor = await ctx.db.get(row.survivorPersonId);
      const merged = await ctx.db.get(row.mergedPersonId);
      visible.push({
        id: row._id,
        at: row.at,
        survivor: survivor ? { id: survivor._id, name: survivor.displayName } : null,
        merged: merged ? { id: merged._id, name: merged.displayName } : null,
      });
    }
    return visible;
  },
});

export const dismiss = workspaceMutation({
  args: { matchId: v.id("possibleMatches") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const match = await ctx.db.get(args.matchId);
    if (!match || match.workspaceId !== ctx.workspaceId) notFound();
    await ctx.db.patch(match._id, { status: "dismissed" });
    if (match.sourceRecordId) {
      const related = await ctx.db
        .query("possibleMatches")
        .withIndex("by_workspace_record", (q) =>
          q.eq("workspaceId", ctx.workspaceId).eq("sourceRecordId", match.sourceRecordId),
        )
        .take(10);
      for (const row of related) {
        if (row.status === "pending") await ctx.db.patch(row._id, { status: "dismissed" });
      }
      const record = await ctx.db.get(match.sourceRecordId);
      if (record) await ctx.db.patch(record._id, { status: "skipped" });
    }
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "match.dismissed",
      subject: match._id,
    });
    return null;
  },
});

export const merge = workspaceMutation({
  args: { matchId: v.optional(v.id("possibleMatches")), survivorPersonId: v.id("people"), mergedPersonId: v.id("people") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    return mergePeople(ctx, args.survivorPersonId, args.mergedPersonId, ctx.member._id, args.matchId);
  },
});

export async function mergePeople(
  ctx: {
    db: import("./_generated/server").MutationCtx["db"];
    workspaceId: Id<"workspaces">;
    identity: { subject: string };
  },
  survivorPersonId: Id<"people">,
  mergedPersonId: Id<"people">,
  performedBy: Id<"members">,
  matchId?: Id<"possibleMatches">,
) {
  if (survivorPersonId === mergedPersonId) notFound();
  const survivor = await ctx.db.get(survivorPersonId);
  const merged = await ctx.db.get(mergedPersonId);
  if (!survivor || !merged || survivor.workspaceId !== ctx.workspaceId || merged.workspaceId !== ctx.workspaceId) notFound();
  if (survivor.mergedIntoPersonId || merged.mergedIntoPersonId) notFound();
  const prior: ConsentSnapshot = {
    emailConsent: survivor.emailConsent,
    textConsent: survivor.textConsent,
    callConsent: survivor.callConsent,
    doNotContact: survivor.doNotContact,
    optedOutAt: survivor.optedOutAt,
  };
  const next = mergeConsent(prior, {
    emailConsent: merged.emailConsent,
    textConsent: merged.textConsent,
    callConsent: merged.callConsent,
    doNotContact: merged.doNotContact,
    optedOutAt: merged.optedOutAt,
  });
  const identityIds: Id<"identities">[] = [];
  const identities = await ctx.db
    .query("identities")
    .withIndex("by_workspace_person", (q) => q.eq("workspaceId", ctx.workspaceId).eq("personId", mergedPersonId))
    .take(50);
  for (const identity of identities) {
    identityIds.push(identity._id);
    await ctx.db.patch(identity._id, { personId: survivorPersonId });
  }
  const leadIds: Id<"leads">[] = [];
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_workspace_person", (q) => q.eq("workspaceId", ctx.workspaceId).eq("personId", mergedPersonId))
    .take(100);
  for (const lead of leads) {
    leadIds.push(lead._id);
    await ctx.db.patch(lead._id, { personId: survivorPersonId });
  }
  await ctx.db.patch(survivorPersonId, {
    emailConsent: next.emailConsent,
    textConsent: next.textConsent,
    callConsent: next.callConsent,
    doNotContact: next.doNotContact,
    optedOutAt: next.optedOutAt,
  });
  await ctx.db.patch(mergedPersonId, { mergedIntoPersonId: survivorPersonId });
  const pending = await ctx.db
    .query("possibleMatches")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "pending"))
    .take(SIMILAR_CAP);
  for (const pendingMatch of pending) {
    const pair = [pendingMatch.personAId, pendingMatch.personBId];
    if (pair.includes(survivorPersonId) && pair.includes(mergedPersonId)) {
      await ctx.db.patch(pendingMatch._id, { status: "merged" });
    }
  }
  const latest = await ctx.db
    .query("mergeRecords")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .order("desc")
    .take(1);
  const at = Math.max(Date.now(), (latest[0]?.at ?? 0) + 1);
  const mergeId = await ctx.db.insert("mergeRecords", {
    workspaceId: ctx.workspaceId,
    survivorPersonId,
    mergedPersonId,
    performedBy,
    at,
    snapshotJson: JSON.stringify({ prior, identityIds, leadIds }),
  });
  if (matchId) {
    const match = await ctx.db.get(matchId);
    if (match && match.workspaceId === ctx.workspaceId) await ctx.db.patch(match._id, { status: "merged" });
  }
  await replayHeld(ctx, performedBy);
  await ctx.db.insert("auditLog", {
    workspaceId: ctx.workspaceId,
    actorType: "user",
    actorId: ctx.identity.subject,
    action: "person.merged",
    subject: mergeId,
    createdAt: at,
  });
  return mergeId;
}

/**
 * Replay a held split after review.
 * Dismiss marks the source row skipped, so it is never replayed.
 * A needs_review row is replayed only when its email and phone now resolve to one person
 * (mergedIntoPersonId is followed) and it has a source activity time.
 * That creates one lead at the source time, owned by the member who started the import.
 * Historic rows do not write lead.created. Undo does not delete the replayed lead.
 * At most 50 held rows are considered per merge.
 */
async function replayHeld(
  ctx: { db: import("./_generated/server").MutationCtx["db"]; workspaceId: Id<"workspaces"> },
  fallbackOwner: Id<"members">,
) {
  const held = await ctx.db
    .query("sourceRecords")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "needs_review"))
    .take(50);
  for (const record of held) {
    const emailPerson = record.normalizedEmail ? await personFor(ctx, "email", record.normalizedEmail) : null;
    const phonePerson = record.normalizedPhone ? await personFor(ctx, "phone", record.normalizedPhone) : null;
    if (emailPerson && phonePerson && emailPerson !== phonePerson) continue;
    const personId = emailPerson ?? phonePerson;
    if (!personId) continue;
    if (record.leadId) {
      await ctx.db.patch(record._id, { status: "applied" });
      await markRecordMatches(ctx, record._id, "merged");
      continue;
    }
    if (record.activityAt === undefined) continue;
    const stage = await ctx.db
      .query("pipelineStages")
      .withIndex("by_workspace_sort", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(5);
    const open = stage.find((row) => row.kind === "open");
    if (!open) continue;
    let ownerId = fallbackOwner;
    if (record.importRunId) {
      const run = await ctx.db.get(record.importRunId);
      if (run) ownerId = run.startedBy;
    }
    const leadId = await ctx.db.insert("leads", {
      workspaceId: ctx.workspaceId,
      personId,
      stageId: open._id,
      source: record.source,
      ownerMemberId: ownerId,
      status: "open",
      historic: record.historic,
      lastActivityAt: record.activityAt,
      createdAt: record.activityAt,
    });
    await ctx.db.patch(record._id, { status: "applied", leadId });
    await markRecordMatches(ctx, record._id, "merged");
    if (!record.historic) {
      await ctx.db.insert("leadTimeline", {
        workspaceId: ctx.workspaceId,
        leadId,
        kind: "lead.created",
        refTable: "leads",
        refId: leadId,
        at: record.activityAt,
      });
    }
  }
}

async function markRecordMatches(
  ctx: { db: import("./_generated/server").MutationCtx["db"]; workspaceId: Id<"workspaces"> },
  sourceRecordId: Id<"sourceRecords">,
  status: "merged" | "dismissed",
) {
  const related = await ctx.db
    .query("possibleMatches")
    .withIndex("by_workspace_record", (q) => q.eq("workspaceId", ctx.workspaceId).eq("sourceRecordId", sourceRecordId))
    .take(10);
  for (const row of related) {
    if (row.status === "pending") await ctx.db.patch(row._id, { status });
  }
}

async function personFor(
  ctx: { db: import("./_generated/server").MutationCtx["db"]; workspaceId: Id<"workspaces"> },
  kind: "email" | "phone",
  value: string,
) {
  const row = await ctx.db
    .query("identities")
    .withIndex("by_workspace_kind_value", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", kind).eq("value", value))
    .unique();
  if (!row) return null;
  const person = await ctx.db.get(row.personId);
  if (!person) return null;
  return person.mergedIntoPersonId ?? person._id;
}

export const undo = workspaceMutation({
  args: { mergeId: v.id("mergeRecords") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const record = await ctx.db.get(args.mergeId);
    if (!record || record.workspaceId !== ctx.workspaceId || record.revertedAt !== undefined) notFound();
    const survivor = await ctx.db.get(record.survivorPersonId);
    if (!survivor || survivor.mergedIntoPersonId) throw new Error("This merge cannot be undone.");
    const absorbedLater = await ctx.db
      .query("mergeRecords")
      .withIndex("by_workspace_merged", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("mergedPersonId", record.survivorPersonId),
      )
      .take(10);
    const survivorLater = await ctx.db
      .query("mergeRecords")
      .withIndex("by_workspace_survivor", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("survivorPersonId", record.survivorPersonId),
      )
      .take(10);
    const blocked = [...absorbedLater, ...survivorLater].some(
      (row) => row._id !== record._id && row.revertedAt === undefined && row.at > record.at,
    );
    if (blocked) throw new Error("This merge cannot be undone.");
    const snapshot = JSON.parse(record.snapshotJson) as {
      prior: ConsentSnapshot;
      identityIds: Id<"identities">[];
      leadIds: Id<"leads">[];
    };
    for (const identityId of snapshot.identityIds) {
      const identity = await ctx.db.get(identityId);
      if (identity) await ctx.db.patch(identityId, { personId: record.mergedPersonId });
    }
    for (const leadId of snapshot.leadIds) {
      const lead = await ctx.db.get(leadId);
      if (lead) await ctx.db.patch(leadId, { personId: record.mergedPersonId });
    }
    await ctx.db.patch(record.survivorPersonId, {
      emailConsent: snapshot.prior.emailConsent,
      textConsent: snapshot.prior.textConsent,
      callConsent: snapshot.prior.callConsent,
      doNotContact: snapshot.prior.doNotContact,
      optedOutAt: snapshot.prior.optedOutAt,
    });
    await ctx.db.patch(record.mergedPersonId, { mergedIntoPersonId: undefined });
    await ctx.db.patch(record._id, { revertedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "person.merge_undone",
      subject: record._id,
    });
    return null;
  },
});
