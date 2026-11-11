/**
 * The Pages workspace: landing page teardowns. A person names an industry and the pages to read (their own,
 * others they chose, and optionally "find what competitors run"), sees the plan and the most it can cost,
 * and confirms. The run reads each page with the page reader, matches its sections to the owner's landing
 * page framework, and reports what the pages share and what the person's own page lacks.
 *
 * Vistrial sees a page, not its results. Every screen and every saved teardown says so.
 */

import { canWork, requireWork } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { accountFor, billingOn, priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { defaultCapsFor } from "./lib/caps";
import { loadCaps } from "./lib/capRows";
import { BASIS_LABEL } from "./lib/evidence";
import { notFound, userError } from "./lib/errors";
import type { PageSnapshot } from "./lib/pageReader/extract";
import { READ_LIMITS, REASON_WORDS } from "./lib/pageReader/read";
import { savedRecord } from "./lib/savedRecords";
import { PAGE_COST_CENTS, checkUrls, createJob, plannedDriver } from "./pageReader";
import { startRunFor } from "./runs";
import { FAQ_TOPICS, FAQ_TOPIC_WORDS, FRAMEWORK, SECTION_BY_KEY } from "./skills/landingTeardown/framework";
import { HONEST_LIMIT, MAX_FOUND, MAX_INDUSTRY, MAX_NOTE, MAX_PAGES, PHASE, SKILL_SLUG, parseJson, readIndustry, type TeardownRecord } from "./skills/landingTeardown/shapes";

const OPEN = ["queued", "running", "waiting", "needsInput"] as const;
const STATUS_ORDER: Record<Doc<"assets">["status"], number> = { needsReview: 0, draft: 1, approved: 2, rejected: 3, archived: 4 };

/** Sites whose pages are never a business's own landing page, whatever a search returns. */
const NOT_LANDING = /(^|\.)(facebook|instagram|linkedin|youtube|tiktok|twitter|x|pinterest|reddit|google|bing|yelp|trustpilot|clutch|g2|capterra|upwork|fiverr|wikipedia|medium|substack|amazon|apple)\.[a-z.]+$/i;

/** Plain words for where a run is, as the Pages tab shows it. */
export function phaseWords(phase: string | undefined | null): string {
  if (!phase) return "Getting started";
  if (phase.startsWith("analyse:")) return `Reading page ${Number(phase.split(":")[1]) + 1} against the framework`;
  return (
    {
      [PHASE.context]: "Reading your request",
      [PHASE.discover]: "Searching for pages competitors run",
      [PHASE.read]: "Opening the pages",
      [PHASE.apply]: "Counting what the pages share",
      [PHASE.industry]: "Writing what the pages share and what yours lacks",
      [PHASE.check]: "Checking every finding against the pages",
      [PHASE.revise]: "Revising",
      [PHASE.recheck]: "Checking the revision",
      [PHASE.save]: "Saving for your review",
    } as Record<string, string>
  )[phase] ?? "Working";
}

type Ask = { industry: string; ownUrl?: string; urls: string[]; find: boolean; note?: string };

/** The ask, tidied: which links will be read, which will not and why, and whether there is anything to do. */
function plan(ask: Ask) {
  const industry = ask.industry.replace(/\s+/g, " ").trim().slice(0, MAX_INDUSTRY);
  const own = ask.ownUrl?.trim() ? checkUrls([ask.ownUrl])[0] : null;
  const others = checkUrls(ask.urls.slice(0, 20)).filter((row) => row.url !== own?.url);
  const given = [...(own ? [{ ...own, own: true }] : []), ...others.map((row) => ({ ...row, own: false }))];
  const ok = given.filter((row) => row.ok);
  const room = Math.max(0, MAX_PAGES - ok.length);
  const found = ask.find ? Math.min(MAX_FOUND, room) : 0;
  return { industry, own, given, ok, found, maxPages: Math.min(MAX_PAGES, ok.length) + found };
}

async function pagesToday(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("pageReads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).gt("createdAt", Date.now() - 24 * 60 * 60 * 1000))
    .take(READ_LIMITS.pagesPerDay + 1);
  return rows.length;
}

/**
 * The plan and the budget, before anything runs: the pages that will be opened, how, the steps, the limits
 * and the most a teardown can cost (the run's cap, which covers reading and analysis together).
 */
export const quote = workspaceQuery({
  args: { industry: v.string(), ownUrl: v.optional(v.string()), urls: v.array(v.string()), find: v.boolean() },
  handler: async (ctx, args) => {
    const asked = plan(args);
    const caps = await loadCaps(ctx, ctx.workspaceId, GROWTH_ARCHITECT, SKILL_SLUG);
    const driver = plannedDriver();
    const account = billingOn() ? await accountFor(ctx, ctx.workspaceId) : null;
    const maxCents = priceFor(caps.maxCostCentsPerRun);
    const leftToday = Math.max(0, READ_LIMITS.pagesPerDay - (await pagesToday(ctx, ctx.workspaceId)));
    const others = asked.ok.filter((row) => !row.own).length + asked.found;
    return {
      industry: asked.industry,
      pages: asked.given.map((row) => ({ url: row.url, own: row.own, ok: row.ok, reason: row.reasonCode ? (REASON_WORDS[row.reasonCode] ?? "This link cannot be read.") : null })),
      tooMany: asked.ok.length > MAX_PAGES,
      /** Pages the search may add. */
      found: asked.found,
      maxPages: asked.maxPages,
      driver,
      screenshots: driver === "browser",
      steps: [
        ...(asked.found ? [`Search the web for up to ${asked.found} landing page${asked.found === 1 ? "" : "s"} that businesses in ${asked.industry || "your industry"} run`] : []),
        `Open ${asked.maxPages === 1 ? "the page" : `up to ${asked.maxPages} pages`} the way a visitor would${driver === "browser" ? ", with a screenshot at desktop and phone widths" : " (no screenshots: the hosted browser is not set up)"}`,
        "Match each page's sections to the landing page framework: which objections it answers, in what order, and which it skips",
        others >= 2 ? "Count what the other pages share, and compare your page against them" : "Too few other pages for shared patterns: each page is still read against the framework",
        "Check every finding against the pages, then save it for you to approve",
      ],
      /** The most one teardown can cost, in cents of credit: the run stops at this cap. Reading is a small part of it. */
      maxCents,
      readingCents: priceFor(PAGE_COST_CENTS[driver] * asked.maxPages),
      limits: { pages: MAX_PAGES, pagesLeftToday: leftToday, megabytesPerPage: READ_LIMITS.bytesPerPage / 1_000_000, secondsBetweenPagesOnOneSite: READ_LIMITS.siteGapMs / 1000 },
      honest: HONEST_LIMIT,
      availableCents: account ? account.balanceCents : null,
      /** Whether the balance covers the cap. A run may start with less; it then stops when credit runs out. */
      coversMax: account ? account.balanceCents >= maxCents : true,
      ready: Boolean(asked.industry) && asked.maxPages > 0 && asked.given.every((row) => row.ok) && asked.ok.length <= MAX_PAGES && asked.maxPages <= leftToday,
      canStart: canWork(ctx.member.role),
    };
  },
});

/**
 * Starts a teardown the person confirmed. `confirmedCents` is the cap they were shown; if it changed, nothing
 * starts and they are shown the new one. Owners, Admins and Members.
 */
export const start = workspaceMutation({
  args: { industry: v.string(), ownUrl: v.optional(v.string()), urls: v.array(v.string()), find: v.boolean(), note: v.optional(v.string()), confirmedCents: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const asked = plan(args);
    if (!asked.industry) throw userError("Say which industry these pages are in.");
    const bad = asked.given.find((row) => !row.ok);
    if (bad) throw userError(`${bad.url}: ${REASON_WORDS[bad.reasonCode ?? ""] ?? "This link cannot be read."}`);
    if (asked.ok.length > MAX_PAGES) throw userError(`Up to ${MAX_PAGES} pages in one teardown.`, "limit");
    if (asked.maxPages === 0) throw userError("Add a page to read, or ask Vistrial to find pages competitors run.");
    if ((await pagesToday(ctx, ctx.workspaceId)) + asked.maxPages > READ_LIMITS.pagesPerDay) throw userError(`Up to ${READ_LIMITS.pagesPerDay} pages a day. Try again tomorrow.`, "limit");
    const note = (args.note ?? "").replace(/\s+/g, " ").trim();
    if (note.length > MAX_NOTE) throw userError(`Keep the note under ${MAX_NOTE} characters.`);
    const caps = await loadCaps(ctx, ctx.workspaceId, GROWTH_ARCHITECT, SKILL_SLUG);
    if (args.confirmedCents !== priceFor(caps.maxCostCentsPerRun)) throw userError("The budget changed. Check the new one and confirm again.");

    const now = Date.now();
    const urls = asked.ok.filter((row) => !row.own).map((row) => row.url);
    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      title: `Landing pages: ${asked.industry}`.slice(0, 80),
      objective: `Which patterns do landing pages in ${asked.industry} share, and what does ours lack?`,
      market: asked.industry,
      geography: "",
      competitors: [],
      platforms: ["web"],
      suppliedUrls: [...(asked.own?.ok ? [asked.own.url] : []), ...urls],
      status: "draft",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    const requestId = await ctx.db.insert("teardownRequests", {
      workspaceId: ctx.workspaceId,
      projectId,
      industry: asked.industry,
      ...(asked.own?.ok ? { ownUrl: asked.own.url } : {}),
      urls,
      find: asked.found > 0,
      ...(note ? { note } : {}),
      createdBy: ctx.identity.subject,
      createdAt: now,
    });
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: GROWTH_ARCHITECT, skillSlug: SKILL_SLUG, projectId });
    await ctx.db.patch(requestId, { runId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "teardown.started", subject: requestId, count: asked.maxPages });
    return { requestId, runId, projectId };
  },
});

