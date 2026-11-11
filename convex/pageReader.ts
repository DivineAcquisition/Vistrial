/**
 * The page reader: Vistrial opens a public web page the way a visitor would and keeps what is on it (the
 * text in reading order, headings, buttons and where they go, forms, images, and with a hosted browser a
 * screenshot at desktop and phone widths).
 *
 * A person sees the plan and the most it can cost before anything is opened, and confirms it. Pages are then
 * read one at a time by `pageReadActions.next`. The rules a read obeys (public addresses only, robots.txt, a
 * per-site rate limit, an honest user agent, no login, no challenge solving) live in lib/pageReader.
 *
 * What a page says is untrusted. It is stored as data and shown as data; nothing here acts on it.
 */

import { canWork, requireWork } from "./lib/roles";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { OUT_OF_CREDITS, accountFor, billingOn, chargeUsage, priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import type { PageSnapshot } from "./lib/pageReader/extract";
import { parseTarget } from "./lib/pageReader/net";
import { READ_LIMITS, REASON_WORDS } from "./lib/pageReader/read";
import { browserConfigured } from "./lib/pageReader/renderers";
import type { RobotsRules } from "./lib/pageReader/robots";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A robots.txt that could not be read is asked for again sooner than one that was. */
const ROBOTS_RETRY_MS = 10 * 60 * 1000;

/**
 * What reading one page costs us, in cents. A plain request is close to free: a tenth of a cent covers the
 * compute. A hosted browser adds two renders (about $0.001 on Cloudflare Browser Run at $0.09 a browser
 * hour) and two stored screenshots; half a cent covers them with room. Customers pay this times the markup.
 */
export const PAGE_COST_CENTS = { fetch: 0.1, browser: 0.5 } as const;
export type PageDriver = keyof typeof PAGE_COST_CENTS;

export function plannedDriver(): PageDriver {
  return browserConfigured() ? "browser" : "fetch";
}

/** The most a job of `count` pages can cost, in cents of credit. */
export function maxPriceCents(count: number, driver: PageDriver) {
  return priceFor(PAGE_COST_CENTS[driver] * count);
}

/** The links a person gave, tidied: trimmed, de-duplicated, each either a page we may try or the reason not. */
export function checkUrls(raw: string[]) {
  const seen = new Set<string>();
  const rows: { url: string; ok: boolean; reasonCode: string | null }[] = [];
  for (const entry of raw) {
    const text = entry.trim();
    if (!text) continue;
    // A bare "example.com" is read as https.
    const target = parseTarget(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    const url = target.ok ? target.url.href : text.slice(0, 500);
    if (seen.has(url)) continue;
    seen.add(url);
    rows.push({ url, ok: target.ok, reasonCode: target.ok ? null : target.reason });
  }
  return rows;
}

async function heldCents(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  let held = 0;
  for (const status of ["queued", "running"] as const) {
    const rows = await ctx.db
      .query("pageReadJobs")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .take(50);
    // A job an agent run asked for is paid by the run, under the run's own cap.
    held += rows.reduce((sum, row) => sum + (row.runId ? 0 : row.holdCents), 0);
  }
  return held;
}

async function readToday(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("pageReads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).gt("createdAt", Date.now() - DAY_MS))
    .take(READ_LIMITS.pagesPerDay + 1);
  return rows.length;
}

/**
 * The plan and the budget, before anything is opened: which links will be tried, which will not and why,
 * how they will be read, the limits, and the most it can cost.
 */
export const quote = workspaceQuery({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, args) => {
    const rows = checkUrls(args.urls.slice(0, 40));
    const ok = rows.filter((row) => row.ok);
    const driver = plannedDriver();
    const count = Math.min(ok.length, READ_LIMITS.pagesPerJob);
    const totalCents = maxPriceCents(count, driver);
    const account = billingOn() ? await accountFor(ctx, ctx.workspaceId) : null;
    const available = account ? account.balanceCents - (await heldCents(ctx, ctx.workspaceId)) : null;
    const leftToday = Math.max(0, READ_LIMITS.pagesPerDay - (await readToday(ctx, ctx.workspaceId)));
    return {
      pages: rows.map((row) => ({ url: row.url, ok: row.ok, reason: row.reasonCode ? (REASON_WORDS[row.reasonCode] ?? "This link cannot be read.") : null })),
      count,
      tooMany: ok.length > READ_LIMITS.pagesPerJob,
      driver,
      /** Screenshots need the hosted browser. Without it the words, buttons, forms and images are still read. */
      screenshots: driver === "browser",
      /** The most this can cost. Pages that are blocked or fail are not charged. */
      totalCents,
      limits: {
        pagesPerJob: READ_LIMITS.pagesPerJob,
        pagesLeftToday: leftToday,
        megabytesPerPage: READ_LIMITS.bytesPerPage / 1_000_000,
        secondsPerPage: READ_LIMITS.pageMs / 1000,
        secondsBetweenPagesOnOneSite: READ_LIMITS.siteGapMs / 1000,
      },
      /** Null when billing is off (local and test deployments): nothing is blocked there. */
      availableCents: available,
      canAfford: available === null || available >= totalCents,
      canStart: canWork(ctx.member.role),
    };
  },
});

/** Refuses a list that cannot be read as given: nothing in it, too many, or a link that is not a public page. */
function assertReadable(rows: ReturnType<typeof checkUrls>) {
  const bad = rows.find((row) => !row.ok);
  if (bad) throw userError(`${bad.url}: ${REASON_WORDS[bad.reasonCode ?? ""] ?? "This link cannot be read."}`);
  if (rows.length === 0) throw userError("Add at least one page to read.");
  if (rows.length > READ_LIMITS.pagesPerJob) throw userError(`Up to ${READ_LIMITS.pagesPerJob} pages at a time.`, "limit");
}

/** Creates a job and its pages. Shared with agent runs, which pass their `runId`. The caller schedules the reading. */
export async function createJob(ctx: MutationCtx, args: { workspaceId: Id<"workspaces">; userId: string; urls: string[]; runId?: Id<"agentRuns"> }) {
  const rows = checkUrls(args.urls);
  assertReadable(rows);
  if ((await readToday(ctx, args.workspaceId)) + rows.length > READ_LIMITS.pagesPerDay) throw userError(`Up to ${READ_LIMITS.pagesPerDay} pages a day. Try again tomorrow.`, "limit");
  const driver = plannedDriver();
  const holdCents = maxPriceCents(rows.length, driver);
  const now = Date.now();
  const jobId = await ctx.db.insert("pageReadJobs", {
    workspaceId: args.workspaceId,
    status: "queued",
    driver,
    pages: rows.length,
    holdCents,
    costCents: 0,
    ...(args.runId ? { runId: args.runId } : {}),
    startedBy: args.userId,
    createdAt: now,
  });
  for (const [order, row] of rows.entries()) {
    await ctx.db.insert("pageReads", { workspaceId: args.workspaceId, jobId, order, url: row.url, status: "queued", costCents: 0, createdAt: now });
  }
  return { jobId, pages: rows.length, holdCents };
}

/**
 * Reads the pages a person confirmed. `confirmedCents` is the most they were shown; if that is no longer the
 * price, nothing is opened and they are shown the new one. Owners, Admins and Members.
 */
export const start = workspaceMutation({
  args: { urls: v.array(v.string()), confirmedCents: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const rows = checkUrls(args.urls);
    assertReadable(rows);
    const price = maxPriceCents(rows.length, plannedDriver());
    if (args.confirmedCents !== price) throw userError("The price changed. Check the new price and confirm again.");
    if (billingOn()) {
      const account = await accountFor(ctx, ctx.workspaceId);
      const available = (account?.balanceCents ?? 0) - (await heldCents(ctx, ctx.workspaceId));
      if (!account || available <= 0) throw userError(OUT_OF_CREDITS, "out_of_credits");
      if (available < price) throw userError("Your credit balance does not cover reading these pages. An owner can add credits in Billing, or choose fewer pages.", "out_of_credits");
    }
    const job = await createJob(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, urls: args.urls });
    await ctx.scheduler.runAfter(0, internal.pageReadActions.next, { jobId: job.jobId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "pages.started", subject: job.jobId, count: job.pages });
    return job;
  },
});

/** Stops a job. Pages already read are kept and charged; the rest are not opened. Owners, Admins and Members. */
export const stop = workspaceMutation({
  args: { jobId: v.id("pageReadJobs") },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.workspaceId !== ctx.workspaceId) notFound();
    if (job.status === "done" || job.status === "stopped") return { stopped: false };
    await finish(ctx, job, "stopped");
    return { stopped: true };
  },
});

