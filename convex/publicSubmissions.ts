import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { serverMutation, staffMutation, staffQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { submissionEmail } from "./lib/submissionEmail";

const KINDS = ["private_access", "custom", "security_review", "vulnerability", "lead_data_note"] as const;
const DEFAULT_ALERT_TO = "contact@divineacquisition.io";
const DEFAULT_ALERT_FROM = "Vistrial Forms <forms@mail.vistrial.io>";
const ADMIN_URL = "https://admin.vistrial.io/admin/submissions";

function clip(text: string, max: number): string {
  return [...text].slice(0, max).join("");
}

/** Saves a form post from the web server and queues the internal email. The save never waits on email. */
export const submit = serverMutation({
  args: {
    kind: v.string(),
    name: v.string(),
    email: v.string(),
    business: v.optional(v.string()),
    summary: v.string(),
    fields: v.array(v.object({ label: v.string(), value: v.string() })),
    pagePath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const kind = (KINDS as readonly string[]).includes(args.kind) ? args.kind : "custom";
    const id = await ctx.db.insert("publicSubmissions", {
      kind,
      name: clip(args.name, 120),
      email: clip(args.email, 200),
      business: args.business ? clip(args.business, 160) : undefined,
      summary: clip(args.summary, 2000),
      fields: args.fields
        .slice(0, 40)
        .map((field) => ({ label: clip(field.label, 80), value: clip(field.value, 2000) }))
        .filter((field) => field.value.trim() !== ""),
      pagePath: args.pagePath ? clip(args.pagePath, 300) : undefined,
      status: "new",
      emailStatus: "pending",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.publicSubmissions.notify, { id });
    return { id };
  },
});

export const getForEmail = internalQuery({
  args: { id: v.id("publicSubmissions") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const recordEmail = internalMutation({
  args: {
    id: v.id("publicSubmissions"),
    emailStatus: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    emailError: v.optional(v.string()),
  },
  handler: async (ctx, { id, emailStatus, emailError }) => {
    await ctx.db.patch(id, { emailStatus, emailError: emailError ? clip(emailError, 300) : undefined });
    return null;
  },
});

/** Sends the internal alert through Resend. A failure is written on the row; the submission stays saved. */
export const notify = internalAction({
  args: { id: v.id("publicSubmissions") },
  handler: async (ctx, { id }: { id: Id<"publicSubmissions"> }) => {
    const row = await ctx.runQuery(internal.publicSubmissions.getForEmail, { id });
    if (!row) return null;
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
      await ctx.runMutation(internal.publicSubmissions.recordEmail, { id, emailStatus: "skipped", emailError: "RESEND_API_KEY is not set." });
      return null;
    }
    const to = (process.env.FORM_ALERT_TO?.trim() || DEFAULT_ALERT_TO).split(",").map((item) => item.trim()).filter(Boolean);
    const from = process.env.FORM_ALERT_FROM?.trim() || DEFAULT_ALERT_FROM;
    const message = submissionEmail(row, ADMIN_URL);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, reply_to: row.email, ...message }),
      });
      if (response.ok) {
        await ctx.runMutation(internal.publicSubmissions.recordEmail, { id, emailStatus: "sent" });
      } else {
        const detail = await response.text().catch(() => "");
        await ctx.runMutation(internal.publicSubmissions.recordEmail, {
          id,
          emailStatus: "failed",
          emailError: `Resend ${response.status}: ${detail}`,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.publicSubmissions.recordEmail, {
        id,
        emailStatus: "failed",
        emailError: error instanceof Error ? error.message : "Network error",
      });
    }
    return null;
  },
});

/** Newest first. Staff only, with a second factor, like the rest of /admin. */
export const list = staffQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("publicSubmissions")
      .withIndex("by_created")
      .order("desc")
      .take(Math.min(Math.max(limit ?? 500, 1), 2000));
    return rows.map((row) => ({
      id: row._id,
      kind: row.kind,
      name: row.name,
      email: row.email,
      business: row.business ?? "",
      summary: row.summary,
      fields: row.fields,
      pagePath: row.pagePath ?? "",
      status: row.status,
      emailStatus: row.emailStatus,
      emailError: row.emailError ?? "",
      createdAt: row.createdAt,
    }));
  },
});

export const setStatus = staffMutation({
  args: {
    id: v.id("publicSubmissions"),
    status: v.union(v.literal("new"), v.literal("reviewed"), v.literal("archived")),
  },
  handler: async (ctx, { id, status }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await ctx.db.patch(id, { status });
    await writeAudit(ctx, {
      actorType: "staff",
      actorId: ctx.identity.subject,
      action: `submission.${status}`,
      subject: id,
    });
    return null;
  },
});

/** Sends the alert again, for a row whose email failed or was skipped. */
export const resendEmail = staffMutation({
  args: { id: v.id("publicSubmissions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return null;
    await ctx.db.patch(id, { emailStatus: "pending", emailError: undefined });
    await ctx.scheduler.runAfter(0, internal.publicSubmissions.notify, { id });
    return null;
  },
});