/** The Pages tab: teardowns running now with where each is, the saved teardowns, and runs that ended with nothing. */
export const tab = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const running = [];
    for (const status of OPEN) {
      const rows = await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .order("desc")
        .take(20);
      for (const run of rows) {
        if (run.skillSlug !== SKILL_SLUG) continue;
        const steps = await ctx.db
          .query("runSteps")
          .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
          .take(60);
        const last = steps.sort((a, b) => a.index - b.index)[steps.length - 1];
        const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
        const project = projectId ? await ctx.db.get(projectId) : null;
        running.push({ id: run._id, startedAt: run.startedAt, priceCents: priceFor(run.costCents), industry: project?.workspaceId === ctx.workspaceId ? project.market : "", words: phaseWords(last?.phase) });
      }
    }
    running.sort((a, b) => b.startedAt - a.startedAt);

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "pageTeardown"))
      .order("desc")
      .take(30);
    const results = [];
    const withResult = new Set<string>();
    for (const asset of assets) {
      if (asset.createdByRun) withResult.add(asset.createdByRun);
      if (asset.status === "archived") continue;
      const saved = (await savedRecord(ctx.db, asset, "teardown")) as TeardownRecord | null;
      if (!saved) continue;
      results.push({ id: asset._id, title: asset.title, status: asset.status, createdAt: asset.createdAt, industry: saved.industry, pages: saved.pages.length, unread: saved.unread.length, suggestions: readIndustry(saved.read)?.suggestions.length ?? 0 });
    }
    results.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt);

    const stopped = (
      await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", GROWTH_ARCHITECT))
        .order("desc")
        .take(60)
    )
      .filter((run) => run.skillSlug === SKILL_SLUG && !(OPEN as readonly string[]).includes(run.status) && !withResult.has(run._id))
      .slice(0, 3)
      .map((run) => ({ id: run._id, status: run.status, stopReason: run.stopReason ?? null, startedAt: run.startedAt }));
    const caps = defaultCapsFor(SKILL_SLUG);
    return { running, results, stopped, maxPages: MAX_PAGES, defaultMaxCents: priceFor(caps.maxCostCentsPerRun) };
  },
});

