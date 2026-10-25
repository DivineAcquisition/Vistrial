import { v, type ObjectType, type PropertyValidators } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canSeeLead } from "./canSeeLead";
import { notFound } from "./errors";
import { workspaceMutation, workspaceQuery, type MemberAccess } from "./builders";

type AnyValidators = Record<string, PropertyValidators[string]>;

type LeadRead = QueryCtx & MemberAccess & { lead: Doc<"leads"> };
type LeadWrite = MutationCtx & MemberAccess & { lead: Doc<"leads"> };

async function loadVisibleLead(ctx: QueryCtx & MemberAccess, leadId: Doc<"leads">["_id"]) {
  const lead = await ctx.db.get(leadId);
  if (!lead || !canSeeLead(ctx.member, lead)) notFound();
  return lead;
}

export function leadQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead, args: ObjectType<V>) => unknown;
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

export function leadMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite, args: ObjectType<V>) => unknown;
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

function childBuilder<V extends AnyValidators, Row extends { leadId: Doc<"leads">["_id"]; workspaceId: Doc<"leads">["workspaceId"] }>(
  kind: "query" | "mutation",
  idField: string,
  table: "calls" | "bookings" | "tasks" | "notes" | "conversations" | "messages",
  def: { args: V; handler: (ctx: never, args: ObjectType<V>) => unknown },
) {
  const build = (kind === "query" ? workspaceQuery : workspaceMutation) as typeof workspaceQuery;
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
  });
}

export function callQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"calls"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "callId", "calls", def);
}

export function callMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"calls"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "callId", "calls", def);
}

export function bookingQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"bookings"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "bookingId", "bookings", def);
}

export function bookingMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"bookings"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "bookingId", "bookings", def);
}

export function taskQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"tasks"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "taskId", "tasks", def);
}

export function taskMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"tasks"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "taskId", "tasks", def);
}

export function noteQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"notes"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "noteId", "notes", def);
}

export function noteMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"notes"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "noteId", "notes", def);
}

export function conversationQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"conversations"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "conversationId", "conversations", def);
}

export function conversationMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"conversations"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "conversationId", "conversations", def);
}

export function messageQuery<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadRead & { row: Doc<"messages"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("query", "messageId", "messages", def);
}

export function messageMutation<V extends AnyValidators>(def: {
  args: V;
  handler: (ctx: LeadWrite & { row: Doc<"messages"> }, args: ObjectType<V>) => unknown;
}) {
  return childBuilder("mutation", "messageId", "messages", def);
}