async function pagesOf(ctx: QueryCtx, job: Pick<Doc<"pageReadJobs">, "_id" | "workspaceId">) {
  return ctx.db
    .query("pageReads")
    .withIndex("by_workspace_job", (q) => q.eq("workspaceId", job.workspaceId).eq("jobId", job._id))
    .take(READ_LIMITS.pagesPerJob + 1);
}

/** Ends a job: pages not yet read are marked, and the pages that were read are charged once. */
async function finish(ctx: MutationCtx, job: Doc<"pageReadJobs">, status: "done" | "stopped") {
  const pages = await pagesOf(ctx, job);
  let costCents = 0;
  for (const page of pages) {
    if (page.status === "queued" || page.status === "reading") await ctx.db.patch(page._id, { status: "failed", reasonCode: "stopped" });
    else costCents += page.costCents;
  }
  // Fractions of a cent add up across pages; rounding to a thousandth keeps the ledger free of float noise.
  costCents = Math.round(costCents * 1000) / 1000;
  await ctx.db.patch(job._id, { status, costCents, holdCents: 0, finishedAt: Date.now() });
  if (!job.runId) await chargeUsage(ctx, { workspaceId: job.workspaceId, costCents, source: "page", ref: job._id });
  await writeAudit(ctx, { workspaceId: job.workspaceId, actorType: "system", actorId: "page-reader", action: "pages.finished", subject: job._id, count: pages.filter((row) => row.status === "read" || row.status === "partial").length });
  return costCents;
}

