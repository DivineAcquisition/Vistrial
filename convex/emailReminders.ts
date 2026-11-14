/**
 * Email reminders through Resend, for a workspace's Owners and Admins:
 * - a check-in is due (hourly cron; one email per person listing every check-in due, sent once per decision)
 * - a report is ready for review (scheduled by the save step of a run; one per report version)
 *
 * A send never throws into a run. With no RESEND_API_KEY it logs one line and sends nothing. Each attempt
 * writes an audit row with the recipient's user id and never the address. Removed members, Members and Viewers, people
 * who switched the notice off, and paused or archived workspaces get nothing.
 */
import { isAdmin } from "./lib/roles";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { DEFAULT_APP_URL, REMINDER_FROM, checkInDueEmail, firstPackageEmail, isReportKind, reportReadyEmail, type ReminderEmail, type ReportKind } from "./lib/reminderEmail";
import { readReport } from "./skills/marketIntelligence/shapes";
import { bareTitle, focusOf } from "./skills/offerIntelligence/firstPackage";
import { readAnalysis } from "./skills/offerIntelligence/shapes";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A check-in that came due longer ago than this is not emailed: it is old news, and the Home screen still lists it. */
export const CHECK_IN_WINDOW_MS = 30 * DAY_MS;
const MAX_DUE = 100;

export const CHECKIN_ACTION = "email.checkin_due";
export const REPORT_ACTION = "email.report_ready";

type Recipient = { userId: string; email: string };
type NoticeFlag = "notifyCheckInsDue" | "notifyReportReady";

/** The workspace, when email may go out for it: active, and not paused by its owner. */
async function openWorkspace(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.status !== "active") return null;
  const controls = await ctx.db
    .query("workspaceControls")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  return controls?.agentsPaused === true ? null : workspace;
}

/**
 * Who gets a notice by email: this workspace's active Owners and Admins with an address on file, unless
 * they switched that notice, or email, off. A missing preference means on. Members and Viewers never.
 */
async function recipientsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, flag: NoticeFlag): Promise<Recipient[]> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  const out: Recipient[] = [];
  for (const member of members) {
    if (!member.active || member.removedAt !== undefined) continue;
    if (!isAdmin(member.role)) continue;
    const email = member.email?.trim();
    if (!email || !email.includes("@")) continue;
    const prefs = await ctx.db
      .query("memberPreferences")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", member.userId))
      .unique();
    if (prefs?.[flag] === false || prefs?.notifyByEmail === false) continue;
    if (!out.some((row) => row.userId === member.userId)) out.push({ userId: member.userId, email });
  }
  return out;
}

export function resendKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

export function appUrl(): string {
  return process.env.SITE_URL?.trim() || DEFAULT_APP_URL;
}

/** True when Resend took the email. Never throws. The idempotency key makes a retry a no-op at Resend. */
export async function send(key: string, to: string, idempotencyKey: string, message: ReminderEmail): Promise<boolean> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: REMINDER_FROM, to: [to], ...message }),
    });
    if (!response.ok) console.error(`Reminder email not sent: Resend answered ${response.status}.`);
    return response.ok;
  } catch {
    console.error("Reminder email not sent: Resend could not be reached.");
    return false;
  }
}

const sendResult = v.object({ userId: v.string(), sent: v.boolean() });

/* ---------------------------------------------------------- check-ins due */

export const openWorkspaces = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("workspaces").take(2000);
    return rows.filter((row) => row.status === "active").map((row) => row._id);
  },
});

