/**
 * The home page and the sidebar: what is waiting on a person, where the loop stands (understand, research,
 * decide, try, measure), what Vistrial knows about the business, and the evidence gathered across sessions.
 * Read-only, and every read stays inside the caller's workspace.
 */

import { canWork, isAdmin } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { changesBetween, currentFigures } from "./decisions";
import { approvalView } from "./approvals";
import { selfMutation, workspaceQuery } from "./lib/builders";
import type { ClientScope } from "./lib/clients";
import { SKILL_ASSET } from "./lib/workTabs";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces"> };

// ------------------------------------------------------------------------------------------- knowledge

export type KnowledgeKey = "profile" | "facts" | "meta" | "results" | "outcome";

/** In the order a business should add them: the first one missing is the suggestion. */
export const KNOWLEDGE: { key: KnowledgeKey; label: string; missing: string; href: string }[] = [
  { key: "profile", label: "Confirmed business profile", missing: "Confirm your business profile", href: "/app/settings?section=business" },
  { key: "facts", label: "Business facts", missing: "Add facts about your business", href: "/app/settings?section=memory" },
  { key: "results", label: "Results file", missing: "Upload a results file", href: "/app/connections/results" },
  { key: "meta", label: "Meta ads connected", missing: "Connect Meta ads", href: "/app/connections/meta" },
  { key: "outcome", label: "A recorded outcome", missing: "Record what happened after a decision", href: "/app" },
];

/** Five things Vistrial can know, each done or not, the percent done, and the most useful one to add next. */
export function knowledgeFrom(done: Record<KnowledgeKey, boolean>) {
  const items = KNOWLEDGE.map((row) => ({ key: row.key, label: row.label, done: done[row.key], href: row.href }));
  const count = items.filter((row) => row.done).length;
  const next = KNOWLEDGE.find((row) => !done[row.key]);
  return {
    items,
    percent: Math.round((count / KNOWLEDGE.length) * 100),
    next: next ? { key: next.key, label: next.missing, href: next.href } : null,
  };
}

