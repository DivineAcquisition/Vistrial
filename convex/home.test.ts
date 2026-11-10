/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { knowledgeFrom } from "./home";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

const DAY = 86_400_000;

async function seed() {
  const t = convexTest(schema, modules);
  // A workspace with Growth Architect on and a confirmed profile.
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
    const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId,
      title: "Austin deep cleaning",
      objective: "What do competitors lead with?",
      market: "Deep cleaning",
      geography: "Austin, TX",
      competitors: [],
      platforms: ["web"],
      suppliedUrls: [],
      status: "draft",
      createdBy: "user_owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const run = (status: "running" | "waiting" | "completed", question?: string) =>
      ctx.db.insert("agentRuns", {
        workspaceId,
        agentSlug: "growth-architect",
        skillSlug: "market-intelligence",
        status,
        ...(question ? { waitingFor: { questionId: "q1", questionKey: "area", question, askedAt: 5 } } : {}),
        startedBy: "user_owner",
        inputRef: projectId,
        startedAt: 1,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
    await run("running");
    await run("waiting", "Which part of Austin?");
    const doneRun = await run("completed");
    await ctx.db.insert("assets", { workspaceId, kind: "marketReport", title: "Austin market report", status: "draft", currentVersion: 1, createdByRun: doneRun, createdAt: 2 });
    await ctx.db.insert("assets", { workspaceId, kind: "offerAnalysis", title: "Approved offer", status: "approved", currentVersion: 1, createdAt: 3 });
    for (const url of ["https://a.example", "https://b.example"]) {
      await ctx.db.insert("sourceRefs", {
        workspaceId,
        projectId,
        runId: doneRun,
        origin: "found",
        platform: "web",
        kind: "page",
        url,
        canonicalUrl: url,
        title: `Source ${url}`,
        observedAt: 4,
        availability: "available",
      });
    }
    const decision = (checkInAt: number, outcome?: boolean) =>
      ctx.db.insert("decisions", {
        workspaceId,
        projectId,
        runId: doneRun,
        opportunityIndex: 0,
        opportunity: "Lead with price",
        proposedAction: `Try at ${checkInAt}`,
        validationMethod: "Bookings",
        checkInAt,
        createdBy: "user_owner",
        createdAt: 1,
        baseline: [{ source: "upload", label: "Jobber", currency: "USD", dateStart: null, dateStop: null, conversions: 40, capturedAt: 1 }],
        ...(outcome
          ? { outcome: { result: "better" as const, note: "More bookings.", after: [{ source: "upload", label: "Jobber", currency: "USD", dateStart: null, dateStop: null, conversions: 50, capturedAt: 2 }], recordedAt: 9, recordedBy: "user_owner" } }
          : {}),
      });
    await decision(Date.now() - DAY); // due
    await decision(Date.now() + 30 * DAY); // trying
    return { other, projectId, doneRun };
  });
  return { t, workspaceId, ...ids };
}