async function teardownOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, assetId: Id<"assets">) {
  const asset = await ctx.db.get(assetId);
  if (!asset || asset.workspaceId !== workspaceId || asset.kind !== "pageTeardown") notFound();
  const saved = (await savedRecord(ctx.db, asset, "teardown")) as TeardownRecord | null;
  if (!saved) notFound();
  return { asset, saved, read: readIndustry(saved.read) };
}

const sectionName = (job: string | null) => (job && job in SECTION_BY_KEY ? SECTION_BY_KEY[job as keyof typeof SECTION_BY_KEY].name : null);

/** One teardown as the Pages tab draws it: each page's summary, what the pages share, the gaps, the changes to try and the checks. */
export const view = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const { asset, saved, read } = await teardownOf(ctx, ctx.workspaceId, args.assetId);
    const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
    const others = saved.pages.filter((page) => !page.own && page.analysis).length;
    return {
      assetId: asset._id,
      title: asset.title,
      status: asset.status,
      createdAt: asset.createdAt,
      versions: saved.versions,
      industry: saved.industry,
      projectId: run && run.workspaceId === ctx.workspaceId ? ctx.db.normalizeId("researchProjects", run.inputRef) : null,
      framework: FRAMEWORK.map((row) => ({ key: row.key, name: row.name, job: row.job, objection: row.objection, expected: row.expected })),
      pages: saved.pages.map((page) => ({
        id: page.id,
        title: page.title || page.host,
        host: page.host,
        url: page.finalUrl,
        own: page.own,
        origin: page.origin,
        driver: page.driver,
        partial: page.status === "partial",
        analysed: page.analysis !== null,
        facts: page.facts,
        order: page.order,
        skipped: page.skipped,
        droppedQuotes: page.droppedQuotes,
      })),
      unread: saved.unread,
      /** For each framework job, how many of the other pages have it. Counted in code. */
      table: saved.table.map((row) => ({ job: row.job, name: SECTION_BY_KEY[row.job].name, pages: row.pages, of: others })),
      summary: read?.summary ?? "",
      patterns: (read?.patterns ?? []).map((row) => ({ ...row, section: sectionName(row.job), basisLabel: BASIS_LABEL[row.basis] })),
      gaps: (read?.gaps ?? []).map((row) => ({ ...row, section: sectionName(row.job), basisLabel: BASIS_LABEL.inferred })),
      suggestions: (read?.suggestions ?? []).map((row, index) => ({ index, ...row, basisLabel: BASIS_LABEL[row.basis] })),
      hasBrief: Boolean(read?.brief.promise),
      checks: saved.checks,
      limits: saved.limits,
      /** The business has results of its own connected, so a change it tries is measured at its check-in. */
      measured: saved.measured,
    };
  },
});