/** One workspace's check-ins that are due and not yet reminded, with who to tell. Null when there is nothing to do. */
export const dueCheckIns = internalQuery({
  args: { workspaceId: v.id("workspaces"), now: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("decisions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId).gte("checkInAt", args.now - CHECK_IN_WINDOW_MS).lte("checkInAt", args.now))
      .take(500);
    const due = rows.filter((row) => !row.outcome && row.remindedAt === undefined).slice(0, MAX_DUE);
    if (due.length === 0) return null;
    const workspace = await openWorkspace(ctx, args.workspaceId);
    if (!workspace) return null;
    return {
      workspaceName: workspace.name,
      decisions: due.map((row) => ({ id: row._id, action: row.proposedAction, checkInAt: row.checkInAt })),
      recipients: await recipientsFor(ctx, args.workspaceId, "notifyCheckInsDue"),
    };
  },
});

/**
 * Marks the check-ins as reminded, so they are never sent again, and writes one audit row per check-in and
 * recipient: count 1 when the email went out, 0 when it did not.
 */
export const recordCheckIns = internalMutation({
  args: { workspaceId: v.id("workspaces"), decisionIds: v.array(v.id("decisions")), sends: v.array(sendResult), remind: v.boolean(), now: v.number() },
  handler: async (ctx, args) => {
    for (const decisionId of args.decisionIds) {
      const decision = await ctx.db.get(decisionId);
      if (!decision || decision.workspaceId !== args.workspaceId) continue;
      if (args.remind && decision.remindedAt === undefined) await ctx.db.patch(decision._id, { remindedAt: args.now });
      for (const row of args.sends) {
        await writeAudit(ctx, {
          workspaceId: args.workspaceId,
          actorType: "system",
          actorId: "email",
          action: CHECKIN_ACTION,
          subject: `${decision._id}:${row.userId}`,
          count: row.sent ? 1 : 0,
        });
      }
    }
    return null;
  },
});

/** Hourly: emails each Owner and Admin their due check-ins, one email per person and workspace. */
export const sendCheckInsDue = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const key = resendKey();
    if (!key) {
      // Nothing is marked as reminded, so these go out once a key is set.
      console.log("Check-in emails skipped: RESEND_API_KEY is not set.");
      return null;
    }
    const now = Date.now();
    const workspaceIds: Id<"workspaces">[] = await ctx.runQuery(internal.emailReminders.openWorkspaces, {});
    for (const workspaceId of workspaceIds) {
      try {
        const batch = await ctx.runQuery(internal.emailReminders.dueCheckIns, { workspaceId, now });
        if (!batch) continue;
        const decisionIds = batch.decisions.map((row) => row.id);
        const message = checkInDueEmail({ workspaceName: batch.workspaceName, items: batch.decisions, appUrl: appUrl() });
        const sends: { userId: string; sent: boolean }[] = [];
        for (const person of batch.recipients) {
          const idempotencyKey = `checkin-due/${decisionIds[0]}/${decisionIds.length}/${person.userId}`;
          sends.push({ userId: person.userId, sent: await send(key, person.email, idempotencyKey, message) });
        }
        // With nobody to tell, the check-in is closed for email. When every send failed, it stays open
        // and the next hour tries again. Once one person has it, it is never sent again.
        const remind = sends.length === 0 || sends.some((row) => row.sent);
        await ctx.runMutation(internal.emailReminders.recordCheckIns, { workspaceId, decisionIds, sends, remind, now });
      } catch {
        console.error("Check-in emails failed for one workspace.");
      }
    }
    return null;
  },
});

/* ------------------------------------------------------------ report ready */

/** The report to announce and who to tell. Null when it no longer waits for a person, or is not a report. */
export const reportToAnnounce = internalQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || !isReportKind(asset.kind) || !asset.createdByRun) return null;
    if (asset.status !== "draft" && asset.status !== "needsReview") return null;
    // A first-package report is announced once, in the package's own email.
    if ((await ctx.db.get(asset.createdByRun))?.packageId) return null;
    const workspace = await openWorkspace(ctx, asset.workspaceId);
    if (!workspace) return null;
    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", asset.workspaceId).eq("assetId", asset._id))
      .take(100);
    const version = versions.find((row) => row.version === asset.currentVersion);
    if (!version) return null;
    return {
      workspaceId: asset.workspaceId,
      workspaceName: workspace.name,
      title: asset.title,
      kind: asset.kind as ReportKind,
      needsReview: asset.status === "needsReview",
      versionId: version._id,
      recipients: await recipientsFor(ctx, asset.workspaceId, "notifyReportReady"),
    };
  },
});

export const recordReport = internalMutation({
  args: { workspaceId: v.id("workspaces"), versionId: v.id("assetVersions"), sends: v.array(sendResult) },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version || version.workspaceId !== args.workspaceId) return null;
    for (const row of args.sends) {
      await writeAudit(ctx, {
        workspaceId: args.workspaceId,
        actorType: "system",
        actorId: "email",
        action: REPORT_ACTION,
        subject: `${version._id}:${row.userId}`,
        count: row.sent ? 1 : 0,
      });
    }
    return null;
  },
});

/** Scheduled by a run's save step: tells Owners and Admins a report waits for them. Never throws. */
export const sendReportReady = internalAction({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args): Promise<null> => {
    try {
      const report = await ctx.runQuery(internal.emailReminders.reportToAnnounce, { assetId: args.assetId });
      if (!report) return null;
      const key = resendKey();
      if (!key) console.log("Report-ready email skipped: RESEND_API_KEY is not set.");
      const message = reportReadyEmail({
        workspaceName: report.workspaceName,
        title: report.title,
        kind: report.kind,
        needsReview: report.needsReview,
        assetId: args.assetId,
        appUrl: appUrl(),
      });
      const sends: { userId: string; sent: boolean }[] = [];
      for (const person of report.recipients) {
        const sent = key ? await send(key, person.email, `report-ready/${report.versionId}/${person.userId}`, message) : false;
        sends.push({ userId: person.userId, sent });
      }
      await ctx.runMutation(internal.emailReminders.recordReport, { workspaceId: report.workspaceId, versionId: report.versionId, sends });
    } catch {
      console.error("Report-ready email failed.");
    }
    return null;
  },
});