async function knowledge(ctx: Ctx) {
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
    .first();
  let facts = false;
  for (const status of ["verified", "unverified"] as const) {
    const rows = await ctx.db
      .query("businessFacts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
      .take(50);
    if (rows.some((row) => !row.deletedAt)) facts = true;
  }
  const meta = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .unique();
  const uploads = await ctx.db
    .query("resultUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .order("desc")
    .take(20);
  const decisions = await allDecisions(ctx);
  return knowledgeFrom({
    profile: Boolean(profile),
    facts,
    meta: meta?.status === "connected",
    results: uploads.some((row) => row.status === "ready"),
    outcome: decisions.some((row) => Boolean(row.outcome)),
  });
}

// ------------------------------------------------------------------------------------------- waiting

async function allDecisions(ctx: Ctx) {
  return await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .take(200);
}

/** Runs stopped on a question for a person, as `studio.attention` reads them. */
async function questions(ctx: Ctx) {
  const out: { run: Doc<"agentRuns">; project: Doc<"researchProjects"> }[] = [];
  for (const status of ["waiting", "needsInput"] as const) {
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
      .take(25);
    for (const run of runs) {
      const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
      const project = projectId ? await ctx.db.get(projectId) : null;
      if (!run.waitingFor || !project || project.workspaceId !== ctx.workspaceId) continue;
      out.push({ run, project });
    }
  }
  return out;
}

/** Reports waiting for a person: drafts and drafts that need review. */
async function approvals(ctx: Ctx) {
  const rows: Doc<"assets">[] = [];
  for (const status of ["needsReview", "draft"] as const) {
    rows.push(
      ...(await ctx.db
        .query("assets")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .order("desc")
        .take(50)),
    );
  }
  return rows;
}

async function agentOf(ctx: Ctx, runId: Id<"agentRuns"> | undefined) {
  if (!runId) return GROWTH_ARCHITECT;
  const run = await ctx.db.get(runId);
  return run && run.workspaceId === ctx.workspaceId ? run.agentSlug : GROWTH_ARCHITECT;
}

async function sourceCount(ctx: Ctx, runId: Id<"agentRuns"> | undefined) {
  if (!runId) return 0;
  const rows = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", runId))
    .take(500);
  return rows.length;
}

// ------------------------------------------------------------------------------------------- queries

/**
 * Everything the sidebar and the loop strip need in one read: the workspace name, what is waiting on a
 * person (and per agent), runs going, the loop counts, and what Vistrial knows.
 */
export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const workspace = await ctx.db.get(ctx.workspaceId);
    const asked = await questions(ctx);
    const reports = await approvals(ctx);
    const decisions = await allDecisions(ctx);
    const due = decisions.filter((row) => !row.outcome && row.checkInAt <= now);
    const trying = decisions.filter((row) => !row.outcome && row.checkInAt > now);

    const running: Doc<"agentRuns">[] = [];
    for (const status of ["queued", "running"] as const) {
      running.push(
        ...(await ctx.db
          .query("agentRuns")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
          .take(50)),
      );
    }

    const agents: Record<string, { working: number; waiting: number }> = {};
    const bump = (slug: string, key: "working" | "waiting") => {
      agents[slug] ??= { working: 0, waiting: 0 };
      agents[slug][key] += 1;
    };
    for (const run of running) bump(run.agentSlug, "working");
    for (const row of asked) bump(row.run.agentSlug, "waiting");
    for (const asset of reports) bump(await agentOf(ctx, asset.createdByRun), "waiting");
    // Decisions come from Growth Architect reports.
    for (let index = 0; index < due.length; index += 1) bump(GROWTH_ARCHITECT, "waiting");

    // Per skill, for the agent's work tabs: runs going (or waiting on a question) and results to review.
    const skills: Record<string, { running: number; review: number }> = {};
    const skillBump = (slug: string, key: "running" | "review") => {
      skills[slug] ??= { running: 0, review: 0 };
      skills[slug][key] += 1;
    };
    for (const run of running) skillBump(run.skillSlug, "running");
    for (const row of asked) skillBump(row.run.skillSlug, "running");
    for (const asset of reports) {
      const skill = (Object.keys(SKILL_ASSET) as (keyof typeof SKILL_ASSET)[]).find((slug) => SKILL_ASSET[slug] === asset.kind);
      if (skill) skillBump(skill, "review");
    }

    const known = await knowledge(ctx);
    // The sidebar's three main items: what waits for a decision, tasks proposed, and Briefing posts not yet seen.
    const queue = await ctx.db
      .query("approvals")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "waiting"))
      .take(100);
    const visit = await ctx.db
      .query("memberVisits")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .unique();
    const posts = await ctx.db
      .query("briefingItems")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ctx.workspaceId).gt("at", visit?.briefingSeenAt ?? 0))
      .take(100);
    return {
      nav: { tasks: queue.filter((row) => row.kind === "task").length, briefing: posts.length },
      workspaceName: workspace?.name ?? "Your business",
      role: ctx.role,
      /** A Viewer can see what is waiting; everyone else can answer. Approving is for Owners and Admins. */
      actionable: canWork(ctx.member.role),
      waiting: {
        total: asked.length + due.length + reports.length,
        questions: asked.length,
        checkIns: due.length,
        approvals: reports.length,
      },
      loop: {
        understand: known.percent,
        research: running.length,
        decide: reports.length,
        try: trying.length,
        measure: due.length,
      },
      knowledge: known,
      agents,
      skills,
    };
  },
});

/**
 * The one list on the home page, ordered by what unblocks the most work: a question stops a run, a check-in
 * feeds the next research, and an approval releases a report.
 */
export const waiting = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const asked = (await questions(ctx)).sort((a, b) => b.run.waitingFor!.askedAt - a.run.waitingFor!.askedAt);
    const due = (await allDecisions(ctx)).filter((row) => !row.outcome && row.checkInAt <= now).sort((a, b) => a.checkInAt - b.checkInAt);
    const reports = (await approvals(ctx)).sort(
      (a, b) => Number(b.status === "needsReview") - Number(a.status === "needsReview") || b.createdAt - a.createdAt,
    );
    const items = [];
    for (const { run, project } of asked) {
      items.push({
        kind: "question" as const,
        key: `q:${run._id}`,
        agentSlug: run.agentSlug,
        runId: run._id,
        status: run.status as "waiting" | "needsInput",
        question: run.waitingFor!.question,
        at: run.waitingFor!.askedAt,
        projectId: project._id,
        projectTitle: project.title,
      });
    }
    for (const row of due) {
      items.push({
        kind: "checkIn" as const,
        key: `c:${row._id}`,
        agentSlug: GROWTH_ARCHITECT,
        decisionId: row._id,
        proposedAction: row.proposedAction,
        at: row.checkInAt,
        projectId: row.projectId,
      });
    }
    for (const asset of reports) {
      items.push({
        kind: "approval" as const,
        key: `a:${asset._id}`,
        agentSlug: await agentOf(ctx, asset.createdByRun),
        asset: {
          id: asset._id,
          title: asset.title,
          kind: asset.kind,
          status: asset.status,
          currentVersion: asset.currentVersion,
          createdAt: asset.createdAt,
          createdByRun: asset.createdByRun ?? null,
        },
        at: asset.createdAt,
        sources: await sourceCount(ctx, asset.createdByRun),
      });
    }
    return items;
  },
});

