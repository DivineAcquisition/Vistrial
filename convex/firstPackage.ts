/**
 * Strategist's first package: free, once per organization, inside a fixed limit of our cost.
 *   (a) market research on the business's market (Market Intelligence), grounded in what onboarding captured;
 *   (b) two offer ideas, one to win customers and one to keep them (Offer Intelligence, first-package mode),
 *       built on the approved research and the business's own offers;
 *   (c) a teardown of up to five of the business's own pages (Landing Page Teardown, own-site mode).
 * Research and teardown start together; the offer ideas follow the approved research. Each part arrives
 * approved when its own checks pass, and as "needs your review" when they do not. The Owner is emailed when
 * the research and offer ideas are done. docs/rebuild/onboarding-and-first-package.md, part 3.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { approveAsset } from "./assets";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { post } from "./lib/briefing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound } from "./lib/errors";
import { parseResult } from "./lib/siteCapture/fields";
import { ALL_PLATFORMS } from "./lib/intake";
import { isOwner } from "./lib/roles";
import { cleanScope } from "./research";
import { startRunFor } from "./runs";
import { FIRST_PACKAGE_REF } from "./skills/offerIntelligence/firstPackage";
import { MAX_PAGES } from "./skills/landingTeardown/shapes";

/** The most one package may cost us, all parts together, in cents: $15.00 (the owner's decision). Never the customer's credits. */
export const PACKAGE_LIMIT_CENTS = 1500;
/** Each part's share of the limit, in cents. The site capture (up to 50) is read on the same terms during onboarding. */
export const PART_SHARE_CENTS = { research: 700, offers: 300, teardown: 500 } as const;
/** A part that stops without a report is tried once more, inside what is left of its share. */
export const PART_ATTEMPTS = 2;
/** Below this much of a share left, a retry is not worth starting. */
const MIN_RETRY_CENTS = 40;
/** Packages one account may have, across its organizations. */
export const PACKAGES_PER_ACCOUNT = 3;
/** Free packages started across the platform in a day, at most: $400 of limits. More wait for the next day. */
export const DAILY_PACKAGE_BUDGET_CENTS = 40_000;
/** How often the package looks at its runs while they work, and when it gives up waiting on one. */
const ADVANCE_MS = 20_000;
const GIVE_UP_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PartKey = keyof typeof PART_SHARE_CENTS;
type Part = Doc<"firstPackages">["research"];
const waiting = (): Part => ({ state: "waiting", attempts: 0, spentCents: 0 });
const SETTLED = new Set<Part["state"]>(["done", "needsReview", "failed", "skipped"]);

export function settled(part: Pick<Part, "state">) {
  return SETTLED.has(part.state);
}

/** What one more attempt of a part may spend: what is left of its share, and of the whole limit. */
export function capFor(pkg: Pick<Doc<"firstPackages">, "research" | "offers" | "teardown" | "limitCents">, key: PartKey) {
  const spent = pkg.research.spentCents + pkg.offers.spentCents + pkg.teardown.spentCents;
  return Math.max(0, Math.min(PART_SHARE_CENTS[key] - pkg[key].spentCents, pkg.limitCents - spent));
}

async function packageOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("firstPackages")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();
}

/**
 * Starts the package for an organization, once. Called when onboarding is confirmed. An account that has
 * had its share gets none; a day whose free budget is used waits for the next (a cron starts it).
 */
export async function startPackage(ctx: MutationCtx, args: { workspaceId: Id<"workspaces">; ownerId: string; onboardingId: Id<"onboarding"> }) {
  const existing = await packageOf(ctx, args.workspaceId);
  if (existing) return existing._id;
  const workspace = await ctx.db.get(args.workspaceId);
  const accountId = workspace?.accountId;
  const now = Date.now();
  const base = { workspaceId: args.workspaceId, ...(accountId ? { accountId } : {}), ownerId: args.ownerId, limitCents: PACKAGE_LIMIT_CENTS, research: waiting(), offers: waiting(), teardown: waiting(), createdAt: now };
  if (accountId) {
    const mine = await ctx.db
      .query("firstPackages")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(PACKAGES_PER_ACCOUNT + 1);
    if (mine.filter((row) => !row.reason).length >= PACKAGES_PER_ACCOUNT) {
      const skipped: Part = { state: "skipped", attempts: 0, spentCents: 0, reason: "account_limit" };
      return ctx.db.insert("firstPackages", { ...base, status: "done", reason: "account_limit", research: skipped, offers: skipped, teardown: skipped, finishedAt: now });
    }
  }
  const today = await ctx.db
    .query("firstPackages")
    .withIndex("by_created", (q) => q.gt("createdAt", now - DAY_MS))
    .take(Math.ceil(DAILY_PACKAGE_BUDGET_CENTS / PACKAGE_LIMIT_CENTS) + 1);
  const started = today.filter((row) => row.status !== "waiting" && !row.reason).length;
  const overBudget = started * PACKAGE_LIMIT_CENTS >= DAILY_PACKAGE_BUDGET_CENTS;
  const packageId = await ctx.db.insert("firstPackages", { ...base, status: overBudget ? "waiting" : "running" });
  await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.ownerId, action: overBudget ? "package.waiting" : "package.started", subject: packageId });
  if (!overBudget) await launch(ctx, packageId);
  return packageId;
}