function pageView(row: Doc<"pageReads">) {
  return {
    id: row._id,
    url: row.url,
    status: row.status,
    reasonCode: row.reasonCode ?? null,
    reason: row.reasonCode && row.reasonCode !== "ok" ? (REASON_WORDS[row.reasonCode] ?? "This page could not be read.") : null,
    finalUrl: row.finalUrl ?? null,
    httpStatus: row.httpStatus ?? null,
    driver: row.driver ?? null,
    title: row.title ?? null,
    htmlBytes: row.htmlBytes ?? null,
    wireBytes: row.wireBytes ?? null,
    redirects: row.redirects ?? 0,
    hasScreenshots: Boolean(row.desktopShot || row.phoneShot),
    readAt: row.readAt ?? null,
  };
}

/** A job and its pages, without the page bodies. Any member can read it. */
export const job = workspaceQuery({
  args: { jobId: v.id("pageReadJobs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.jobId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    const pages = await pagesOf(ctx, row);
    return {
      id: row._id,
      status: row.status,
      driver: row.driver,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt ?? null,
      /** What was charged, in cents of credit, once the job ended. */
      chargedCents: row.status === "done" || row.status === "stopped" ? (row.runId ? 0 : priceFor(row.costCents)) : null,
      holdCents: row.holdCents,
      pages: pages.map(pageView),
    };
  },
});

/** One page in full: what was found on it and its screenshots. The content is the page's own, shown as data. */
export const page = workspaceQuery({
  args: { readId: v.id("pageReads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.readId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    let snapshot: PageSnapshot | null = null;
    try {
      snapshot = row.snapshot ? (JSON.parse(row.snapshot) as PageSnapshot) : null;
    } catch {
      snapshot = null;
    }
    return {
      ...pageView(row),
      snapshot,
      screenshots: {
        desktop: row.desktopShot ? await ctx.storage.getUrl(row.desktopShot) : null,
        phone: row.phoneShot ? await ctx.storage.getUrl(row.phoneShot) : null,
      },
    };
  },
});

/** The newest jobs, for a list. */
export const recent = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("pageReadJobs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(20);
    return rows.map((row) => ({ id: row._id, status: row.status, pages: row.pages, driver: row.driver, createdAt: row.createdAt, fromRun: Boolean(row.runId) }));
  },
});

/* ---- Internal: what the reading action calls. ---- */

