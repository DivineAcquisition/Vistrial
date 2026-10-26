import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import {
  bookingMutation,
  bookingQuery,
  callMutation,
  callQuery,
  conversationQuery,
  leadMutation,
  leadQuery,
  messageQuery,
  noteQuery,
  taskMutation,
  taskQuery,
} from "./lib/leadBuilders";

async function touch(ctx: MutationCtx, leadId: Id<"leads">, at: number, current?: number) {
  if (current === undefined || at > current) {
    await ctx.db.patch(leadId, { lastActivityAt: at });
  }
}

export const timeline = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("leadTimeline")
      .withIndex("by_workspace_lead_at", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      kind: row.kind,
      refTable: row.refTable,
      refId: row.refId,
      at: row.at,
    }));
  },
});

export const listNotes = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .take(50);
    return rows.map((row) => ({ id: row._id, at: row.at, body: row.body }));
  },
});

export const addNote = leadMutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    if (!body) throw new Error("Write a note.");
    const at = Date.now();
    const noteId = await ctx.db.insert("notes", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      authorMemberId: ctx.member._id,
      body,
      at,
    });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      kind: "note.added",
      refTable: "notes",
      refId: noteId,
      at,
      actorMemberId: ctx.member._id,
    });
    await touch(ctx, ctx.lead._id, at, ctx.lead.lastActivityAt);
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "note.added",
      subject: noteId,
    });
    return noteId;
  },
});

export const getNote = noteQuery({
  args: {},
  handler: async (ctx) => ({ id: ctx.row._id, at: ctx.row.at, body: ctx.row.body }),
});

export const listTasks = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_lead_purpose", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      title: row.title,
      status: row.status,
      purposeKey: row.purposeKey,
      dueAt: row.dueAt ?? null,
    }));
  },
});

export const addTask = leadMutation({
  args: { title: v.string(), purposeKey: v.string(), dueAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const purposeKey = args.purposeKey.trim();
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_workspace_lead_purpose", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id).eq("purposeKey", purposeKey).eq("status", "open"),
      )
      .take(1);
    if (open.length > 0) throw new Error("That task is already open.");
    const at = args.dueAt ?? Date.now();
    const taskId = await ctx.db.insert("tasks", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      assignedMemberId: ctx.member._id,
      kind: "manual",
      title: args.title.trim().slice(0, 80),
      dueAt: args.dueAt,
      status: "open",
      createdBy: "person",
      purposeKey,
    });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      kind: "task.added",
      refTable: "tasks",
      refId: taskId,
      at,
      actorMemberId: ctx.member._id,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "task.added",
      subject: taskId,
    });
    return taskId;
  },
});

export const getTask = taskQuery({
  args: {},
  handler: async (ctx) => ({ id: ctx.row._id, title: ctx.row.title, status: ctx.row.status }),
});

export const listCalls = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      scheduledAt: row.scheduledAt ?? null,
      occurredAt: row.occurredAt ?? null,
      outcome: row.outcome ?? "",
      source: row.source,
    }));
  },
});

export const addCall = leadMutation({
  args: { occurredAt: v.number(), outcome: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const callId = await ctx.db.insert("calls", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      ownerMemberId: ctx.member._id,
      occurredAt: args.occurredAt,
      outcome: args.outcome?.trim(),
      source: "manual",
    });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      kind: "call.added",
      refTable: "calls",
      refId: callId,
      at: args.occurredAt,
      actorMemberId: ctx.member._id,
    });
    await touch(ctx, ctx.lead._id, args.occurredAt, ctx.lead.lastActivityAt);
    return callId;
  },
});

export const getCall = callQuery({
  args: {},
  handler: async (ctx) => ({ id: ctx.row._id, source: ctx.row.source }),
});

export const listBookings = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      source: row.source,
    }));
  },
});

export const addBooking = leadMutation({
  args: {
    startsAt: v.number(),
    endsAt: v.number(),
    status: v.optional(v.union(v.literal("booked"), v.literal("completed"), v.literal("canceled"), v.literal("noShow"))),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "booked";
    const bookingId = await ctx.db.insert("bookings", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      ownerMemberId: ctx.member._id,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      status,
      source: "manual",
    });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      kind: "booking.added",
      refTable: "bookings",
      refId: bookingId,
      at: args.startsAt,
      actorMemberId: ctx.member._id,
    });
    await touch(ctx, ctx.lead._id, args.startsAt, ctx.lead.lastActivityAt);
    return bookingId;
  },
});

export const getBooking = bookingQuery({
  args: {},
  handler: async (ctx) => ({ id: ctx.row._id, status: ctx.row.status }),
});

export const listMessages = leadQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_workspace_lead_at", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      direction: row.direction,
      channel: row.channel,
      at: row.at,
      hasBody: row.hasBody,
    }));
  },
});

export const getMessage = messageQuery({
  args: {},
  handler: async (ctx) => {
    const body = await ctx.db
      .query("messageBodies")
      .withIndex("by_workspace_message", (q) => q.eq("workspaceId", ctx.workspaceId).eq("messageId", ctx.row._id))
      .unique();
    return { id: ctx.row._id, at: ctx.row.at, text: body?.text ?? "" };
  },
});

export const addMessage = leadMutation({
  args: { text: v.string(), at: v.number(), direction: v.union(v.literal("in"), v.literal("out")) },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", ctx.workspaceId).eq("leadId", ctx.lead._id))
      .take(1);
    let conversationId = conversation[0]?._id;
    if (!conversationId) {
      conversationId = await ctx.db.insert("conversations", {
        workspaceId: ctx.workspaceId,
        leadId: ctx.lead._id,
        channel: "email",
        lastMessageAt: args.at,
      });
    }
    const messageId = await ctx.db.insert("messages", {
      workspaceId: ctx.workspaceId,
      conversationId,
      leadId: ctx.lead._id,
      direction: args.direction,
      channel: "email",
      at: args.at,
      hasBody: true,
    });
    await ctx.db.insert("messageBodies", { workspaceId: ctx.workspaceId, messageId, text: args.text });
    await ctx.db.insert("leadTimeline", {
      workspaceId: ctx.workspaceId,
      leadId: ctx.lead._id,
      kind: "message.added",
      refTable: "messages",
      refId: messageId,
      at: args.at,
      actorMemberId: ctx.member._id,
    });
    await touch(ctx, ctx.lead._id, args.at, ctx.lead.lastActivityAt);
    return messageId;
  },
});

export const getConversation = conversationQuery({
  args: {},
  handler: async (ctx) => ({ id: ctx.row._id, channel: ctx.row.channel }),
});