async function onboardingOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("onboarding")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .first();
}

async function ownerRole(ctx: QueryCtx, pkg: Doc<"firstPackages">) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", pkg.workspaceId).eq("userId", pkg.ownerId))
    .first();
  return member?.active && isOwner(member.role) ? member.role : null;
}

/** The research project for (a): the confirmed business, its goal, and its own pages as supplied links. */
export async function researchScope(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const row = await onboardingOf(ctx, workspaceId);
  const workspace = await ctx.db.get(workspaceId);
  const business = row?.business ?? { name: workspace?.name ?? "", website: "", offer: "", area: "", audience: "" };
  const capture = row?.captureId ? await ctx.db.get(row.captureId) : null;
  const result = parseResult(capture?.result);
  const bare = (value: string) => value.trim().replace(/[.!?;:,\s]+$/, "");
  const offers = (result?.offers.value ?? []).map((offer) => (offer.price ? `${offer.name} (${offer.price})` : offer.name)).slice(0, 4);
  const goal = row?.goal.text ? ` Their main goal, in their words: ${row.goal.text}.` : "";
  const objective = [
    `Find where ${business.name} stands in its market for ${bare(business.offer)} in ${bare(business.area)}: who competes for the same buyers, what they offer and at what price, how they win customers, and where ${business.name} can stand out.`,
    business.audience ? ` Its customers: ${bare(business.audience)}.` : "",
    offers.length ? ` What it sells, as its website states: ${offers.join("; ")}.` : "",
    goal,
  ].join("");
  const pages = (capture?.pages ?? []).filter((page) => page.read).map((page) => page.url).slice(0, 5);
  return cleanScope({
    title: `${business.name}: market research`.slice(0, 120),
    objective: objective.slice(0, 2000),
    market: business.offer.slice(0, 200),
    geography: business.area.slice(0, 200),
    competitors: [],
    platforms: [...ALL_PLATFORMS],
    suppliedUrls: pages,
  });
}

async function startPart(ctx: MutationCtx, pkg: Doc<"firstPackages">, key: PartKey): Promise<Part> {
  const prior = pkg[key];
  const cap = capFor(pkg, key);
  if (prior.attempts > 0 && cap < MIN_RETRY_CENTS) return { ...prior, state: "failed", reason: "cap" };
  const role = await ownerRole(ctx, pkg);
  if (!role) return { ...prior, state: "skipped", reason: "no_owner" };
  const common = { workspaceId: pkg.workspaceId, userId: pkg.ownerId, role, free: true, packageId: pkg._id, capCentsOverride: cap, agentSlug: GROWTH_ARCHITECT, mode: "thorough" as const, unattended: true };
  const now = Date.now();

  if (key === "research") {
    let projectId = prior.projectId;
    if (!projectId) {
      projectId = await ctx.db.insert("researchProjects", { workspaceId: pkg.workspaceId, ...(await researchScope(ctx, pkg.workspaceId)), status: "draft", createdBy: pkg.ownerId, createdAt: now, updatedAt: now });
    }
    const runId = await startRunFor(ctx, { ...common, skillSlug: "market-intelligence", projectId });
    return { ...prior, state: "running", runId, projectId, attempts: prior.attempts + 1, reason: undefined };
  }

  if (key === "offers") {
    if (pkg.research.state !== "done") return { ...prior, state: "skipped", reason: "no_research" };
    const runId = await startRunFor(ctx, { ...common, skillSlug: "offer-intelligence", inputRef: `${FIRST_PACKAGE_REF}${pkg._id}` });
    return { ...prior, state: "running", runId, attempts: prior.attempts + 1, reason: undefined };
  }

  // The teardown: the pages chosen on Confirm, the home page first. None chosen (or no website): skipped.
  const row = await onboardingOf(ctx, pkg.workspaceId);
  const capture = row?.captureId ? await ctx.db.get(row.captureId) : null;
  const chosen = (row?.teardownPages ?? []).map((id) => capture?.pages.find((page) => page.id === id && page.read)).filter((page): page is NonNullable<typeof page> => Boolean(page));
  if (!capture || chosen.length === 0) return { ...prior, state: "skipped", reason: "no_pages" };
  const ordered = [...chosen.filter((page) => page.kind === "home"), ...chosen.filter((page) => page.kind !== "home")].slice(0, Math.min(5, MAX_PAGES));
  const [first, ...rest] = ordered;
  const industry = (row?.business.offer || row?.business.name || "this business").slice(0, 120);
  const projectId = await ctx.db.insert("researchProjects", {
    workspaceId: pkg.workspaceId,
    title: `Your pages: ${row?.business.name ?? ""}`.slice(0, 80),
    objective: "What should change on the business's own pages, page by page and across the path a visitor takes?",
    market: industry,
    geography: "",
    competitors: [],
    platforms: ["web"],
    suppliedUrls: ordered.map((page) => page.url),
    status: "draft",
    createdBy: pkg.ownerId,
    createdAt: now,
    updatedAt: now,
  });
  const requestId = await ctx.db.insert("teardownRequests", {
    workspaceId: pkg.workspaceId,
    projectId,
    industry,
    ownUrl: first.url,
    urls: rest.map((page) => page.url),
    find: false,
    mode: "ownSite",
    createdBy: pkg.ownerId,
    createdAt: now,
  });
  const runId = await startRunFor(ctx, { ...common, skillSlug: "landing-page-teardown", projectId });
  await ctx.db.patch(requestId, { runId });
  return { ...prior, state: "running", runId, projectId, requestId, attempts: prior.attempts + 1, reason: undefined };
}