/** Takes the next page of a job to read, or ends the job when none is left. */
export const claimNext = internalMutation({
  args: { jobId: v.id("pageReadJobs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.jobId);
    if (!row || row.status === "done" || row.status === "stopped") return null;
    const pages = await pagesOf(ctx, row);
    // A page left "reading" by an action that died is not read twice: it is closed as failed.
    for (const page of pages) if (page.status === "reading") await ctx.db.patch(page._id, { status: "failed", reasonCode: "timeout" });
    const next = pages.sort((a, b) => a.order - b.order).find((page) => page.status === "queued");
    if (!next) {
      await finish(ctx, row, "done");
      return null;
    }
    if (row.status === "queued") await ctx.db.patch(row._id, { status: "running" });
    await ctx.db.patch(next._id, { status: "reading" });
    return { readId: next._id, url: next.url };
  },
});

/** Saves what one page read returned. A page that was read is costed; one that was blocked or failed is free. */
export const savePage = internalMutation({
  args: {
    readId: v.id("pageReads"),
    state: v.union(v.literal("read"), v.literal("partial"), v.literal("blocked"), v.literal("failed")),
    reasonCode: v.string(),
    finalUrl: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    driver: v.union(v.literal("fetch"), v.literal("browser")),
    snapshot: v.optional(v.string()),
    title: v.optional(v.string()),
    htmlBytes: v.number(),
    wireBytes: v.number(),
    redirects: v.number(),
    durationMs: v.number(),
    desktopShot: v.optional(v.id("_storage")),
    phoneShot: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { readId, state, ...result }) => {
    const row = await ctx.db.get(readId);
    // Stopped while the page was out: the result is dropped, and its files with it.
    if (!row || row.status !== "reading") {
      for (const id of [result.desktopShot, result.phoneShot]) if (id) await ctx.storage.delete(id);
      return null;
    }
    const delivered = state === "read" || state === "partial";
    await ctx.db.patch(readId, { status: state, ...result, costCents: delivered ? PAGE_COST_CENTS[result.driver] : 0, readAt: Date.now() });
    return null;
  },
});

/** A site's cached robots rules, while they are fresh. */
export const siteRobots = internalQuery({
  args: { site: v.string() },
  handler: async (ctx, args): Promise<RobotsRules | null> => {
    const row = await ctx.db.query("pageSites").withIndex("by_site", (q) => q.eq("site", args.site)).unique();
    if (!row?.robots) return null;
    let rules: RobotsRules;
    try {
      rules = JSON.parse(row.robots.rules) as RobotsRules;
    } catch {
      return null;
    }
    const ttl = rules.unavailable ? ROBOTS_RETRY_MS : READ_LIMITS.robotsTtlMs;
    return Date.now() - row.robots.fetchedAt < ttl ? rules : null;
  },
});

export const saveRobots = internalMutation({
  args: { site: v.string(), rules: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("pageSites").withIndex("by_site", (q) => q.eq("site", args.site)).unique();
    const robots = { fetchedAt: Date.now(), rules: args.rules.slice(0, 60_000) };
    if (row) await ctx.db.patch(row._id, { robots });
    else await ctx.db.insert("pageSites", { site: args.site, nextAt: 0, robots });
    return null;
  },
});

/**
 * The per-site rate limit. Each caller is given the site's next free slot and the slot after it is pushed
 * back by the gap, so however many jobs want one site, their requests are spaced out. A slot too far away is
 * refused instead of queued.
 */
export const claimSite = internalMutation({
  args: { site: v.string(), gapMs: v.number(), maxWaitMs: v.number() },
  handler: async (ctx, args): Promise<{ waitMs: number } | { denied: true }> => {
    const now = Date.now();
    const row = await ctx.db.query("pageSites").withIndex("by_site", (q) => q.eq("site", args.site)).unique();
    const slot = Math.max(now, row?.nextAt ?? 0);
    if (slot - now > args.maxWaitMs) return { denied: true };
    if (row) await ctx.db.patch(row._id, { nextAt: slot + args.gapMs });
    else await ctx.db.insert("pageSites", { site: args.site, nextAt: slot + args.gapMs });
    return { waitMs: slot - now };
  },
});
