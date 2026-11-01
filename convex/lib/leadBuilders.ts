import { v, type ObjectType, type PropertyValidators } from "convex/values";

import type { RegisteredMutation, RegisteredQuery } from "convex/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canSeeLead } from "./canSeeLead";
import { notFound } from "./errors";
import { workspaceMutation, workspaceQuery, type MemberAccess, type WorkspaceArgs } from "./builders";

type AnyValidators = Record<string, PropertyValidators[string]>;

type LeadRead = QueryCtx & MemberAccess & { lead: Doc<"leads"> };
type LeadWrite = MutationCtx & MemberAccess & { lead: Doc<"leads"> };

async function loadVisibleLead(ctx: QueryCtx & MemberAccess, leadId: Doc<"leads">["_id"]) {
  const lead = await ctx.db.get(leadId);
  if (!lead || !canSeeLead(ctx.member, lead)) notFound();
  return lead;
}

export function leadQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead, args: ObjectType<V>) => R;
}) {
  return workspaceQuery({
    args: { leadId: v.id("leads"), ...def.args },
    handler: async (ctx, args) => {
      const { leadId, ...rest } = args as unknown as { leadId: Doc<"leads">["_id"] };
      const lead = await loadVisibleLead(ctx, leadId);
      return def.handler({ ...ctx, lead }, rest as ObjectType<V>);
    },
  });
}

export function leadMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite, args: ObjectType<V>) => R;
}) {
  return workspaceMutation({
    args: { leadId: v.id("leads"), ...def.args },
    handler: async (ctx, args) => {
      const { leadId, ...rest } = args as unknown as { leadId: Doc<"leads">["_id"] };
      const lead = await loadVisibleLead(ctx, leadId);
      return def.handler({ ...ctx, lead }, rest as ObjectType<V>);
    },
  });
}

type ChildTable = "calls" | "bookings" | "tasks" | "notes" | "conversations" | "messages";

/** What a child-record function takes from callers: the workspace, the child id field, and its own args. */
type ChildArgs<V extends AnyValidators, F extends string, T extends ChildTable> = WorkspaceArgs<V> & {
  [K in F]: Id<T>;
};

type ChildRegistered<K extends "query" | "mutation", V extends AnyValidators, F extends string, T extends ChildTable, R> =
  K extends "query" ? RegisteredQuery<"public", ChildArgs<V, F, T>, R> : RegisteredMutation<"public", ChildArgs<V, F, T>, R>;

function childBuilder<
  K extends "query" | "mutation",
  F extends string,
  T extends ChildTable,
  V extends AnyValidators,
  R,
  Row extends { leadId: Doc<"leads">["_id"]; workspaceId: Doc<"leads">["workspaceId"] },
>(
  kind: K,
  idField: F,
  table: T,
  def: { args: V; handler: (ctx: never, args: ObjectType<V>) => R },
): ChildRegistered<K, V, F, T, R> {
  const build = (kind === "query" ? workspaceQuery : workspaceMutation) as typeof workspaceQuery;
  // The registered kind follows `kind`; the cast only restores the id field TypeScript cannot see.
  return build({
    args: { [idField]: v.id(table), ...def.args } as V,
    handler: async (ctx, args) => {
      const bag = args as unknown as Record<string, Doc<"leads">["_id"]>;
      const row = (await ctx.db.get(bag[idField])) as Row | null;
      if (!row || row.workspaceId !== ctx.workspaceId) notFound();
      const lead = await loadVisibleLead(ctx, row.leadId);
      const rest = { ...(args as object) } as Record<string, unknown>;
      delete rest[idField];
      return def.handler({ ...ctx, lead, row } as never, rest as ObjectType<V>);
    },
  }) as unknown as ChildRegistered<K, V, F, T, R>;
}

export function callQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"calls"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "callId", "calls", def);
}

export function callMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"calls"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "callId", "calls", def);
}

export function bookingQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"bookings"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "bookingId", "bookings", def);
}

export function bookingMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"bookings"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "bookingId", "bookings", def);
}

export function taskQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"tasks"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "taskId", "tasks", def);
}

export function taskMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"tasks"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "taskId", "tasks", def);
}

export function noteQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"notes"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "noteId", "notes", def);
}

export function noteMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"notes"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "noteId", "notes", def);
}

export function conversationQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"conversations"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "conversationId", "conversations", def);
}

export function conversationMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"conversations"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "conversationId", "conversations", def);
}

export function messageQuery<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"messages"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("query", "messageId", "messages", def);
}

export function messageMutation<V extends AnyValidators, R>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"messages"> }, args: ObjectType<V>) => R;
}) {
  return childBuilder("mutation", "messageId", "messages", def);
}