async function launch(ctx: MutationCtx, packageId: Id<"firstPackages">) {
  const pkg = (await ctx.db.get(packageId))!;
  const research = await startPart(ctx, pkg, "research");
  const teardown = await startPart(ctx, { ...pkg, research }, "teardown");
  await ctx.db.patch(packageId, { status: "running", research, teardown });
  await ctx.scheduler.runAfter(ADVANCE_MS, internal.firstPackage.advance, { packageId });
}

/** Approves a part's report when its checks passed, as the Owner who chose a ready-to-use package. */
async function approve(ctx: MutationCtx, pkg: Doc<"firstPackages">, asset: Doc<"assets">): Promise<"done" | "needsReview"> {
  if (asset.status === "approved") return "done";
  if (asset.status !== "draft") return "needsReview";
  try {
    await approveAsset(Object.assign(ctx, { workspaceId: pkg.workspaceId, identity: { subject: pkg.ownerId } }), asset);
  } catch {
    // A claim whose source has gone: it stays for a person to review, never approved over a failed rule.
    return "needsReview";
  }
  await writeAudit(ctx, { workspaceId: pkg.workspaceId, actorType: "system", actorId: "first-package", action: "asset.approved_first_package", subject: asset._id });
  return "done";
}

/** Where one running part is now, from its run. */
async function check(ctx: MutationCtx, pkg: Doc<"firstPackages">, key: PartKey): Promise<Part> {
  const part = pkg[key];
  if (part.state !== "running" || !part.runId) return part;
  const run = await ctx.db.get(part.runId);
  if (!run) return { ...part, state: "failed", reason: "failed" };
  if (run.status === "queued" || run.status === "running" || run.status === "waiting" || run.status === "needsInput") {
    if (Date.now() - run.startedAt > GIVE_UP_MS) return { ...part, state: "failed", reason: "timeout" };
    return part;
  }
  // Each attempt's cost, added up, is what the share has used.
  const used = part.spentCents + run.costCents;
  const asset = await ctx.db
    .query("assets")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", pkg.workspaceId).eq("createdByRun", run._id))
    .first();
  if (asset) return { ...part, spentCents: used, assetId: asset._id, state: await approve(ctx, pkg, asset), reason: undefined };
  // Stopped without a report: once more, inside what is left of its share.
  const next = { ...pkg, [key]: { ...part, spentCents: used } };
  if (part.attempts < PART_ATTEMPTS) return startPart(ctx, next, key);
  return { ...part, spentCents: used, state: "failed", reason: run.stopReason === "cap" ? "cap" : "failed" };
}

