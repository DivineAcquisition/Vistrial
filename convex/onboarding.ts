/**
 * Onboarding: Website, Connect, Confirm, then the first work. The website is read by a site capture (brand,
 * offers, pages, each with where it came from); accounts that give Strategist context are offered, every one
 * skippable; the person checks and corrects everything; only then does anything run. What they confirm lands
 * in the business profile, memory and the brand kit, so it is never asked again.
 * docs/rebuild/onboarding-and-first-package.md, part 2.
 */
import { isOwner } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { PLAN, accountFor, autumnMode, billingOn, planActive } from "./lib/billing";
import { userError } from "./lib/errors";
import { signedInMutation, signedInQuery } from "./lib/builders";
import { writeFact } from "./lib/facts";
import { ALL_PLATFORMS } from "./lib/intake";
import { unlockOnboarding } from "./lib/onboarding";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { parsePublicUrl } from "./lib/sourceRefs";
import { cleanScope } from "./research";
import { startRunFor } from "./runs";
import { startPackage } from "./firstPackage";
import { applyCapture, homeOf, startCaptureFor } from "./siteCapture";
import { parseResult, type FieldKey } from "./lib/siteCapture/fields";

/** The steps before anything runs: the website, the accounts to connect, and checking what was found. */
const STEPS = ["website", "connect", "confirm"] as const;
type Step = (typeof STEPS)[number];
/** The wizard's stages before this rebuild. A row still in one is shown the website step, with what it typed kept. */
const OLD_WIZARD = ["about", "business", "offer", "goal", "review"] as const;
type Stage = Step | (typeof OLD_WIZARD)[number] | "package" | "freeSession" | "paywall" | "guide" | "done";

export const GOALS = [
  { kind: "leads", label: "Get more leads" },
  { kind: "ads", label: "Make my ads work better" },
  { kind: "competitors", label: "Understand my competitors" },
  { kind: "prices", label: "Price and package my services" },
  { kind: "retention", label: "Keep customers coming back" },
  { kind: "other", label: "Something else" },
] as const;

/** Captures of the business's own site that are on Vistrial during onboarding (a person may correct a typo). */
export const FREE_CAPTURES = 3;

const emptyRow = (userId: string, name: string) => ({
  userId,
  stage: "website" as Stage,
  person: { fullName: name, role: "", phone: "", heardFrom: "" },
  business: { name: "", website: "", offer: "", area: "", audience: "" },
  goal: { kind: "", text: "" },
  site: { status: "idle" as const, url: "", summary: "", offer: "", area: "", audience: "", competitors: [] as string[], costCents: 0 },
});

const text = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

