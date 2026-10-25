import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { canSeeLead, leadOwnerId } from "./lib/canSeeLead";
import { notAllowed, notFound } from "./lib/errors";
import { leadMutation, leadQuery } from "./lib/leadBuilders";
import { normalizeEmail, normalizeFullName, toE164 } from "./lib/phones";
import { defaultCountry, firstOpenStage } from "./lib/seedSpine";
import { ownerMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import type { MemberAccess } from "./lib/builders";

const leadStatus = v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("closed"));

type ReadCtx = QueryCtx & MemberAccess;

function ownerFor(member: Doc<"members">, requested?: Id<"members">) {
  if (member.role === "rep") return member._id;
  return requested;
}

export const list = workspaceQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    stageId: v.optional(v.id("pipelineStages")),
    status: v.optional(leadStatus),
    source: v.optional(v.string()),
    ownerMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const owner = ownerFor(ctx.member, args.ownerMemberId);
    const page = await queryLeads(ctx, {
      owner,
      stageId: args.stageId,
      status: args.status,
      source: args.source,
      paginationOpts: args.paginationOpts,
    });
    const rows = [];
    for (const lead of page.page) {
      if (!canSeeLead(ctx.member, lead)) continue;
      const person = lead.personId ? await ctx.db.get(lead.personId) : null;
      const stage = lead.stageId ? await ctx.db.get(lead.stageId) : null;
      rows.push({
        id: lead._id,
        name: person?.displayName ?? "",
        ownerMemberId: leadOwnerId(lead) ?? null,
        stageId: lead.stageId ?? null,
        stageName: stage?.name ?? "",
        status: lead.status ?? "open",
        source: lead.source ?? "",
        lastActivityAt: lead.lastActivityAt ?? null,
      });
    }
    return { ...page, page: rows };
  },
});

