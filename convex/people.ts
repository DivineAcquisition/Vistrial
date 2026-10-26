import { v } from "convex/values";

import { writeAudit } from "./lib/audit";
import { canSeeLead } from "./lib/canSeeLead";
import { notAllowed, notFound } from "./lib/errors";
import { workspaceMutation, workspaceQuery } from "./lib/builders";

const channel = v.union(v.literal("email"), v.literal("text"), v.literal("call"), v.literal("all"));
const nextState = v.union(v.literal("unknown"), v.literal("granted"), v.literal("revoked"));

export const setConsent = workspaceMutation({
  args: {
    personId: v.id("people"),
    channel,
    next: nextState,
    doNotContact: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person || person.workspaceId !== ctx.workspaceId) notFound();
    if (ctx.member.role === "rep") {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_person", (q) => q.eq("workspaceId", ctx.workspaceId).eq("personId", person._id))
        .take(20);
      if (!leads.some((lead) => canSeeLead(ctx.member, lead))) notFound();
    }
    const clearing =
      (args.doNotContact === false && person.doNotContact) ||
      (args.channel === "email" && person.emailConsent === "revoked" && args.next !== "revoked") ||
      (args.channel === "text" && person.textConsent === "revoked" && args.next !== "revoked") ||
      (args.channel === "call" && person.callConsent === "revoked" && args.next !== "revoked") ||
      (args.channel === "all" &&
        (person.emailConsent === "revoked" || person.textConsent === "revoked" || person.callConsent === "revoked") &&
        args.next !== "revoked");
    if (clearing) {
      if (ctx.member.role === "rep") notAllowed();
      if (!args.reason || args.reason.trim().length < 8) throw new Error("A reason is required.");
    }
    const at = Date.now();
    const patch: Record<string, unknown> = {};
    const channels = args.channel === "all" ? (["email", "text", "call"] as const) : ([args.channel] as const);
    for (const name of channels) {
      if (name === "email") {
        patch.emailConsent = args.next;
        patch.emailConsentAt = at;
      }
      if (name === "text") {
        patch.textConsent = args.next;
        patch.textConsentAt = at;
      }
      if (name === "call") {
        patch.callConsent = args.next;
        patch.callConsentAt = at;
      }
    }
    if (args.doNotContact !== undefined) {
      patch.doNotContact = args.doNotContact;
      if (args.doNotContact) patch.optedOutAt = person.optedOutAt ?? at;
    }
    if (args.next === "revoked") patch.optedOutAt = person.optedOutAt ?? at;
    await ctx.db.patch(person._id, patch);
    const changeId = await ctx.db.insert("consentChanges", {
      workspaceId: ctx.workspaceId,
      personId: person._id,
      channel: args.channel,
      next: args.next,
      reason: args.reason?.trim() ?? "",
      at,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: clearing ? "consent.cleared" : "consent.set",
      subject: changeId,
    });
    return changeId;
  },
});

export const readConsent = workspaceQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person || person.workspaceId !== ctx.workspaceId) notFound();
    if (ctx.member.role === "rep") {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_person", (q) => q.eq("workspaceId", ctx.workspaceId).eq("personId", person._id))
        .take(20);
      if (!leads.some((lead) => canSeeLead(ctx.member, lead))) notFound();
    }
    return {
      emailConsent: person.emailConsent,
      textConsent: person.textConsent,
      callConsent: person.callConsent,
      doNotContact: person.doNotContact,
    };
  },
});
