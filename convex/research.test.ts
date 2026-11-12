/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { MAX_EXCERPT, canonicalUrl, clipExcerpt, parsePublicUrl, saveSourceRef, setSourceStatus } from "./lib/sourceRefs";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const page = { numItems: 20, cursor: null };

const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;

function person(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    // A message meant for a person travels as ConvexError data; read it from there.
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  return "accepted";
}

const scope = {
  title: "Austin cleaners",
  objective: "What do local competitors advertise, and where?",
  market: "Deep cleaning",
  geography: "Austin, TX",
  competitors: [{ name: "Sparkle", url: "https://sparkle.example.com" }],
  platforms: ["web" as const, "youtube" as const],
  suppliedUrls: ["https://www.tiktok.com/@shop/video/1?utm_source=x", "https://tiktok.com/@shop/video/1/"],
};

/** A workspace with an Owner and a Viewer, a project, a run, an artifact, one source and its status. */
async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-viewer@example.com`, role: "viewer" });
  const viewer = t.withIdentity(person(`${name}-viewer`));
  await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
  const projectId = await owner.mutation(api.research.createProject, { workspaceId, ...scope });
  const ids = await t.run(async (ctx) => {
    const runId = await ctx.db.insert("agentRuns", {
      workspaceId,
      agentSlug: "growth-architect",
      skillSlug: "market-intelligence",
      status: "completed",
      startedBy: `${name}-owner`,
      inputRef: "market-intelligence",
      startedAt: Date.now(),
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId,
      runId,
      index: 0,
      idempotencyKey: `${runId}:0`,
      kind: "model",
      status: "completed",
      durationMs: 1,
      inputTokens: 0,
      outputTokens: 0,
      resultCode: "ok",
    });
    const artifactId = await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId, kind: "sources", byteSize: 2, body: "{}" });
    await ctx.db.patch(projectId, { latestRunId: runId });
    const write = ctx as unknown as MutationCtx;
    const ref = await saveSourceRef(write, {
      workspaceId,
      projectId,
      runId,
      artifactId,
      origin: "found",
      platform: "web",
      kind: "page",
      url: `https://www.${name.toLowerCase()}.example.com/offer/?utm_campaign=x#top`,
      title: "Offer page",
      publisher: `${name} Cleaning`,
      observedAt: Date.now(),
      availability: "available",
      excerpt: "First deep clean $199.",
    });
    await setSourceStatus(write, { workspaceId, runId, projectId, platform: "web", state: "available", reasonCode: "ok", found: 1 });
    await setSourceStatus(write, {
      workspaceId,
      runId,
      projectId,
      platform: "youtube",
      state: "awaitingAuthorization",
      reasonCode: "no_api_key",
      found: 0,
    });
    return { runId, artifactId, sourceRefId: ref.id };
  });
  return { owner, viewer, workspaceId, projectId, ...ids };
}

/** Every public research and collection function, called on `target`'s records by `caller` in `callerWs`. */
function crossCalls(caller: Caller, callerWs: Id<"workspaces">, target: { projectId: Id<"researchProjects">; runId: Id<"agentRuns">; sourceRefId: Id<"sourceRefs"> }, collectionId: Id<"collections">) {
  return {
    "research.getProject": () => caller.query(api.research.getProject, { workspaceId: callerWs, projectId: target.projectId }),
    "research.updateProject": () => caller.mutation(api.research.updateProject, { workspaceId: callerWs, projectId: target.projectId, ...scope }),
    "research.archiveProject": () => caller.mutation(api.research.archiveProject, { workspaceId: callerWs, projectId: target.projectId }),
    "research.listSourceRefs": () => caller.query(api.research.listSourceRefs, { workspaceId: callerWs, projectId: target.projectId, paginationOpts: page }),
    "research.getSourceRef": () => caller.query(api.research.getSourceRef, { workspaceId: callerWs, sourceRefId: target.sourceRefId }),
    "research.sourceStatuses": () => caller.query(api.research.sourceStatuses, { workspaceId: callerWs, projectId: target.projectId, runId: target.runId }),
    "collections.create (other project)": () => caller.mutation(api.collections.create, { workspaceId: callerWs, name: "x", shared: false, projectId: target.projectId }),
    "collections.rename": () => caller.mutation(api.collections.rename, { workspaceId: callerWs, collectionId, name: "x" }),
    "collections.remove": () => caller.mutation(api.collections.remove, { workspaceId: callerWs, collectionId }),
    "collections.items": () => caller.query(api.collections.items, { workspaceId: callerWs, collectionId }),
    "collections.addItem": () => caller.mutation(api.collections.addItem, { workspaceId: callerWs, collectionId, sourceRefId: target.sourceRefId }),
    "collections.removeItem": () => caller.mutation(api.collections.removeItem, { workspaceId: callerWs, collectionId, sourceRefId: target.sourceRefId }),
  };
}