async function queryLeads(
  ctx: ReadCtx,
  args: {
    owner?: Id<"members">;
    stageId?: Id<"pipelineStages">;
    status?: Doc<"leads">["status"];
    source?: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
) {
  const workspaceId = ctx.workspaceId;
  const base = ctx.db.query("leads");
  const page = args.paginationOpts;
  const owner = args.owner;
  const stageId = args.stageId;
  const status = args.status;
  const source = args.source;
  if (owner && stageId && status && source) {
    return base
      .withIndex("by_workspace_owner_stage_status_source_activity", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("ownerMemberId", owner)
          .eq("stageId", stageId)
          .eq("status", status)
          .eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && stageId && status) {
    return base
      .withIndex("by_workspace_owner_stage_status_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("stageId", stageId).eq("status", status),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && stageId && source) {
    return base
      .withIndex("by_workspace_owner_stage_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("stageId", stageId).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && status && source) {
    return base
      .withIndex("by_workspace_owner_status_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("status", status).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (stageId && status && source) {
    return base
      .withIndex("by_workspace_stage_status_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("stageId", stageId).eq("status", status).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && stageId) {
    return base
      .withIndex("by_workspace_owner_stage_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("stageId", stageId),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && status) {
    return base
      .withIndex("by_workspace_owner_status_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("status", status),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner && source) {
    return base
      .withIndex("by_workspace_owner_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (stageId && status) {
    return base
      .withIndex("by_workspace_stage_status_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("stageId", stageId).eq("status", status),
      )
      .order("desc")
      .paginate(page);
  }
  if (stageId && source) {
    return base
      .withIndex("by_workspace_stage_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("stageId", stageId).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (status && source) {
    return base
      .withIndex("by_workspace_status_source_activity", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", status).eq("source", source),
      )
      .order("desc")
      .paginate(page);
  }
  if (owner) {
    return base
      .withIndex("by_workspace_owner_activity", (q) => q.eq("workspaceId", workspaceId).eq("ownerMemberId", owner))
      .order("desc")
      .paginate(page);
  }
  if (stageId) {
    return base
      .withIndex("by_workspace_stage_activity", (q) => q.eq("workspaceId", workspaceId).eq("stageId", stageId))
      .order("desc")
      .paginate(page);
  }
  if (status) {
    return base
      .withIndex("by_workspace_status_activity", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .order("desc")
      .paginate(page);
  }
  if (source) {
    return base
      .withIndex("by_workspace_source_activity", (q) => q.eq("workspaceId", workspaceId).eq("source", source))
      .order("desc")
      .paginate(page);
  }
  return base
    .withIndex("by_workspace_activity", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .paginate(page);
}

export const get = leadQuery({
  args: {},
  handler: async (ctx) => {
    const person = ctx.lead.personId ? await ctx.db.get(ctx.lead.personId) : null;
    const stage = ctx.lead.stageId ? await ctx.db.get(ctx.lead.stageId) : null;
    const owner = leadOwnerId(ctx.lead);
    const ownerMember = owner ? await ctx.db.get(owner) : null;
    return {
      id: ctx.lead._id,
      personId: ctx.lead.personId ?? null,
      name: person?.displayName ?? "",
      ownerMemberId: owner ?? null,
      ownerName: ownerMember?.displayName ?? "",
      stageId: ctx.lead.stageId ?? null,
      stageName: stage?.name ?? "",
      source: ctx.lead.source ?? "",
      status: ctx.lead.status ?? "open",
      historic: ctx.lead.historic ?? false,
      lastActivityAt: ctx.lead.lastActivityAt ?? null,
      doNotContact: person?.doNotContact ?? false,
      emailConsent: person?.emailConsent ?? "unknown",
      textConsent: person?.textConsent ?? "unknown",
      callConsent: person?.callConsent ?? "unknown",
    };
  },
});

export const assign = leadMutation({
  args: { ownerMemberId: v.id("members") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const assignee = await ctx.db.get(args.ownerMemberId);
    if (!assignee || assignee.workspaceId !== ctx.workspaceId || !assignee.active) notFound();
    await ctx.db.patch(ctx.lead._id, { ownerMemberId: assignee._id });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "lead.assigned",
      subject: ctx.lead._id,
    });
    return null;
  },
});

export const create = workspaceMutation({
  args: {
    displayName: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    ownerMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const owner = ctx.member.role === "rep" ? ctx.member._id : args.ownerMemberId ?? ctx.member._id;
    const assignee = await ctx.db.get(owner);
    if (!assignee || assignee.workspaceId !== ctx.workspaceId || !assignee.active) notFound();
    const country = await defaultCountry(ctx, ctx.workspaceId);
    const email = args.email ? normalizeEmail(args.email) : null;
    const phone = args.phone ? toE164(args.phone, country) : null;
    if (args.phone && !phone) throw new Error("That phone number cannot be read.");
    if (!email && !phone) throw new Error("Add an email or a phone.");
    const now = Date.now();
    const personId = await attachOrCreatePerson(ctx, {
      email,
      phone,
      displayName: args.displayName.trim() || "Unknown",
      firstName: args.firstName?.trim() ?? "",
      lastName: args.lastName?.trim() ?? "",
      source: "manual",
      at: now,
    });
    if (personId === "split") throw new Error("That email and phone belong to two people. Review the match.");
    const stage = await firstOpenStage(ctx, ctx.workspaceId);
    const leadId = await ctx.db.insert("leads", {
      workspaceId: ctx.workspaceId,
      personId,
      stageId: stage._id,
      source: "manual",
      ownerMemberId: owner,
      status: "open",
      historic: false,
      lastActivityAt: now,
      createdAt: now,
    });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId,
      kind: "lead.created",
      refTable: "leads",
      refId: leadId,
      at: now,
      actorMemberId: ctx.member._id,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "lead.created",
      subject: leadId,
    });
    return leadId;
  },
});

export async function attachOrCreatePerson(
  ctx: MutationCtx & { workspaceId: Id<"workspaces"> },
  input: {
    email: string | null;
    phone: string | null;
    displayName: string;
    firstName: string;
    lastName: string;
    source: string;
    at: number;
    similarNameBudget?: { kept: number; seen: number };
  },
): Promise<Id<"people"> | "split"> {
  const emailHit = input.email ? await findIdentity(ctx, "email", input.email) : null;
  const phoneHit = input.phone ? await findIdentity(ctx, "phone", input.phone) : null;
  if (emailHit && phoneHit && emailHit !== phoneHit) return "split";
  const existing = emailHit ?? phoneHit;
  if (existing) {
    if (input.email && !emailHit) await addIdentity(ctx, existing, "email", input.email, input.source);
    if (input.phone && !phoneHit) await addIdentity(ctx, existing, "phone", input.phone, input.source);
    return existing;
  }
  const normalizedName = normalizeFullName(input.displayName);
  const personId = await ctx.db.insert("people", {
    workspaceId: ctx.workspaceId,
    displayName: input.displayName,
    normalizedName,
    firstName: input.firstName,
    lastName: input.lastName,
    emailConsent: "unknown",
    textConsent: "unknown",
    callConsent: "unknown",
    consentSource: input.source,
    doNotContact: false,
    createdFromSource: input.source,
  });
  if (input.email) await addIdentity(ctx, personId, "email", input.email, input.source);
  if (input.phone) await addIdentity(ctx, personId, "phone", input.phone, input.source);
  if (normalizedName && input.similarNameBudget && input.similarNameBudget.kept < 50) {
    const same = await ctx.db
      .query("people")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", ctx.workspaceId).eq("normalizedName", normalizedName))
      .take(5);
    const other = same.find((person) => person._id !== personId && !person.mergedIntoPersonId);
    if (other) {
      input.similarNameBudget.seen += 1;
      input.similarNameBudget.kept += 1;
      await ctx.db.insert("possibleMatches", {
        workspaceId: ctx.workspaceId,
        personAId: other._id,
        personBId: personId,
        reason: "similar_name",
        status: "pending",
      });
    }
  } else if (normalizedName && input.similarNameBudget) {
    const same = await ctx.db
      .query("people")
      .withIndex("by_workspace_name", (q) => q.eq("workspaceId", ctx.workspaceId).eq("normalizedName", normalizedName))
      .take(2);
    if (same.some((person) => person._id !== personId)) input.similarNameBudget.seen += 1;
  }
  return personId;
}

async function findIdentity(
  ctx: MutationCtx & { workspaceId: Id<"workspaces"> },
  kind: "email" | "phone",
  value: string,
) {
  const row = await ctx.db
    .query("identities")
    .withIndex("by_workspace_kind_value", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", kind).eq("value", value))
    .unique();
  if (!row) return null;
  const person = await ctx.db.get(row.personId);
  if (!person || person.mergedIntoPersonId) return person?.mergedIntoPersonId ?? null;
  return person._id;
}

async function addIdentity(
  ctx: MutationCtx & { workspaceId: Id<"workspaces"> },
  personId: Id<"people">,
  kind: "email" | "phone",
  value: string,
  source: string,
) {
  const existing = await ctx.db
    .query("identities")
    .withIndex("by_workspace_kind_value", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", kind).eq("value", value))
    .unique();
  if (existing) return;
  await ctx.db.insert("identities", { workspaceId: ctx.workspaceId, personId, kind, value, source });
}

export const search = workspaceQuery({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text) return [];
    const country = await defaultCountry(ctx, ctx.workspaceId);
    const email = text.includes("@") ? normalizeEmail(text) : null;
    const phone = toE164(text, country);
    let personIds: Id<"people">[] = [];
    if (email) {
      const row = await ctx.db
        .query("identities")
        .withIndex("by_workspace_kind_value", (q) =>
          q.eq("workspaceId", ctx.workspaceId).eq("kind", "email").eq("value", email),
        )
        .unique();
      if (row) personIds = [row.personId];
    } else if (phone) {
      const row = await ctx.db
        .query("identities")
        .withIndex("by_workspace_kind_value", (q) =>
          q.eq("workspaceId", ctx.workspaceId).eq("kind", "phone").eq("value", phone),
        )
        .unique();
      if (row) personIds = [row.personId];
    } else {
      const name = normalizeFullName(text);
      const people = await ctx.db
        .query("people")
        .withIndex("by_workspace_name", (q) => q.eq("workspaceId", ctx.workspaceId).eq("normalizedName", name))
        .take(25);
      personIds = people.map((person) => person._id);
    }
    const leads = [];
    for (const personId of personIds) {
      const rows = await ctx.db
        .query("leads")
        .withIndex("by_workspace_person", (q) => q.eq("workspaceId", ctx.workspaceId).eq("personId", personId))
        .take(25);
      for (const lead of rows) {
        if (!canSeeLead(ctx.member, lead)) continue;
        const person = await ctx.db.get(personId);
        leads.push({ id: lead._id, name: person?.displayName ?? "" });
        if (leads.length >= 25) return leads;
      }
    }
    return leads;
  },
});

export const stages = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("pipelineStages")
      .withIndex("by_workspace_sort", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(20);
    return rows.map((stage) => ({ id: stage._id, name: stage.name, sort: stage.sort, kind: stage.kind, meaning: stage.meaning }));
  },
});

export const updateStage = ownerMutation({
  args: { stageId: v.id("pipelineStages"), name: v.string(), meaning: v.string(), sort: v.number() },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.workspaceId !== ctx.workspaceId) notFound();
    await ctx.db.patch(stage._id, { name: args.name.trim(), meaning: args.meaning.trim(), sort: args.sort });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "stage.updated",
      subject: stage._id,
    });
    return null;
  },
});

export const country = workspaceQuery({
  args: {},
  handler: async (ctx) => defaultCountry(ctx, ctx.workspaceId),
});

export const setCountry = ownerMutation({
  args: { country: v.string() },
  handler: async (ctx, args) => {
    const country = args.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new Error("Use a two letter country code.");
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!settings) notFound();
    await ctx.db.patch(settings._id, { defaultCountry: country });
    return null;
  },
});
