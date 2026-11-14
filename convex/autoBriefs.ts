/**
 * Automatic pre-call briefs (build step 10d; docs/rebuild/dealmaker.md, 4.3 and answer 12.4): a switch, off by
 * default, that an Owner or Admin turns on after seeing the monthly cap. Then a brief is made about three
 * hours before each booked call from the CRM's appointments, as the person who turned it on, at most 200
 * briefs and 600 credits a calendar month (UTC). Once a day the Briefing lists the briefs made automatically
 * the day before, in one post.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { createBrief } from "./dealBriefings";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { post } from "./lib/briefing";
import { adminMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { userError } from "./lib/errors";
import { capsFor } from "./lib/modelChoice";
import { isAdmin } from "./lib/roles";
import { settingsOf } from "./playbookInterview";
import { SKILL_SLUG } from "./skills/dealBriefing/shapes";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const AUTO_LIMITS = {
  /** A call this many hours ahead, or sooner, gets its brief. */
  hoursBefore: 3,
  briefs: 200,
  credits: 600,
} as const;

export const AUTO_TEXT = {
  confirmCap: `Confirm the monthly cap first: at most ${AUTO_LIMITS.briefs} briefs and ${AUTO_LIMITS.credits} credits a month.`,
  noCrm: "Connect your CRM first. Automatic briefs are made for the calls booked in it.",
} as const;

function monthStart(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** The automatic briefs made this month here, and the credits their runs used. */
async function monthUse(ctx: Pick<QueryCtx, "db">, scope: Scope, now: number) {
  const since = monthStart(now);
  const rows = (
    await ctx.db
      .query("dealBriefings")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId).gte("createdAt", since))
      .take(2000)
  ).filter((row) => row.trigger === "auto");
  let cents = 0;
  for (const row of rows) {
    const run = row.runId ? await ctx.db.get(row.runId) : null;
    cents += run?.costCents ?? 0;
  }
  return { briefs: rows.length, credits: priceFor(cents) };
}

/** The most one automatic brief may use, as the run's cap on the platform's route. */
async function maxPerBrief(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const caps = await capsFor(ctx, { workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice: null });
  return priceFor(caps.maxCostCentsPerRun);
}

/** The switch as Calendar shows it: whether it is on, this month's use against the cap, and who may change it. */
export const status = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope: Scope = args.clientId ? { workspaceId: ctx.workspaceId, clientId: (await clientHere(ctx, ctx.workspaceId, args.clientId))._id } : { workspaceId: ctx.workspaceId };
    ctx.clients.require(scope.clientId);
    const settings = await settingsOf(ctx, scope);
    const use = await monthUse(ctx, scope, Date.now());
    return {
      on: settings?.autoBriefs?.on === true,
      canSet: isAdmin(ctx.member.role),
      hoursBefore: AUTO_LIMITS.hoursBefore,
      cap: { briefs: AUTO_LIMITS.briefs, credits: AUTO_LIMITS.credits },
      used: use,
    };
  },
});

/** Turns automatic briefs on or off. Turning them on needs the monthly cap confirmed, as it was shown. */
export const setAuto = adminMutation({
  args: { clientId: v.optional(v.id("clients")), on: v.boolean(), confirmedCredits: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const scope: Scope = { workspaceId: ctx.workspaceId, ...forClient };
    if (args.on) {
      if (args.confirmedCredits !== AUTO_LIMITS.credits) throw userError(AUTO_TEXT.confirmCap);
      if (!(await crmFor(ctx, scope))) throw userError(AUTO_TEXT.noCrm);
    }
    const row = await settingsOf(ctx, scope);
    const value = { on: args.on, by: ctx.identity.subject, at: Date.now() };
    const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, { autoBriefs: value, ...stamp });
    else await ctx.db.insert("dealmakerSettings", { ...scope, autoBriefs: value, ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "dealmaker.autoBriefs_on" : "dealmaker.autoBriefs_off", subject: row?._id ?? ctx.workspaceId });
    return null;
  },
});

