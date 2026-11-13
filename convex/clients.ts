/**
 * Clients: who an organization serves. A business client has a company profile; a person client has
 * their goals and where they are now. Agent work is done for the organization itself or for one client.
 * Owners and Admins add, edit and archive clients and choose who can see each one. A Member or Viewer
 * sees only the clients they are assigned to. Clients never log in.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { adminMutation, adminQuery, workspaceQuery, type MemberAccess } from "./lib/builders";
import { clientHere } from "./lib/clients";
import { notFound, userError } from "./lib/errors";
import { ROLE_ORDER, isAdmin, roleOf } from "./lib/roles";

export const MAX_CLIENTS = 500;
const MAX_NAME = 80;
const MAX_FIELD = 2000;

const businessFields = v.object({
  website: v.optional(v.string()),
  industry: v.optional(v.string()),
  offer: v.optional(v.string()),
  audience: v.optional(v.string()),
  geography: v.optional(v.string()),
  notes: v.optional(v.string()),
});
const personFields = v.object({ goals: v.optional(v.string()), currentState: v.optional(v.string()), notes: v.optional(v.string()) });

const clip = (text: string | undefined) => (text ?? "").trim().slice(0, MAX_FIELD);
export const normalName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw userError("Name the client.");
  if (clean.length > MAX_NAME) throw userError(`Keep the name under ${MAX_NAME} characters.`);
  return clean;
}

function cleanBusiness(input: { website?: string; industry?: string; offer?: string; audience?: string; geography?: string; notes?: string } | undefined) {
  return {
    website: clip(input?.website),
    industry: clip(input?.industry),
    offer: clip(input?.offer),
    audience: clip(input?.audience),
    geography: clip(input?.geography),
    notes: clip(input?.notes),
  };
}

function cleanPerson(input: { goals?: string; currentState?: string; notes?: string } | undefined) {
  return { goals: clip(input?.goals), currentState: clip(input?.currentState), notes: clip(input?.notes) };
}

async function clientsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, status: "active" | "archived") {
  return ctx.db
    .query("clients")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
    .order("desc")
    .take(MAX_CLIENTS);
}

async function sameName(ctx: QueryCtx, workspaceId: Id<"workspaces">, name: string, except?: Id<"clients">) {
  const wanted = normalName(name);
  return (await clientsOf(ctx, workspaceId, "active")).some((row) => row.normalizedName === wanted && row._id !== except);
}

function summary(row: Doc<"clients">) {
  return {
    id: row._id,
    type: row.type,
    name: row.name,
    status: row.status,
    /** One line under the name: what the business does, or what the person is working toward. */
    line: row.type === "business" ? row.business?.industry || row.business?.offer || "" : row.person?.goals || "",
    updatedAt: row.updatedAt,
  };
}

async function audit(ctx: MutationCtx & MemberAccess, action: string, subject: string, count?: number) {
  await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action, subject, count });
}

/**
 * The clients this member may see, by name. This is what the client picker lists. `ownWork` says whether
 * "<Organization> itself" is a choice for them, and `canManage` whether they add and assign clients.
 */