async function rowFor(ctx: QueryCtx, userId: string) {
  return ctx.db
    .query("onboarding")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/** The stage a screen shows. Old wizard stages read as the website step: the new flow starts there. */
export function shownStage(stage: string): Stage {
  return (OLD_WIZARD as readonly string[]).includes(stage) ? "website" : (stage as Stage);
}

function view(row: Doc<"onboarding"> | null, userId: string, name: string) {
  const base = row ?? { ...emptyRow(userId, name), _id: null, workspaceId: undefined, freeProjectId: undefined, freeRunId: undefined, captureId: undefined, teardownPages: undefined };
  const stage = shownStage(base.stage);
  return {
    stage,
    step: Math.max(0, STEPS.indexOf(stage as Step)),
    person: base.person,
    business: base.business,
    goal: base.goal,
    workspaceId: base.workspaceId ?? null,
    captureId: (base as { captureId?: Id<"siteCaptures"> }).captureId ?? null,
    teardownPages: (base as { teardownPages?: string[] }).teardownPages ?? null,
    freeProjectId: base.freeProjectId ?? null,
    freeRunId: base.freeRunId ?? null,
    freeAttempts: (base as { freeAttempts?: number }).freeAttempts ?? 0,
    goals: GOALS,
  };
}

/** What the paywall needs: whether billing is on here, test mode, whether the plan is paid, and the plan. */
function billingView(account: Parameters<typeof planActive>[0]) {
  return { on: billingOn(), testMode: billingOn() && autumnMode() === "test", paid: planActive(account), plan: PLAN };
}

/** Where this person is in onboarding. A person who already had a workspace before onboarding existed is done. */
export const mine = signedInQuery({
  args: {},
  handler: async (ctx) => {
    const row = await rowFor(ctx, ctx.userId);
    // Someone already in a workspace they didn't make here (an invite, or from before onboarding) is done.
    if (!row?.workspaceId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
        .filter((q) => q.eq(q.field("active"), true))
        .first();
      if (member) return { ...view(null, ctx.userId, ""), stage: "done" as Stage, workspaceId: member.workspaceId, billing: billingView(null) };
    }
    const identity = await ctx.auth.getUserIdentity();
    const account = row?.workspaceId ? await accountFor(ctx, row.workspaceId) : null;
    return { ...view(row, ctx.userId, identity?.name ?? ""), billing: billingView(account) };
  },
});

async function ensureRow(ctx: MutationCtx & { userId: string; name: string }) {
  const row = await rowFor(ctx, ctx.userId);
  if (row) return row;
  const now = Date.now();
  const id = await ctx.db.insert("onboarding", { ...emptyRow(ctx.userId, ctx.name === "Member" ? "" : ctx.name), createdAt: now, updatedAt: now });
  return (await ctx.db.get(id))!;
}

function isSetupStage(stage: string) {
  return (STEPS as readonly string[]).includes(stage) || (OLD_WIZARD as readonly string[]).includes(stage);
}

/** The organization this onboarding made, created on first need and named from the site until the person names it. */
async function workspaceOf(ctx: MutationCtx & { userId: string; name: string }, row: Doc<"onboarding">, name: string) {
  if (row.workspaceId) return row.workspaceId;
  const existing = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
    .filter((q) => q.eq(q.field("active"), true))
    .first();
  const workspaceId = existing?.workspaceId ?? (await createWorkspaceFor(ctx, { userId: ctx.userId, displayName: row.person.fullName || ctx.name || "Owner", name: name.slice(0, 80) || "My business" }));
  await ctx.db.patch(row._id, { workspaceId, updatedAt: Date.now() });
  await writeAudit(ctx, { workspaceId, actorType: "user", actorId: ctx.userId, action: "onboarding.organization_created", subject: row._id });
  return workspaceId;
}

/** A readable name from a site address until the site says its own: "brightline-media.com" reads "Brightline Media". */
export function nameFromHost(url: string) {
  try {
    const label = new URL(url).hostname.replace(/^www\./, "").split(".")[0] ?? "";
    return label
      .split(/[-_]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
      .slice(0, 80);
  } catch {
    return "";
  }
}

/**
 * Step 1: the website. Creates the organization (named from the site for now) and starts reading the site,
 * on Vistrial. Submitting a corrected address reads again, up to FREE_CAPTURES times.
 */
export const submitWebsite = signedInMutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const row = await ensureRow(ctx);
    if (!isSetupStage(row.stage)) throw userError("The details are already saved.");
    const home = homeOf(args.url);
    if (!home) throw userError("That doesn't look like a website address. Try something like yourbusiness.com.");
    const workspaceId = await workspaceOf(ctx, row, row.business.name || nameFromHost(home));
    const tried = await ctx.db
      .query("siteCaptures")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", workspaceId).eq("clientId", undefined))
      .take(FREE_CAPTURES + 1);
    const current = row.captureId ? await ctx.db.get(row.captureId) : null;
    // The same address again while it is being read, or once it was read, is the same capture.
    if (current && current.url === home && current.status !== "failed") {
      if (row.stage !== "website") await ctx.db.patch(row._id, { stage: "website", updatedAt: Date.now() });
      return current._id;
    }
    if (tried.length >= FREE_CAPTURES) throw userError(`The website has been read ${FREE_CAPTURES} times already. Carry on, and correct anything by hand on the Confirm step.`, "limit");
    const captureId = await startCaptureFor(ctx, { workspaceId, url: home, userId: ctx.userId, free: true });
    await ctx.db.patch(row._id, { stage: "website", captureId, business: { ...row.business, website: home }, updatedAt: Date.now() });
    return captureId;
  },
});

/** Step 1 without a website: the organization is made, and Confirm asks for what a site would have said. */
export const skipWebsite = signedInMutation({
  args: {},
  handler: async (ctx) => {
    const row = await ensureRow(ctx);
    if (!isSetupStage(row.stage)) throw userError("The details are already saved.");
    await workspaceOf(ctx, row, row.business.name || "My business");
    await ctx.db.patch(row._id, { stage: "connect", updatedAt: Date.now() });
    return null;
  },
});