/** One page of a teardown in full: its screenshots, and its blocks grouped into the sections the teardown found. */
export const page = workspaceQuery({
  args: { assetId: v.id("assets"), pageId: v.string() },
  handler: async (ctx, args) => {
    const { saved } = await teardownOf(ctx, ctx.workspaceId, args.assetId);
    const found = saved.pages.find((row) => row.id === args.pageId);
    if (!found) notFound();
    const readId = ctx.db.normalizeId("pageReads", found.readId);
    const row = readId ? await ctx.db.get(readId) : null;
    const snapshot = row && row.workspaceId === ctx.workspaceId ? (parseJson(row.snapshot) as PageSnapshot | null) : null;
    const blocks = snapshot?.blocks ?? [];
    const words = (index: number) => {
      const block = blocks[index];
      if (!block) return null;
      if (block.kind === "heading") return { kind: "heading" as const, text: block.text };
      if (block.kind === "text") return { kind: block.tag === "li" ? ("item" as const) : block.tag === "summary" ? ("question" as const) : ("text" as const), text: block.text };
      if (block.kind === "cta") return { kind: "button" as const, text: block.text };
      if (block.kind === "form") return { kind: "form" as const, text: (snapshot?.forms[block.form]?.fields ?? []).map((field) => field.label || field.type).join(", ") || "No fields" };
      if (block.kind === "embed") return { kind: "embed" as const, text: block.host ? `${block.what === "video" ? "Video" : "Embed"} from ${block.host}` : block.what === "video" ? "Video" : "Embed" };
      return block.alt ? { kind: "image" as const, text: block.alt } : null;
    };
    const analysis = found.analysis;
    return {
      id: found.id,
      title: found.title || found.host,
      url: found.finalUrl,
      own: found.own,
      driver: found.driver,
      screenshots: {
        desktop: row?.workspaceId === ctx.workspaceId && row.desktopShot ? await ctx.storage.getUrl(row.desktopShot) : null,
        phone: row?.workspaceId === ctx.workspaceId && row.phoneShot ? await ctx.storage.getUrl(row.phoneShot) : null,
      },
      goal: analysis?.goal ?? "",
      /** The page top to bottom. The content is the page's own words, shown as data. */
      sections: (analysis?.sections ?? []).map((section) => ({
        job: section.job,
        name: section.job === "other" ? "Other" : SECTION_BY_KEY[section.job].name,
        frameworkJob: section.job === "other" ? null : SECTION_BY_KEY[section.job].job,
        objection: section.job === "other" ? null : SECTION_BY_KEY[section.job].objection,
        does: section.does,
        note: section.note,
        blocks: Array.from({ length: Math.min(40, section.to - section.from + 1) }, (_, offset) => words(section.from + offset)).filter((block) => block !== null),
      })),
      skipped: found.skipped.map((key) => ({ key, name: SECTION_BY_KEY[key].name, job: SECTION_BY_KEY[key].job, objection: SECTION_BY_KEY[key].objection })),
      qualifier: analysis?.qualifier ?? null,
      headline: analysis?.headline ?? null,
      proof: analysis?.proof ?? null,
      pains: analysis?.pains ?? [],
      solutions: analysis?.solutions ?? [],
      offer: analysis?.offer ?? null,
      faq: FAQ_TOPICS.map((topic) => ({ topic, words: FAQ_TOPIC_WORDS[topic], covered: analysis?.faqTopics.includes(topic) ?? false })),
      scarcity: analysis?.scarcity ?? "",
      facts: found.facts,
    };
  },
});