export async function dealmakerOn(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">) {
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_slug", (q) => q.eq("slug", SALES_CONVERSION))
    .unique();
  if (!agent || agent.status !== "live") return false;
  const link = await ctx.db
    .query("workspaceAgents")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
    .unique();
  return link?.state === "on";
}

/** One organization's or client's automatic briefs: due calls within the cap, then yesterday's post. */
async function sweepOne(ctx: MutationCtx, settings: Doc<"dealmakerSettings">, now: number) {
  const scope: Scope = { workspaceId: settings.workspaceId, ...(settings.clientId ? { clientId: settings.clientId } : {}) };
  const auto = settings.autoBriefs!;
  // The person who turned it on must still be an Owner or Admin here; otherwise nothing is made.
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", scope.workspaceId).eq("userId", auto.by))
    .first();
  if (!member || !member.active || !isAdmin(member.role)) return { made: 0 };
  const crm = await crmFor(ctx, scope);
  if (!crm) return { made: 0 };

  const calls = await crm.appointments({ from: now, to: now + AUTO_LIMITS.hoursBefore * HOUR });
  let made = 0;
  let use = await monthUse(ctx, scope, now);
  const most = await maxPerBrief(ctx, scope.workspaceId);
  for (const call of calls) {
    if (call.status === "cancelled" || !call.contactRef) continue;
    const existing = await ctx.db
      .query("dealBriefings")
      .withIndex("by_workspace_appointment", (q) => q.eq("workspaceId", scope.workspaceId).eq("appointmentRef", call.ref))
      .collect();
    if (existing.some((row) => row.clientId === scope.clientId)) continue;
    // Within the monthly cap, counting this brief at the most it may use.
    if (use.briefs + 1 > AUTO_LIMITS.briefs || use.credits + most > AUTO_LIMITS.credits) break;
    const deal = (await crm.deals({ open: true })).find((row) => row.contactRef === call.contactRef);
    try {
      await createBrief(ctx, { scope, userId: auto.by, role: member.role, writer: member.displayName, trigger: "auto", contactRef: call.contactRef, appointmentRef: call.ref, ...(deal ? { dealRef: deal.ref } : {}) });
      made += 1;
      use = { briefs: use.briefs + 1, credits: use.credits + most };
    } catch (error) {
      // No credits left, Dealmaker switched off, or the lead no longer read: skip this call, keep the rest.
      console.error(`Automatic brief not started: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`);
    }
  }

  // Yesterday's automatic briefs, in one post.
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const yesterday = (
    await ctx.db
      .query("dealBriefings")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId).gte("createdAt", today - DAY).lt("createdAt", today))
      .take(500)
  ).filter((row) => row.trigger === "auto");
  if (yesterday.length) {
    const names = yesterday.slice(0, 10).map((row) => row.leadName);
    await post(ctx, {
      ...scope,
      kind: "finished",
      agentSlug: SALES_CONVERSION,
      title: `Dealmaker · ${yesterday.length} pre-call brief${yesterday.length === 1 ? "" : "s"} made automatically yesterday`,
      body: `For calls with ${names.join(", ")}${yesterday.length > names.length ? ` and ${yesterday.length - names.length} more` : ""}. Each is in Calls.`,
      key: `dealmaker-autobriefs:${settings._id}:${new Date(today - DAY).toISOString().slice(0, 10)}`,
    });
  }
  return { made };
}

/** Makes the briefs due now everywhere automatic briefs are on. Run by a cron every 15 minutes. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("dealmakerSettings").take(2000);
    let made = 0;
    for (const row of rows) {
      if (row.autoBriefs?.on !== true) continue;
      if (!(await dealmakerOn(ctx, row.workspaceId))) continue;
      made += (await sweepOne(ctx, row, now)).made;
    }
    return { made };
  },
});