/* ----------------------------------------------------------- first package */

export const PACKAGE_ACTION = "email.first_package";

/** The structured output a run wrote last that reads as `read` accepts it: what the saved report was rendered from. */
async function lastModelOutput<T>(ctx: QueryCtx, runId: Id<"agentRuns"> | undefined, read: (value: unknown) => T | null): Promise<T | null> {
  if (!runId) return null;
  const run = await ctx.db.get(runId);
  if (!run) return null;
  const rows = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(300);
  for (const row of rows.reverse()) {
    if (row.kind !== "model" || !row.body) continue;
    try {
      const value = read(JSON.parse(row.body));
      if (value) return value;
    } catch {
      // Not this one.
    }
  }
  return null;
}

/** What the first package email says, and who it goes to: the Owner and the Admins. Null when there is nothing to send. */
export const packageToAnnounce = internalQuery({
  args: { packageId: v.id("firstPackages") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || !pkg.research.assetId) return null;
    const workspace = await openWorkspace(ctx, pkg.workspaceId);
    if (!workspace) return null;
    const report = await lastModelOutput(ctx, pkg.research.runId, (value) => {
      const read = readReport(value);
      return read && read.findings.length ? read : null;
    });
    const analysis = pkg.offers.state === "done" || pkg.offers.state === "needsReview" ? await lastModelOutput(ctx, pkg.offers.runId, (value) => {
      const read = readAnalysis(value);
      return read && read.changes.length ? read : null;
    }) : null;
    const ideas = (analysis?.changes ?? []).flatMap((row) => {
      const focus = focusOf(row.title);
      return focus ? [{ focus, title: bareTitle(row.title), why: row.fit.text }] : [];
    });
    // The Owner and the Admins (the owner's decision), unless a person switched "Report ready" emails off.
    const owners = await recipientsFor(ctx, pkg.workspaceId, "notifyReportReady");
    return {
      workspaceId: pkg.workspaceId,
      workspaceName: workspace.name,
      answer: report?.summary ?? "",
      findings: (report?.findings ?? []).map((row) => ({ text: row.statement, basis: row.basis })),
      ideas,
      researchNeedsReview: pkg.research.state === "needsReview",
      pagePart: pkg.pagePart ?? "teardown",
      teardown: (pkg.teardown.state === "done" || pkg.teardown.state === "needsReview" ? "ready" : pkg.teardown.state === "running" || pkg.teardown.state === "waiting" ? "running" : "none") as "ready" | "running" | "none",
      reportAssetId: pkg.research.assetId,
      recipients: owners,
    };
  },
});

export const recordPackage = internalMutation({
  args: { workspaceId: v.id("workspaces"), packageId: v.id("firstPackages"), sends: v.array(sendResult) },
  handler: async (ctx, args) => {
    for (const row of args.sends) {
      await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "system", actorId: "email", action: PACKAGE_ACTION, subject: `${args.packageId}:${row.userId}`, count: row.sent ? 1 : 0 });
    }
    return null;
  },
});

/** Scheduled by the package once the research and offer ideas are done: tells the Owner and Admins. Never throws. */
export const sendFirstPackage = internalAction({
  args: { packageId: v.id("firstPackages") },
  handler: async (ctx, args): Promise<null> => {
    try {
      const pkg = await ctx.runQuery(internal.emailReminders.packageToAnnounce, { packageId: args.packageId });
      if (!pkg) return null;
      const key = resendKey();
      if (!key) console.log("First package email skipped: RESEND_API_KEY is not set.");
      const message = firstPackageEmail({ ...pkg, appUrl: appUrl() });
      const sends: { userId: string; sent: boolean }[] = [];
      for (const person of pkg.recipients) {
        const sent = key ? await send(key, person.email, `first-package/${args.packageId}/${person.userId}`, message) : false;
        sends.push({ userId: person.userId, sent });
      }
      await ctx.runMutation(internal.emailReminders.recordPackage, { workspaceId: pkg.workspaceId, packageId: args.packageId, sends });
    } catch {
      console.error("First package email failed.");
    }
    return null;
  },
});