/**
 * The teardown's brief, as data for whoever builds the next page (Creative Production, or a person). This is
 * a hand-off only: nothing here starts any other skill. The shape is versioned so a reader can rely on it.
 */
export const brief = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const { asset, saved, read } = await teardownOf(ctx, ctx.workspaceId, args.assetId);
    if (!read || asset.status === "rejected" || asset.status === "archived") return null;
    return {
      kind: "landingPageBrief" as const,
      version: 1,
      teardownAssetId: asset._id,
      /** Only an approved teardown is a brief a person signed off. */
      approved: asset.status === "approved",
      industry: saved.industry,
      framework: "docs/rebuild/landing-page-framework.md",
      audience: read.brief.audience,
      qualifier: read.brief.qualifier,
      promise: read.brief.promise,
      cta: read.brief.cta,
      sections: read.brief.sections.map((row) => ({ key: row.job, name: SECTION_BY_KEY[row.job].name, job: SECTION_BY_KEY[row.job].job, direction: row.direction })),
      proofNeeded: read.brief.proofNeeded,
      avoid: read.brief.avoid,
      changes: read.suggestions.map((row) => ({ title: row.title, change: row.change, basis: row.basis })),
      /** Pages the brief was drawn from. Their structure may be learned from; their wording must not be reused. */
      basedOn: saved.pages.filter((row) => !row.own).map((row) => ({ url: row.finalUrl, title: row.title || row.host })),
      limits: [HONEST_LIMIT],
    };
  },
});

/* ---- Internal: what the run's page.read step calls. ---- */

/**
 * The run's read job, made on first call from the request's own links plus any the search step found. A found
 * link is model output over web results: it is checked like any typed link and reaches nothing the page
 * reader's rules do not allow. Returns null when there is nothing to read.
 */
export const ensureJob = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<Id<"pageReadJobs"> | null> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.skillSlug !== SKILL_SLUG) return null;
    const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
    const request = projectId
      ? await ctx.db
          .query("teardownRequests")
          .withIndex("by_workspace_project", (q) => q.eq("workspaceId", run.workspaceId).eq("projectId", projectId))
          .first()
      : null;
    if (!request) return null;
    if (request.jobId) return request.jobId;

    const given = [...(request.ownUrl ? [request.ownUrl] : []), ...request.urls];
    const found: string[] = [];
    if (request.find) {
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
        .take(60);
      const discover = steps.find((step) => step.phase === PHASE.discover && step.status === "completed" && step.kind === "model");
      const artifacts = discover
        ? await ctx.db
            .query("runArtifacts")
            .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
            .take(100)
        : [];
      const body = parseJson(artifacts.find((row) => row.stepId === discover?._id && row.kind === "model")?.body) as { pages?: { url?: unknown }[] } | null;
      const hosts = new Set(given.map((url) => new URL(url).hostname.replace(/^www\./, "")));
      const candidates = (Array.isArray(body?.pages) ? body.pages : []).map((row) => (typeof row?.url === "string" ? row.url : "")).filter(Boolean);
      for (const row of checkUrls(candidates.slice(0, 20))) {
        if (!row.ok || found.length >= MAX_FOUND || given.length + found.length >= MAX_PAGES) continue;
        const host = new URL(row.url).hostname.replace(/^www\./, "");
        // One page per business, and never a social profile, directory or marketplace.
        if (hosts.has(host) || NOT_LANDING.test(host)) continue;
        hosts.add(host);
        found.push(row.url);
      }
    }
    const urls = [...given, ...found].slice(0, MAX_PAGES);
    if (urls.length === 0) return null;
    try {
      const job = await createJob(ctx, { workspaceId: run.workspaceId, userId: run.startedBy, urls, runId: run._id });
      await ctx.db.patch(request._id, { jobId: job.jobId, foundUrls: found });
      return job.jobId;
    } catch {
      // The day's page limit was reached between the plan and the run. The run says so instead of reading.
      return null;
    }
  },
});

/** What one page read cost, for the run to carry. Zero for a page that was blocked or failed. */
export const readCost = internalQuery({
  args: { readId: v.id("pageReads") },
  handler: async (ctx, args) => (await ctx.db.get(args.readId))?.costCents ?? 0,
});