/** Outcomes the business recorded, with the measured change from before to after. Newest first. */
export const proven = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = (await allDecisions(ctx)).filter((row) => row.outcome).sort((a, b) => b.outcome!.recordedAt - a.outcome!.recordedAt);
    return rows.slice(0, 10).map((row) => ({
      id: row._id,
      projectId: row.projectId,
      proposedAction: row.proposedAction,
      result: row.outcome!.result,
      note: row.outcome!.note,
      recordedAt: row.outcome!.recordedAt,
      changes: changesBetween(row.baseline, row.outcome!.after),
    }));
  },
});

/**
 * The Evidence page: every source collected across sessions, newest first, and the business's own figures.
 * Figures are money, so reps see the sources only.
 */
export const evidence = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("researchProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const sources = [];
    for (const project of projects) {
      const refs = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id))
        .take(100);
      for (const ref of refs) {
        sources.push({
          id: ref._id,
          title: ref.title,
          url: ref.url,
          platform: ref.platform,
          kind: ref.kind,
          publisher: ref.publisher ?? null,
          observedAt: ref.observedAt,
          origin: ref.origin,
          projectId: project._id,
          projectTitle: project.title,
        });
      }
    }
    sources.sort((a, b) => b.observedAt - a.observedAt);
    const seesFigures = isAdmin(ctx.member.role);
    return {
      sources: sources.slice(0, 300),
      sourceCount: sources.length,
      sessionCount: projects.length,
      figures: seesFigures ? await currentFigures(ctx, ctx.workspaceId) : [],
      seesFigures,
    };
  },
});

/** Sessions and reports whose title matches, for the sidebar search. */
export const search = workspaceQuery({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const needle = args.text.trim().toLowerCase().slice(0, 100);
    if (needle.length < 2) return [];
    const projects = await ctx.db
      .query("researchProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(200);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(200);
    const hits: { kind: "session" | "asset"; id: string; title: string; href: string }[] = [];
    for (const row of projects) {
      if (row.status === "archived") continue;
      if (`${row.title} ${row.objective}`.toLowerCase().includes(needle)) {
        hits.push({ kind: "session", id: row._id, title: row.title, href: `/app/agents/${GROWTH_ARCHITECT}/sessions/${row._id}` });
      }
    }
    for (const row of assets) {
      if (row.status === "archived") continue;
      if (row.title.toLowerCase().includes(needle)) hits.push({ kind: "asset", id: row._id, title: row.title, href: `/app/assets/${row._id}` });
    }
    return hits.slice(0, 20);
  },
});

// ------------------------------------------------------------------------------------------- Home (step 2)

export type HomeFigure = { scope: string; key: string; label: string; value: number; unit: string };

type Scoped = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };

async function visibleClients(ctx: Scoped) {
  return ctx.db
    .query("clients")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "active"))
    .take(60);
}

/**
 * The numbers Home can show for what the caller may see, read now: booked calls from a connected calendar,
 * and spend, results and revenue from Meta and each results file. One entry per number per owner ("own" for
 * the organization itself, or a client's id). Nothing is estimated: a number that has no source is absent.
 */