export const list = workspaceQuery({
  args: { archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = await clientsOf(ctx, ctx.workspaceId, args.archived ? "archived" : "active");
    const visible = ctx.clients.all ? rows : rows.filter((row) => ctx.clients.ids.has(row._id));
    return {
      canManage: isAdmin(ctx.role),
      ownWork: ctx.clients.ownWork,
      clients: visible.map(summary).sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/** One client's profile. A client the member is not assigned to reads as not found. */
export const get = workspaceQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const row = await clientHere(ctx, ctx.workspaceId, args.clientId);
    ctx.clients.require(row._id);
    return {
      ...summary(row),
      business: row.type === "business" ? cleanBusiness(row.business) : null,
      person: row.type === "person" ? cleanPerson(row.person) : null,
      createdAt: row.createdAt,
      archivedAt: row.archivedAt ?? null,
      canManage: isAdmin(ctx.role),
    };
  },
});

export const create = adminMutation({
  args: { type: v.union(v.literal("business"), v.literal("person")), name: v.string(), business: v.optional(businessFields), person: v.optional(personFields) },
  handler: async (ctx, args) => {
    const name = cleanName(args.name);
    if (await sameName(ctx, ctx.workspaceId, name)) throw userError("You already have a client with that name.");
    if ((await clientsOf(ctx, ctx.workspaceId, "active")).length >= MAX_CLIENTS) throw userError(`An organization can hold ${MAX_CLIENTS} clients. Archive one you no longer serve.`, "limit");
    const now = Date.now();
    const id = await ctx.db.insert("clients", {
      workspaceId: ctx.workspaceId,
      type: args.type,
      name,
      normalizedName: normalName(name),
      status: "active",
      ...(args.type === "business" ? { business: cleanBusiness(args.business) } : { person: cleanPerson(args.person) }),
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, "client.created", id, args.type === "business" ? 0 : 1);
    // A website given with the client is read straight away (siteCapture.startForClient says when it is not).
    if (args.type === "business" && args.business?.website?.trim()) await ctx.scheduler.runAfter(0, internal.siteCapture.startForClient, { clientId: id, userId: ctx.identity.subject });
    return id;
  },
});

/** Changes the name or the profile. A client's type is fixed once it is made: the two hold different things. */
export const update = adminMutation({
  args: { clientId: v.id("clients"), name: v.optional(v.string()), business: v.optional(businessFields), person: v.optional(personFields) },
  handler: async (ctx, args) => {
    const row = await clientHere(ctx, ctx.workspaceId, args.clientId);
    const patch: Partial<Doc<"clients">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = cleanName(args.name);
      if (await sameName(ctx, ctx.workspaceId, name, row._id)) throw userError("You already have a client with that name.");
      patch.name = name;
      patch.normalizedName = normalName(name);
    }
    if (row.type === "business" && args.business) patch.business = { ...cleanBusiness(row.business), ...cleanBusiness({ ...row.business, ...args.business }) };
    if (row.type === "person" && args.person) patch.person = { ...cleanPerson(row.person), ...cleanPerson({ ...row.person, ...args.person }) };
    await ctx.db.patch(row._id, patch);
    await audit(ctx, "client.updated", row._id);
    // A website added to a client that had none, or changed, is read straight away.
    const before = row.business?.website?.trim() ?? "";
    const after = patch.business?.website?.trim() ?? before;
    if (row.type === "business" && after && after !== before) await ctx.scheduler.runAfter(0, internal.siteCapture.startForClient, { clientId: row._id, userId: ctx.identity.subject });
    return null;
  },
});

/** Puts a client away, or brings one back. Its work is kept and still readable; nothing new can be made for it while archived. */
export const setArchived = adminMutation({
  args: { clientId: v.id("clients"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const row = await clientHere(ctx, ctx.workspaceId, args.clientId);
    if ((row.status === "archived") === args.archived) return null;
    if (!args.archived && (await sameName(ctx, ctx.workspaceId, row.name, row._id))) throw userError("An active client already has that name. Rename one first.");
    await ctx.db.patch(row._id, args.archived ? { status: "archived", archivedAt: Date.now(), updatedAt: Date.now() } : { status: "active", archivedAt: undefined, updatedAt: Date.now() });
    await audit(ctx, args.archived ? "client.archived" : "client.restored", row._id);
    return null;
  },
});

/* ------------------------------------------------------------ Who sees which client */

async function assignmentsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, clientId: Id<"clients">) {
  return ctx.db
    .query("clientAssignments")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", workspaceId).eq("clientId", clientId))
    .take(500);
}

async function memberHere(ctx: QueryCtx, workspaceId: Id<"workspaces">, memberId: Id<"members">) {
  const row = await ctx.db.get(memberId);
  if (!row || row.workspaceId !== workspaceId || !row.active) notFound();
  return row;
}

/**
 * Everyone in the organization against one client: Owners and Admins see every client; a Member or
 * Viewer sees it only when assigned. Owners and Admins read and change this.
 */
export const access = adminQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await clientHere(ctx, ctx.workspaceId, args.clientId);
    const assigned = new Set((await assignmentsOf(ctx, ctx.workspaceId, client._id)).map((row) => row.memberId));
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(500);
    return members
      .filter((row) => row.active)
      .map((row) => ({
        memberId: row._id,
        name: row.displayName,
        role: roleOf(row.role),
        /** Owners and Admins always see the client, so there is nothing to switch for them. */
        always: isAdmin(row.role),
        assigned: isAdmin(row.role) || assigned.has(row._id),
      }))
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));
  },
});

/** Lets a Member or Viewer see a client, or stops them. Takes effect on their next read. */
export const setAssigned = adminMutation({
  args: { clientId: v.id("clients"), memberId: v.id("members"), assigned: v.boolean() },
  handler: async (ctx, args) => {
    const client = await clientHere(ctx, ctx.workspaceId, args.clientId);
    const member = await memberHere(ctx, ctx.workspaceId, args.memberId);
    if (isAdmin(member.role)) throw userError("Owners and Admins see every client. Change their role to limit what they see.");
    const existing = (await assignmentsOf(ctx, ctx.workspaceId, client._id)).filter((row) => row.memberId === member._id);
    if (args.assigned && existing.length === 0) {
      await ctx.db.insert("clientAssignments", { workspaceId: ctx.workspaceId, clientId: client._id, memberId: member._id, assignedBy: ctx.identity.subject, assignedAt: Date.now() });
      await audit(ctx, "client.assigned", client._id);
    }
    if (!args.assigned && existing.length > 0) {
      for (const row of existing) await ctx.db.delete(row._id);
      await audit(ctx, "client.unassigned", client._id);
    }
    return null;
  },
});

/** Whether a Member or Viewer sees the organization's own work (everything that is for no client). */
export const setOwnWork = adminMutation({
  args: { memberId: v.id("members"), ownWork: v.boolean() },
  handler: async (ctx, args) => {
    const member = await memberHere(ctx, ctx.workspaceId, args.memberId);
    if (isAdmin(member.role)) throw userError("Owners and Admins always see the organization's own work.");
    await ctx.db.patch(member._id, { ownWork: args.ownWork });
    await audit(ctx, args.ownWork ? "member.own_work_on" : "member.own_work_off", member._id);
    return null;
  },
});

/** What one person can see here: the organization's own work, and which clients. For Settings > People. */
export const memberAccess = adminQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await memberHere(ctx, ctx.workspaceId, args.memberId);
    const rows = await ctx.db
      .query("clientAssignments")
      .withIndex("by_workspace_member", (q) => q.eq("workspaceId", ctx.workspaceId).eq("memberId", member._id))
      .take(1000);
    const assigned = new Set(rows.map((row) => row.clientId));
    const clients = await clientsOf(ctx, ctx.workspaceId, "active");
    return {
      all: isAdmin(member.role),
      ownWork: isAdmin(member.role) || member.ownWork !== false,
      clients: clients.map((row) => ({ id: row._id, name: row.name, type: row.type, assigned: isAdmin(member.role) || assigned.has(row._id) })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