/** Moves between the three steps. Connect and Confirm need the organization, which step 1 makes. */
export const goTo = signedInMutation({
  args: { stage: v.union(...STEPS.map((stage) => v.literal(stage))) },
  handler: async (ctx, args) => {
    const row = await ensureRow(ctx);
    if (!isSetupStage(row.stage)) throw userError("The details are already saved.");
    if (args.stage !== "website" && !row.workspaceId) throw userError("Add your website first, or say you don't have one.");
    await ctx.db.patch(row._id, { stage: args.stage, updatedAt: Date.now() });
    return null;
  },
});

const choiceArgs = v.object({
  take: v.array(v.string()),
  logoOwned: v.boolean(),
  edits: v.optional(
    v.object({
      colors: v.optional(v.array(v.object({ label: v.string(), hex: v.string() }))),
      headingFont: v.optional(v.string()),
      bodyFont: v.optional(v.string()),
      tone: v.optional(v.string()),
      audience: v.optional(v.string()),
      location: v.optional(v.string()),
    }),
  ),
  offers: v.optional(v.array(v.number())),
});

/**
 * Step 3: the person checked everything. Writes the business profile and the facts as theirs, uses what they
 * kept from the website (brand kit, offers, facts, all marked as confirmed by them), names the organization,
 * turns Strategist on, and remembers which pages the first teardown reads. Then the first work starts.
 */