export async function figuresNow(ctx: Scoped): Promise<HomeFigure[]> {
  const out: HomeFigure[] = [];
  const add = async (scope: string, clientId: Id<"clients"> | undefined) => {
    for (const row of await currentFigures(ctx, ctx.workspaceId, clientId)) {
      const key = `${row.source}:${row.label}`;
      if (row.conversions !== undefined) out.push({ scope, key: `${key}:conversions`, label: `${row.label}: results`, value: row.conversions, unit: "results" });
      if (row.spend !== undefined) out.push({ scope, key: `${key}:spend`, label: `${row.label}: spend`, value: row.spend, unit: row.currency });
      if (row.revenue !== undefined) out.push({ scope, key: `${key}:revenue`, label: `${row.label}: revenue`, value: row.revenue, unit: row.currency });
    }
  };
  if (ctx.clients.sees(undefined)) {
    for (const provider of ["google_calendar", "calendly"]) {
      const row = await ctx.db
        .query("integrationSnapshots")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", ctx.workspaceId).eq("provider", provider).eq("kind", "bookings"))
        .unique();
      const booked = (row?.data as { totals?: { booked?: unknown } } | undefined)?.totals?.booked;
      if (typeof booked === "number") out.push({ scope: "own", key: `bookings:${provider}`, label: "Booked calls", value: booked, unit: "calls" });
    }
    await add("own", undefined);
  }
  for (const client of await visibleClients(ctx)) await add(client._id, client._id);
  return out;
}

/** A visit this long after the last one counts as coming back, so "since you were last here" moves on. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

async function visitOf(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  return ctx.db
    .query("memberVisits")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
    .unique();
}

/**
 * Records that the caller opened Home, with the figures as they are now. Coming back after a while moves
 * the last reading to "previous", which is what Home compares against. Any member, a Viewer included.
 */
export const visit = selfMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const row = await visitOf(ctx);
    if (row?.homeSeenAt && now - row.homeSeenAt < VISIT_GAP_MS) return null;
    const figures = await figuresNow(ctx);
    if (!row) await ctx.db.insert("memberVisits", { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, homeSeenAt: now, homeFigures: figures });
    else await ctx.db.patch(row._id, { homeSeenAt: now, homeFigures: figures, homePreviousAt: row.homeSeenAt, homePreviousFigures: row.homeFigures });
    return null;
  },
});

/**
 * Home, top to bottom under the chat box: what needs the caller (approvals, questions, check-ins), what
 * changed since they were last here (two real readings compared), what agents are working on, and each
 * client with what needs them. Filtered by the client picker; a Member or Viewer only sees their clients.
 */