describe("research projects, sources and collections", () => {
  it("refuses every function on another workspace's records with the same not-found", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const collectionA = await a.owner.mutation(api.collections.create, { workspaceId: a.workspaceId, name: "Hooks", shared: true });
    await a.owner.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: collectionA, sourceRefId: a.sourceRefId });

    // B, in its own workspace, naming A's records.
    const calls = crossCalls(b.owner, b.workspaceId, a, collectionA);
    const results: Record<string, string> = {};
    for (const [name, call] of Object.entries(calls)) results[name] = await message(call());
    expect(results).toEqual(Object.fromEntries(Object.keys(calls).map((name) => [name, NOT_FOUND])));

    // B naming A's workspace directly.
    const direct = {
      "research.createProject": () => b.owner.mutation(api.research.createProject, { workspaceId: a.workspaceId, ...scope }),
      "research.listProjects": () => b.owner.query(api.research.listProjects, { workspaceId: a.workspaceId, paginationOpts: page }),
      "research.getProject": () => b.owner.query(api.research.getProject, { workspaceId: a.workspaceId, projectId: a.projectId }),
      "collections.list": () => b.owner.query(api.collections.list, { workspaceId: a.workspaceId }),
      "collections.create": () => b.owner.mutation(api.collections.create, { workspaceId: a.workspaceId, name: "x", shared: false }),
    };
    for (const [name, call] of Object.entries(direct)) expect([name, await message(call())]).toEqual([name, NOT_FOUND]);

    // B's own collection cannot hold A's source, and B's run cannot read A's project statuses.
    const collectionB = await b.owner.mutation(api.collections.create, { workspaceId: b.workspaceId, name: "Mine", shared: true });
    expect(
      await message(b.owner.mutation(api.collections.addItem, { workspaceId: b.workspaceId, collectionId: collectionB, sourceRefId: a.sourceRefId })),
    ).toBe(NOT_FOUND);
    expect(
      await message(b.owner.query(api.research.sourceStatuses, { workspaceId: b.workspaceId, projectId: b.projectId, runId: a.runId })),
    ).toBe(NOT_FOUND);

    // Lists hold only the caller's workspace.
    const projects = await b.owner.query(api.research.listProjects, { workspaceId: b.workspaceId, paginationOpts: page });
    expect(projects.page.map((row) => row.id)).toEqual([b.projectId]);
    expect((await b.owner.query(api.collections.list, { workspaceId: b.workspaceId })).map((row) => row.id)).toEqual([collectionB]);

    // A's records are untouched.
    const after = await a.owner.query(api.research.getProject, { workspaceId: a.workspaceId, projectId: a.projectId });
    expect(after.status).toBe("draft");
    expect((await a.owner.query(api.collections.items, { workspaceId: a.workspaceId, collectionId: collectionA })).items).toHaveLength(1);
  });

  it("refuses to write a source or status against another workspace's project, run or artifact", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const base = {
      workspaceId: b.workspaceId,
      projectId: b.projectId,
      origin: "found" as const,
      platform: "web" as const,
      kind: "page" as const,
      url: "https://example.com/x",
      title: "x",
      observedAt: Date.now(),
      availability: "available" as const,
    };
    const tries = {
      project: { ...base, projectId: a.projectId },
      run: { ...base, runId: a.runId },
      artifact: { ...base, artifactId: a.artifactId },
    };
    for (const [name, input] of Object.entries(tries)) {
      expect([name, await message(t.run(async (ctx) => saveSourceRef(ctx as unknown as MutationCtx, input)))]).toEqual([name, NOT_FOUND]);
    }
    const status = { workspaceId: b.workspaceId, projectId: b.projectId, runId: b.runId, platform: "web" as const, state: "available" as const, reasonCode: "ok", found: 1 };
    expect(await message(t.run(async (ctx) => setSourceStatus(ctx as unknown as MutationCtx, { ...status, runId: a.runId })))).toBe(NOT_FOUND);
    expect(await message(t.run(async (ctx) => setSourceStatus(ctx as unknown as MutationCtx, { ...status, projectId: a.projectId })))).toBe(NOT_FOUND);
  });

  it("creates a project for an Owner or Admin only, checks its scope, and locks it once it runs", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    expect(await message(a.viewer.mutation(api.research.createProject, { workspaceId: a.workspaceId, ...scope }))).toBe(NOT_ALLOWED);
    expect(await message(a.viewer.mutation(api.research.archiveProject, { workspaceId: a.workspaceId, projectId: a.projectId }))).toBe(NOT_ALLOWED);
    const bad = (patch: Partial<typeof scope>) => message(a.owner.mutation(api.research.createProject, { workspaceId: a.workspaceId, ...scope, ...patch }));
    expect(await bad({ title: " " })).toContain("name");
    expect(await bad({ platforms: [] })).toBe("Pick at least one place to look.");
    expect(await bad({ suppliedUrls: ["javascript:alert(1)"] })).toBe("One of the links is not a public web address.");
    expect(await bad({ suppliedUrls: ["https://user:pass@example.com/"] })).toBe("One of the links is not a public web address.");
    expect(await bad({ competitors: [{ name: "X", url: "ftp://x.example.com" }] })).toBe("The link for X is not a public web address.");

    const project = await a.viewer.query(api.research.getProject, { workspaceId: a.workspaceId, projectId: a.projectId });
    // The same TikTok link pasted twice, once with tracking, is kept once.
    expect(project.suppliedUrls).toEqual(["https://www.tiktok.com/@shop/video/1?utm_source=x"]);
    expect(project.sourceCounts).toEqual({ web: 1, youtube: 0 });
    expect(project.sourceStatus.map((row) => [row.platform, row.state, row.reasonCode])).toEqual([
      ["web", "available", "ok"],
      ["youtube", "awaitingAuthorization", "no_api_key"],
    ]);

    await t.run(async (ctx) => ctx.db.patch(a.projectId, { status: "ready" }));
    expect(await message(a.owner.mutation(api.research.updateProject, { workspaceId: a.workspaceId, projectId: a.projectId, ...scope }))).toContain(
      "already run",
    );
    await a.owner.mutation(api.research.archiveProject, { workspaceId: a.workspaceId, projectId: a.projectId });
    const archived = await a.owner.query(api.research.listProjects, { workspaceId: a.workspaceId, paginationOpts: page, status: "archived" });
    expect(archived.page.map((row) => row.id)).toEqual([a.projectId]);
  });

  it("lists sources by platform with no raw fetch, and saves the same page once", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const again = await t.run(async (ctx) =>
      saveSourceRef(ctx as unknown as MutationCtx, {
        workspaceId: a.workspaceId,
        projectId: a.projectId,
        origin: "supplied",
        platform: "web",
        kind: "page",
        url: "https://alpha.example.com/offer",
        title: "Same page",
        observedAt: Date.now(),
        availability: "available",
        excerpt: "word ".repeat(200),
      }),
    );
    expect(again).toEqual({ id: a.sourceRefId, created: false });
    const web = await a.viewer.query(api.research.listSourceRefs, { workspaceId: a.workspaceId, projectId: a.projectId, platform: "web", paginationOpts: page });
    expect(web.page).toHaveLength(1);
    expect(web.page[0]).toMatchObject({ canonicalUrl: "https://alpha.example.com/offer", publisher: "Alpha Cleaning", excerpt: "First deep clean $199." });
    expect(Object.keys(web.page[0])).not.toContain("artifactId");
    const none = await a.viewer.query(api.research.listSourceRefs, { workspaceId: a.workspaceId, projectId: a.projectId, platform: "tiktok", paginationOpts: page });
    expect(none.page).toEqual([]);
    expect((await a.viewer.query(api.research.getSourceRef, { workspaceId: a.workspaceId, sourceRefId: a.sourceRefId })).title).toBe("Offer page");

    const long = await t.run(async (ctx) =>
      saveSourceRef(ctx as unknown as MutationCtx, {
        workspaceId: a.workspaceId,
        projectId: a.projectId,
        origin: "found",
        platform: "web",
        kind: "page",
        url: "https://alpha.example.com/long",
        title: "Long",
        observedAt: Date.now(),
        availability: "available",
        excerpt: "word ".repeat(200),
      }),
    );
    const stored = await a.viewer.query(api.research.getSourceRef, { workspaceId: a.workspaceId, sourceRefId: long.id });
    expect(stored.excerpt!.length).toBeLessThanOrEqual(MAX_EXCERPT);
  });

  it("keeps a personal collection to its owner, and lets only an Owner or Admin change a workspace collection", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const mine = await a.viewer.mutation(api.collections.create, { workspaceId: a.workspaceId, name: "My hooks", shared: false, projectId: a.projectId });
    await a.viewer.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: mine, sourceRefId: a.sourceRefId, note: "Good opener" });
    // Saving again changes nothing.
    await a.viewer.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: mine, sourceRefId: a.sourceRefId });
    const items = await a.viewer.query(api.collections.items, { workspaceId: a.workspaceId, collectionId: mine });
    expect(items.items.map((row) => [row.source.title, row.note])).toEqual([["Offer page", "Good opener"]]);
    expect(items.collection).toMatchObject({ shared: false, items: 1, projectId: a.projectId });

    // The Owner of the same workspace cannot see or change the Viewer's personal collection.
    for (const call of [
      () => a.owner.query(api.collections.items, { workspaceId: a.workspaceId, collectionId: mine }),
      () => a.owner.mutation(api.collections.rename, { workspaceId: a.workspaceId, collectionId: mine, name: "x" }),
      () => a.owner.mutation(api.collections.remove, { workspaceId: a.workspaceId, collectionId: mine }),
      () => a.owner.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: mine, sourceRefId: a.sourceRefId }),
      () => a.owner.mutation(api.collections.removeItem, { workspaceId: a.workspaceId, collectionId: mine, sourceRefId: a.sourceRefId }),
    ]) {
      expect(await message(call())).toBe(NOT_FOUND);
    }
    expect(await a.owner.query(api.collections.list, { workspaceId: a.workspaceId })).toEqual([]);

    // A Viewer reads a workspace collection but cannot make or change one.
    expect(await message(a.viewer.mutation(api.collections.create, { workspaceId: a.workspaceId, name: "Team", shared: true }))).toBe(NOT_ALLOWED);
    const team = await a.owner.mutation(api.collections.create, { workspaceId: a.workspaceId, name: "Team", shared: true });
    expect(await message(a.viewer.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: team, sourceRefId: a.sourceRefId }))).toBe(NOT_ALLOWED);
    expect(await message(a.viewer.mutation(api.collections.rename, { workspaceId: a.workspaceId, collectionId: team, name: "x" }))).toBe(NOT_ALLOWED);
    expect(await message(a.viewer.mutation(api.collections.remove, { workspaceId: a.workspaceId, collectionId: team }))).toBe(NOT_ALLOWED);
    expect((await a.viewer.query(api.collections.items, { workspaceId: a.workspaceId, collectionId: team })).items).toEqual([]);
    expect((await a.viewer.query(api.collections.list, { workspaceId: a.workspaceId })).map((row) => row.name).sort()).toEqual(["My hooks", "Team"]);
    expect((await a.viewer.query(api.collections.list, { workspaceId: a.workspaceId, projectId: a.projectId })).map((row) => row.name)).toEqual(["My hooks"]);

    // Removing a collection removes its items, not the source.
    await a.viewer.mutation(api.collections.removeItem, { workspaceId: a.workspaceId, collectionId: mine, sourceRefId: a.sourceRefId });
    expect((await a.viewer.query(api.collections.items, { workspaceId: a.workspaceId, collectionId: mine })).items).toEqual([]);
    await a.owner.mutation(api.collections.addItem, { workspaceId: a.workspaceId, collectionId: team, sourceRefId: a.sourceRefId });
    await a.owner.mutation(api.collections.remove, { workspaceId: a.workspaceId, collectionId: team });
    const leftover = await t.run(async (ctx) =>
      ctx.db.query("collectionItems").withIndex("by_workspace_ref", (q) => q.eq("workspaceId", a.workspaceId).eq("sourceRefId", a.sourceRefId)).take(5),
    );
    expect(leftover).toEqual([]);
    expect((await a.viewer.query(api.research.getSourceRef, { workspaceId: a.workspaceId, sourceRefId: a.sourceRefId })).id).toBe(a.sourceRefId);
  });

  it("turns links into one public form and keeps excerpts short", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/b/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/a/b?a=1&b=2");
    expect(canonicalUrl("http://example.com")).toBe("https://example.com");
    expect(canonicalUrl("https://youtu.be/abc?si=track")).toBe("https://youtu.be/abc");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://localhost/x", "https://a:b@example.com", "not a url", ""]) {
      expect([bad, parsePublicUrl(bad)]).toEqual([bad, null]);
    }
    expect(clipExcerpt("  short   text ")).toBe("short text");
    expect(clipExcerpt("x".repeat(400))!.length).toBe(MAX_EXCERPT);
    expect(clipExcerpt("   ")).toBeUndefined();
  });
});