/** Looks at the package's runs, moves it on, and looks again shortly while anything is still working. */
export const advance = internalMutation({
  args: { packageId: v.id("firstPackages") },
  handler: async (ctx, args) => {
    let pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.status !== "running") return null;
    const research = await check(ctx, pkg, "research");
    const teardown = await check(ctx, { ...pkg, research }, "teardown");
    let offers = await check(ctx, { ...pkg, research, teardown }, "offers");
    // The offer ideas follow the approved research. Research that did not arrive approved means none.
    if (offers.state === "waiting" && settled(research)) offers = await startPart(ctx, { ...pkg, research, teardown }, "offers");
    await ctx.db.patch(pkg._id, { research, teardown, offers });
    pkg = (await ctx.db.get(pkg._id))!;

    if (!pkg.emailedAt && settled(pkg.research) && settled(pkg.offers)) {
      await ctx.db.patch(pkg._id, { emailedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.emailReminders.sendFirstPackage, { packageId: pkg._id });
    }
    if (settled(pkg.research) && settled(pkg.offers) && settled(pkg.teardown)) {
      await ctx.db.patch(pkg._id, { status: "done", finishedAt: Date.now() });
      await post(ctx, {
        workspaceId: pkg.workspaceId,
        kind: "finished",
        agentSlug: GROWTH_ARCHITECT,
        title: "Your first package is ready",
        body: "Market research, two offer ideas and a teardown of your own pages, from Strategist. On Vistrial: it used none of your credits.",
        ref: { table: "firstPackages", id: pkg._id },
        key: `first-package:${pkg._id}`,
      });
      await writeAudit(ctx, { workspaceId: pkg.workspaceId, actorType: "system", actorId: "first-package", action: "package.finished", subject: pkg._id });
      return null;
    }
    await ctx.scheduler.runAfter(ADVANCE_MS, internal.firstPackage.advance, { packageId: pkg._id });
    return null;
  },
});

/** Starts packages that waited for the day's free budget. Hourly, from crons. */
export const startWaiting = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = await ctx.db
      .query("firstPackages")
      .withIndex("by_created", (q) => q.gt("createdAt", now - DAY_MS))
      .take(500);
    let room = Math.floor(DAILY_PACKAGE_BUDGET_CENTS / PACKAGE_LIMIT_CENTS) - today.filter((row) => row.status !== "waiting" && !row.reason).length;
    const queued = await ctx.db
      .query("firstPackages")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(50);
    for (const row of queued) {
      if (room <= 0) break;
      await launch(ctx, row._id);
      room -= 1;
    }
    return null;
  },
});

// ------------------------------------------------------------------------------------------- reading

const PART_WORDS: Record<PartKey, { title: string; gives: string }> = {
  research: { title: "Market research", gives: "Who competes for your buyers, what they offer and charge, and where you can stand out." },
  offers: { title: "Two offer ideas", gives: "One to win customers and one to keep them, built from your offers and prices." },
  teardown: { title: "Your pages, torn down", gives: "Up to five of your own pages against the landing page framework, with what to change." },
};

export const REASON_WORDS: Record<string, string> = {
  no_pages: "No pages of your own were read, so there was nothing to tear down.",
  no_research: "The research did not arrive approved, so the offer ideas were not written. Review the research, then ask Strategist for offer ideas.",
  cap: "It reached the free package's limit before finishing.",
  failed: "It stopped without a report.",
  timeout: "It took too long and was stopped.",
  no_owner: "The Owner who set this up is no longer the Owner.",
  account_limit: "Your account has already had its free packages.",
};

/** The phase a running part is in, in words, from its run's latest step. */
async function phaseOf(ctx: QueryCtx, runId: Id<"agentRuns"> | undefined) {
  if (!runId) return null;
  const run = await ctx.db.get(runId);
  if (!run) return null;
  const steps = await ctx.db
    .query("runSteps")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(200);
  const last = steps.sort((a, b) => b.index - a.index)[0];
  return { steps: steps.length, phase: last?.phase ?? null, status: run.status };
}

/** The organization's first package, for Home and the Briefing. Null when it has none. Any member reads it. */
export const mine = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const pkg = await packageOf(ctx, ctx.workspaceId);
    if (!pkg) return null;
    const parts = [];
    for (const key of ["research", "offers", "teardown"] as const) {
      const part = pkg[key];
      const asset = part.assetId ? await ctx.db.get(part.assetId) : null;
      const progress = part.state === "running" ? await phaseOf(ctx, part.runId) : null;
      parts.push({
        key,
        ...PART_WORDS[key],
        state: part.state,
        attempts: part.attempts,
        phase: progress?.phase ?? null,
        steps: progress?.steps ?? 0,
        assetId: asset?._id ?? null,
        assetTitle: asset?.title ?? null,
        reason: part.reason ? (REASON_WORDS[part.reason] ?? null) : null,
      });
    }
    return { id: pkg._id, status: pkg.status, reason: pkg.reason ? (REASON_WORDS[pkg.reason] ?? null) : null, parts, emailed: Boolean(pkg.emailedAt), dismissed: Boolean(pkg.dismissedAt), createdAt: pkg.createdAt, finishedAt: pkg.finishedAt ?? null };
  },
});

/** Takes the finished package off the top of Home. Its reports stay where they are. */
export const dismiss = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    const pkg = await packageOf(ctx, ctx.workspaceId);
    if (!pkg) notFound();
    if (pkg.status === "done" && !pkg.dismissedAt) await ctx.db.patch(pkg._id, { dismissedAt: Date.now() });
    return null;
  },
});