export const dashboard = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const names = new Map<string, string>();
    const clients = await visibleClients(ctx);
    for (const client of clients) names.set(client._id, client.name);
    const nameOf = (clientId: Id<"clients"> | undefined) => (clientId ? (names.get(clientId) ?? "A client") : null);

    // ---- Needs you
    const needs: {
      key: string;
      kind: "approval" | "question" | "checkIn";
      title: string;
      detail: string | null;
      client: string | null;
      clientId: Id<"clients"> | null;
      agentSlug: string | null;
      at: number;
      href: string | null;
      approval: Awaited<ReturnType<typeof approvalView>> | null;
      decisionId: Id<"decisions"> | null;
    }[] = [];
    const queue = await ctx.db
      .query("approvals")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "waiting"))
      .take(50);
    for (const row of queue) {
      const view = await approvalView(ctx, row);
      needs.push({ key: `a:${row._id}`, kind: "approval", title: row.summary, detail: view.kindLabel, client: nameOf(row.clientId), clientId: row.clientId ?? null, agentSlug: row.agentSlug ?? null, at: row.requestedAt, href: view.href, approval: view, decisionId: null });
    }
    for (const { run, project } of await questions(ctx)) {
      needs.push({ key: `q:${run._id}`, kind: "question", title: run.waitingFor!.question, detail: project.title, client: nameOf(run.clientId), clientId: run.clientId ?? null, agentSlug: run.agentSlug, at: run.waitingFor!.askedAt, href: `/app/runs/${run._id}`, approval: null, decisionId: null });
    }
    const decisions = await allDecisions(ctx);
    for (const row of decisions) {
      if (row.outcome || row.checkInAt > now) continue;
      needs.push({ key: `c:${row._id}`, kind: "checkIn", title: row.proposedAction, detail: "Check-in due: say what happened", client: nameOf(row.clientId), clientId: row.clientId ?? null, agentSlug: GROWTH_ARCHITECT, at: row.checkInAt, href: row.assetId ? `/app/assets/${row.assetId}` : `/app/agents/${GROWTH_ARCHITECT}/sessions/${row.projectId}`, approval: null, decisionId: row._id });
    }
    // A question stops a run, so it comes first; then what was asked longest ago.
    const order = { question: 0, approval: 1, checkIn: 2 } as const;
    needs.sort((a, b) => order[a.kind] - order[b.kind] || a.at - b.at);

    // ---- Since you were last here
    const seen = await visitOf(ctx);
    const current = await figuresNow(ctx);
    // Within a visit the comparison is with the visit before; the first time back, with the last reading.
    const fresh = Boolean(seen?.homeSeenAt && now - seen.homeSeenAt < VISIT_GAP_MS);
    const beforeAt = fresh ? (seen?.homePreviousAt ?? null) : (seen?.homeSeenAt ?? null);
    const before = (fresh ? seen?.homePreviousFigures : seen?.homeFigures) ?? [];
    const changes = [];
    for (const figure of current) {
      // The stored reading is the person's own, but assignments can change: only what they may see now is compared.
      if (!ctx.clients.sees(figure.scope === "own" ? undefined : (figure.scope as Id<"clients">))) continue;
      const old = before.find((row) => row.scope === figure.scope && row.key === figure.key);
      if (!old || old.value === figure.value) continue;
      changes.push({ label: figure.label, client: figure.scope === "own" ? null : (names.get(figure.scope) ?? "A client"), before: old.value, after: figure.value, unit: figure.unit, percent: old.value !== 0 ? Math.round(((figure.value - old.value) / Math.abs(old.value)) * 1000) / 10 : null });
    }
    const posts = beforeAt
      ? await ctx.db
          .query("briefingItems")
          .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ctx.workspaceId).gt("at", beforeAt))
          .take(100)
      : [];
    const since = {
      /** Null on a first visit: there is nothing to compare with yet. */
      at: beforeAt,
      changes,
      figures: current.length,
      finished: posts.filter((row) => row.kind === "finished").length,
      alerts: posts.filter((row) => row.kind === "alert").length,
      outcomes: beforeAt ? decisions.filter((row) => row.outcome && row.outcome.recordedAt > beforeAt).length : 0,
    };

    // ---- In motion
    const moving: { key: string; kind: "run" | "trying"; title: string; agentSlug: string | null; skillSlug: string | null; client: string | null; clientId: Id<"clients"> | null; since: number; until: number | null; href: string }[] = [];
    for (const status of ["queued", "running"] as const) {
      const runs = await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .take(25);
      for (const run of runs) {
        const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
        const project = projectId ? await ctx.db.get(projectId) : null;
        moving.push({ key: `r:${run._id}`, until: null, kind: "run", title: project && project.workspaceId === ctx.workspaceId ? project.title : "Agent work", agentSlug: run.agentSlug, skillSlug: run.skillSlug, client: nameOf(run.clientId), clientId: run.clientId ?? null, since: run.startedAt, href: `/app/runs/${run._id}` });
      }
    }
    for (const row of decisions) {
      if (row.outcome || row.checkInAt <= now) continue;
      moving.push({ key: `d:${row._id}`, kind: "trying", title: row.proposedAction, agentSlug: null, skillSlug: null, client: nameOf(row.clientId), clientId: row.clientId ?? null, since: row.createdAt, until: row.checkInAt, href: row.assetId ? `/app/assets/${row.assetId}` : `/app/agents/${GROWTH_ARCHITECT}/sessions/${row.projectId}` });
    }

    // ---- Clients
    const tally = (clientId: Id<"clients"> | null) => ({ needs: needs.filter((row) => row.clientId === clientId).length, moving: moving.filter((row) => row.clientId === clientId).length });
    const rows = clients.map((client) => ({ id: client._id as string, name: client.name, type: client.type, ...tally(client._id) }));
    rows.sort((a, b) => b.needs - a.needs || b.moving - a.moving || a.name.localeCompare(b.name));
    const workspace = await ctx.db.get(ctx.workspaceId);
    return {
      organization: workspace?.name ?? "Your organization",
      canApprove: isAdmin(ctx.role),
      canWork: canWork(ctx.role),
      needs,
      since,
      moving: moving.slice(0, 20),
      own: ctx.clients.sees(undefined) ? tally(null) : null,
      clients: rows,
    };
  },
});