describe("home", () => {
  it("counts what is waiting, the loop, and each agent's share", async () => {
    const { t, workspaceId } = await seed();
    const overview = await t.withIdentity(identity("user_owner")).query(api.home.overview, { workspaceId });
    expect(overview.workspaceName).toBe("Vistrial Review Workspace");
    expect(overview.waiting).toEqual({ total: 3, questions: 1, checkIns: 1, approvals: 1 });
    expect(overview.loop).toMatchObject({ research: 1, decide: 1, try: 1, measure: 1 });
    expect(overview.agents["growth-architect"]).toEqual({ working: 1, waiting: 3 });
    // The work tabs: the running and the waiting run count as running; the draft market report is to review.
    expect(overview.skills["market-intelligence"]).toEqual({ running: 2, review: 1 });
    expect(overview.skills["offer-intelligence"]).toBeUndefined();
    expect(overview.actionable).toBe(true);
  });

  it("orders the waiting list by what unblocks the most, with each report's source count", async () => {
    const { t, workspaceId } = await seed();
    const items = await t.withIdentity(identity("user_owner")).query(api.home.waiting, { workspaceId });
    expect(items.map((row) => row.kind)).toEqual(["question", "checkIn", "approval"]);
    const approval = items.find((row) => row.kind === "approval");
    expect(approval && approval.kind === "approval" ? approval.sources : -1).toBe(2);
  });

  it("works out the knowledge percent and the single most useful missing item", async () => {
    const { t, workspaceId } = await seed();
    const owner = t.withIdentity(identity("user_owner"));
    let known = (await owner.query(api.home.overview, { workspaceId })).knowledge;
    // Profile confirmed only: 1 of 5.
    expect(known.percent).toBe(20);
    expect(known.items.filter((row) => row.done).map((row) => row.key)).toEqual(["profile"]);
    expect(known.next).toMatchObject({ key: "facts", label: "Add facts about your business" });

    await t.run(async (ctx) => {
      await ctx.db.insert("businessFacts", { workspaceId, factKey: "offer", value: "Deep cleans", sourceType: "owner", recordedAt: 1, recordedBy: "user_owner", status: "verified" });
    });
    known = (await owner.query(api.home.overview, { workspaceId })).knowledge;
    expect(known.percent).toBe(40);
    expect(known.next).toMatchObject({ key: "results", label: "Upload a results file" });

    await t.run(async (ctx) => {
      await ctx.db.insert("resultUploads", {
        workspaceId,
        fileName: "jobber.csv",
        label: "Jobber",
        currency: "USD",
        uploadedBy: "user_owner",
        createdAt: 1,
        status: "ready",
        summary: { rows: 1, dateStart: null, dateStop: null, metrics: ["conversions"], totals: { conversions: 50 }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] },
      });
    });
    await t.mutation(internal.metaAds.saveConnection, {
      workspaceId,
      source: "oauth",
      accessToken: "SECRET",
      scopes: ["ads_read"],
      metaUserId: "m1",
      metaUserName: "Pat",
      connectedBy: "user_owner",
      calls: 0,
    });
    known = (await owner.query(api.home.overview, { workspaceId })).knowledge;
    expect(known.percent).toBe(80);
    expect(known.next?.key).toBe("outcome");
  });

  it("knowledgeFrom suggests nothing once everything is known", () => {
    const all = knowledgeFrom({ profile: true, facts: true, meta: true, results: true, outcome: true });
    expect(all.percent).toBe(100);
    expect(all.next).toBeNull();
    expect(knowledgeFrom({ profile: false, facts: true, meta: true, results: true, outcome: true }).next?.key).toBe("profile");
  });

  it("lists recorded outcomes with the measured change", async () => {
    const { t, workspaceId, projectId, doneRun } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("decisions", {
        workspaceId,
        projectId,
        runId: doneRun as Id<"agentRuns">,
        opportunityIndex: 1,
        opportunity: "Lead with speed",
        proposedAction: "Same-day booking",
        validationMethod: "Bookings",
        checkInAt: 1,
        createdBy: "user_owner",
        createdAt: 1,
        baseline: [{ source: "upload", label: "Jobber", currency: "USD", dateStart: null, dateStop: null, conversions: 40, capturedAt: 1 }],
        outcome: { result: "better", note: "", after: [{ source: "upload", label: "Jobber", currency: "USD", dateStart: null, dateStop: null, conversions: 50, capturedAt: 2 }], recordedAt: 9, recordedBy: "user_owner" },
      });
    });
    const owner = t.withIdentity(identity("user_owner"));
    const proven = await owner.query(api.home.proven, { workspaceId });
    expect(proven).toHaveLength(1);
    expect(proven[0].changes[0]).toMatchObject({ metric: "conversions", before: 40, after: 50, percent: 25 });
    expect((await owner.query(api.home.overview, { workspaceId })).knowledge.items.find((row) => row.key === "outcome")?.done).toBe(true);
  });

  it("lists evidence across sessions; reps see sources but not money figures", async () => {
    const { t, workspaceId } = await seed();
    const owner = await t.withIdentity(identity("user_owner")).query(api.home.evidence, { workspaceId });
    expect(owner.sourceCount).toBe(2);
    expect(owner.sources[0].projectTitle).toBe("Austin deep cleaning");
    expect(owner.seesFigures).toBe(true);
    const rep = await t.withIdentity(identity("user_rep")).query(api.home.evidence, { workspaceId });
    expect(rep.sourceCount).toBe(2);
    expect(rep.seesFigures).toBe(false);
    expect(rep.figures).toEqual([]);
  });

  it("tells a rep the queue is for an owner or manager", async () => {
    const { t, workspaceId } = await seed();
    const rep = await t.withIdentity(identity("user_rep")).query(api.home.overview, { workspaceId });
    expect(rep.role).toBe("rep");
    expect(rep.actionable).toBe(false);
    expect(rep.waiting.total).toBe(3);
  });

  it("searches sessions and reports by title", async () => {
    const { t, workspaceId } = await seed();
    const owner = t.withIdentity(identity("user_owner"));
    const hits = await owner.query(api.home.search, { workspaceId, text: "austin" });
    expect(hits.map((row) => row.kind).sort()).toEqual(["asset", "session"]);
    expect(await owner.query(api.home.search, { workspaceId, text: "a" })).toEqual([]);
  });

  it("keeps every read to the caller's workspace", async () => {
    const { t, workspaceId, other } = await seed();
    const outsider = t.withIdentity(identity("user_other"));
    for (const query of [api.home.overview, api.home.waiting, api.home.proven, api.home.evidence]) {
      await expect(outsider.query(query, { workspaceId })).rejects.toThrow();
    }
    await expect(outsider.query(api.home.search, { workspaceId, text: "austin" })).rejects.toThrow();
    // Their own workspace sees none of the first one's work.
    const own = await outsider.query(api.home.overview, { workspaceId: other });
    expect(own.waiting.total).toBe(0);
    expect(own.loop).toMatchObject({ research: 0, decide: 0, try: 0, measure: 0 });
    expect((await outsider.query(api.home.evidence, { workspaceId: other })).sourceCount).toBe(0);
    expect(await outsider.query(api.home.search, { workspaceId: other, text: "austin" })).toEqual([]);
  });
});