export const confirm = signedInMutation({
  args: {
    person: v.object({ fullName: v.string(), role: v.string() }),
    business: v.object({ name: v.string(), offer: v.string(), area: v.string(), audience: v.string() }),
    goal: v.object({ kind: v.string(), text: v.string() }),
    choices: v.optional(choiceArgs),
    teardownPages: v.optional(v.array(v.string())),
    /** With no website: the social profiles the person gives, for Strategist to know the business by. */
    socialLinks: v.optional(v.array(v.string())),
    serviceTeamAccess: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    const row = await ensureRow(ctx);
    if (!isSetupStage(row.stage)) {
      if (row.workspaceId) return row.workspaceId;
      throw userError("The details are already saved.");
    }
    const person = { ...row.person, fullName: text(args.person.fullName, 80), role: text(args.person.role, 60) };
    const business = { ...row.business, name: text(args.business.name, 80), offer: text(args.business.offer, 300), area: text(args.business.area, 120), audience: text(args.business.audience, 200) };
    const goal = { kind: text(args.goal.kind, 30), text: text(args.goal.text, 400) };
    if (!person.fullName) throw userError("Add your name first.");
    if (!business.name) throw userError("Add the business name first.");
    if (!business.offer) throw userError("Say what the business sells first.");
    if (!business.area) throw userError("Say where the business works first.");
    if (!goal.kind) throw userError("Pick a main goal first.");
    const workspaceId = await workspaceOf(ctx, row, business.name);
    const now = Date.now();

    await ctx.db.patch(workspaceId, { name: business.name });
    const latest = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .first();
    const capture = row.captureId ? await ctx.db.get(row.captureId) : null;
    const result = capture?.result ? parseResult(capture.result) : null;
    const priceNotes = (result?.offers.value ?? []).filter((offer) => offer.price).map((offer) => `${offer.name}: ${offer.price}`).join("; ").slice(0, 300);
    await ctx.db.insert("profileVersions", {
      workspaceId,
      version: (latest?.version ?? 0) + 1,
      offer: business.offer,
      priceNotes,
      audience: business.audience,
      geography: business.area,
      channels: "",
      brandVoice: (args.choices?.edits?.tone ?? result?.tone.value?.text ?? "").slice(0, 300),
      competitors: [],
      confirmedBy: ctx.userId,
      confirmedAt: now,
      status: "confirmed",
    });
    const goalLabel = GOALS.find((item) => item.kind === goal.kind)?.label ?? goal.kind;
    const facts: [string, string][] = [
      ["businessName", business.name],
      ["researchMarket", business.offer],
      ["researchGeography", business.area],
      ["audience", business.audience],
      ["mainGoal", goal.text ? `${goalLabel}: ${goal.text}` : goalLabel],
      ["ownerRole", person.role],
    ];
    const social = (args.socialLinks ?? []).map((link) => parsePublicUrl(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`)?.href).filter((link): link is string => Boolean(link)).slice(0, 8);
    if (social.length) facts.push(["socialLinks", social.join(" | ")]);
    for (const [factKey, value] of facts) {
      if (value) await writeFact(ctx, { workspaceId, factKey, value, sourceType: "owner", recordedBy: ctx.userId, verifiedBy: ctx.userId });
    }
    // What the person kept from the website. Audience and area were just written as theirs above.
    if (capture && result && args.choices && (capture.status === "done" || capture.status === "partial")) {
      const take = (args.choices.take as FieldKey[]).filter((key) => key !== "audience" && key !== "location" && key !== "name");
      await applyCapture(ctx, { capture, userId: ctx.userId, take, logoOwned: args.choices.logoOwned, typed: args.choices.edits ?? {}, confirmed: true, offers: args.choices.offers });
    }

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", GROWTH_ARCHITECT))
      .unique();
    if (agent) {
      const link = await ctx.db
        .query("workspaceAgents")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
        .unique();
      if (link) await ctx.db.patch(link._id, { state: "on", updatedAt: now, updatedBy: ctx.userId });
      else await ctx.db.insert("workspaceAgents", { workspaceId, agentId: agent._id, state: "on", updatedAt: now, updatedBy: ctx.userId });
    }
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    const serviceTeamAccess = args.serviceTeamAccess ?? true;
    if (settings) await ctx.db.patch(settings._id, { setupDone: true, serviceTeamAccess });

    const pages = capture ? capture.pages.filter((page) => page.read).map((page) => page.id) : [];
    const teardownPages = (args.teardownPages ?? []).filter((id) => pages.includes(id)).slice(0, 5);
    await ctx.db.patch(row._id, {
      person,
      business: { ...business, website: capture?.url ?? row.business.website },
      goal,
      site: { ...row.site, competitors: [] },
      teardownPages,
      stage: "package",
      updatedAt: now,
    });
    // Go: Strategist's first package starts now, on Vistrial (firstPackage.ts).
    await startPackage(ctx, { workspaceId, ownerId: ctx.userId, onboardingId: row._id });
    await writeAudit(ctx, { workspaceId, actorType: "user", actorId: ctx.userId, action: "onboarding.confirmed", subject: row._id });
    await writeAudit(ctx, {
      workspaceId,
      actorType: "user",
      actorId: ctx.userId,
      action: serviceTeamAccess ? "workspace.service_team_access_on" : "workspace.service_team_access_off",
      subject: workspaceId,
    });
    return workspaceId;
  },
});

// ------------------------------------------------------------------------------------ free session

/** What the free session researches, by the main goal. Every one ends in a report with three opportunities. */
const GOAL_OBJECTIVES: Record<string, (b: { name: string; offer: string; area: string }) => string> = {
  leads: (b) => `Find the three best ways for ${b.name} to win more customers for ${b.offer} in ${b.area}, from what competitors there do that works.`,
  ads: (b) => `Find how ${b.name} can get more from its advertising for ${b.offer} in ${b.area}: what competitors' ads and offers say, and where they leave gaps.`,
  competitors: (b) => `Map ${b.name}'s main competitors for ${b.offer} in ${b.area}: what they offer, how they market it, and where ${b.name} can stand out.`,
  prices: (b) => `Find how competitors in ${b.area} price and package ${b.offer}, and how ${b.name} should price and package its own.`,
  retention: (b) => `Find how competitors offering ${b.offer} in ${b.area} keep customers coming back, and what ${b.name} should do to keep more of its own.`,
  other: (b) => `Find the three best growth opportunities for ${b.name}, which sells ${b.offer} in ${b.area}, from what competitors there do.`,
};

/** The free session's project, from what the person told the wizard and what the website said. */
export function freeScope(row: Pick<Doc<"onboarding">, "business" | "goal" | "site">) {
  const { business, goal, site } = row;
  // Website text often ends in a full stop; the sentences below add their own.
  const bare = (value: string) => value.trim().replace(/[.!?;:,\s]+$/, "");
  const objective = (GOAL_OBJECTIVES[goal.kind] ?? GOAL_OBJECTIVES.other)({ name: business.name, offer: bare(business.offer), area: bare(business.area) });
  const theirWords = goal.text ? ` In their words: ${goal.text}` : "";
  const audience = business.audience ? ` Their customers: ${bare(business.audience)}.` : "";
  const website = parsePublicUrl(business.website) ? [business.website] : [];
  return cleanScope({
    title: `${business.name}: free research session`.slice(0, 120),
    objective: `${objective}${audience}${theirWords}`.slice(0, 2000),
    market: business.offer.slice(0, 200),
    geography: business.area.slice(0, 200),
    competitors: site.competitors.slice(0, 6).map((name) => ({ name: name.slice(0, 120) })),
    platforms: [...ALL_PLATFORMS],
    suppliedUrls: website,
  });
}

/** One retry when the first free session stops without a report. */
export const FREE_ATTEMPTS = 2;
/** The free session runs in the default quality mode: it is the first report a customer sees. */
const FREE_MODE = "thorough" as const;

/**
 * Starts the free research session, once. Vistrial pays for it: it skips the credit check and is never
 * charged to the workspace. Calling it again while one is going, or after it made a report, returns that one.
 */
export const startFree = signedInMutation({
  args: {},
  handler: async (ctx): Promise<{ projectId: Id<"researchProjects">; runId: Id<"agentRuns"> }> => {
    const row = await rowFor(ctx, ctx.userId);
    if (!row?.workspaceId || row.stage !== "freeSession") throw userError("The free session isn't open for this account.");
    const member = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.and(q.eq(q.field("workspaceId"), row.workspaceId), q.eq(q.field("active"), true)))
      .first();
    if (!member || !isOwner(member.role)) throw userError("Only the organization's Owner can start the free session.", "not_allowed");

    const previous = row.freeRunId ? await ctx.db.get(row.freeRunId) : null;
    if (previous && row.freeProjectId) {
      const ended = previous.status === "failed" || previous.status === "stopped";
      const report = ended ? await reportFor(ctx, previous._id) : null;
      if (!ended || report) return { projectId: row.freeProjectId, runId: previous._id };
      if ((row.freeAttempts ?? 1) >= FREE_ATTEMPTS) throw userError("The free session has already been tried twice.", "limit");
    }

    const now = Date.now();
    let projectId = row.freeProjectId;
    if (!projectId) {
      const profile = await ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_version", (q) => q.eq("workspaceId", row.workspaceId!))
        .order("desc")
        .first();
      projectId = await ctx.db.insert("researchProjects", {
        workspaceId: row.workspaceId,
        ...freeScope(row),
        status: "draft",
        ...(profile ? { profileVersionId: profile._id } : {}),
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    const runId = await startRunFor(ctx, {
      workspaceId: row.workspaceId,
      userId: ctx.userId,
      role: member.role,
      free: true,
      agentSlug: GROWTH_ARCHITECT,
      skillSlug: "market-intelligence",
      projectId,
      mode: FREE_MODE,
    });
    await ctx.db.patch(row._id, { freeProjectId: projectId, freeRunId: runId, freeAttempts: (row.freeAttempts ?? 0) + 1, updatedAt: now });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "user", actorId: ctx.userId, action: "onboarding.free_session_started", subject: runId });
    return { projectId, runId };
  },
});

async function reportFor(ctx: QueryCtx, runId: Id<"agentRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) return null;
  return ctx.db
    .query("assets")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("createdByRun", runId))
    .first();
}

/** Moves between the free session's report and the paywall. Paying is what moves past both. */
export const showPaywall = signedInMutation({
  args: { open: v.boolean() },
  handler: async (ctx, args) => {
    const row = await rowFor(ctx, ctx.userId);
    if (!row?.workspaceId || (row.stage !== "freeSession" && row.stage !== "paywall" && row.stage !== "package")) return null;
    // Closing the paywall goes back to what was behind it: the first package, or the old free session.
    const hasPackage = await ctx.db
      .query("firstPackages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", row.workspaceId!))
      .first();
    const behind = hasPackage ? "package" : "freeSession";
    const stage = args.open ? "paywall" : behind;
    if (row.stage !== stage) await ctx.db.patch(row._id, { stage, updatedAt: Date.now() });
    if (args.open && row.stage !== "paywall") {
      await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "user", actorId: ctx.userId, action: "onboarding.paywall_shown", subject: row._id });
    }
    return null;
  },
});

/**
 * Moves on when the plan is already paid for (the billing mirror can lag Stripe's return), or when this
 * deployment has no billing at all, so there is nothing to pay.
 */
export const unlock = signedInMutation({
  args: {},
  handler: async (ctx) => {
    const row = await rowFor(ctx, ctx.userId);
    if (!row?.workspaceId || (row.stage !== "freeSession" && row.stage !== "paywall" && row.stage !== "package")) return { unlocked: true };
    if (!billingOn()) {
      await unlockOnboarding(ctx, row.workspaceId, "billingOff");
      return { unlocked: true };
    }
    if (planActive(await accountFor(ctx, row.workspaceId))) {
      await unlockOnboarding(ctx, row.workspaceId, "plan");
      return { unlocked: true };
    }
    return { unlocked: false };
  },
});
