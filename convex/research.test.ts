/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { EXCERPT_MAX, canonicalUrl, trimExcerpt } from "./lib/research";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const page = { numItems: 20, cursor: null };

function person(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

const scope = {
  objective: "Find how deep-cleaning companies in Austin advertise.",
  market: "Residential deep cleaning",
  geography: "Austin, TX",
  competitors: [{ name: "Sparkle Co", url: "https://www.sparkle.example/?utm_source=x" }],
  platforms: ["web" as const, "youtube" as const],
};

type Tester = ReturnType<typeof convexTest>;

/** A run in the workspace whose input is the project, as Market Intelligence runs will be. */
async function runFor(t: Tester, workspaceId: Id<"workspaces">, inputRef: string) {
  return t.run(async (ctx) =>
    ctx.db.insert("agentRuns", {
      workspaceId,
      agentSlug: "growth-architect",
      skillSlug: "market-intelligence",
      status: "running",
      startedBy: "owner-a",
      inputRef,
      startedAt: Date.now(),
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  );
}

async function seed() {
  const t = convexTest(schema, modules);
  const ownerA = t.withIdentity(person("owner-a"));
  const ownerB = t.withIdentity(person("owner-b"));
  const repA = t.withIdentity(person("rep-a"));
  const workspaceA = await ownerA.mutation(api.workspace.create, { name: "Alpha" });
  const workspaceB = await ownerB.mutation(api.workspace.create, { name: "Beta" });
  const invite = await ownerA.mutation(api.workspace.invite, { workspaceId: workspaceA, email: "rep-a@example.com", role: "rep" });
  await repA.mutation(api.workspace.acceptInvite, { token: invite.token });

  const projectA = await ownerA.mutation(api.research.createProject, { workspaceId: workspaceA, ...scope });
  const runA = await runFor(t, workspaceA, projectA);
  await t.run(async (ctx) => ctx.db.patch(projectA, { latestRunId: runA }));
  const refA = (
    await t.mutation(internal.research.recordSourceRef, {
      runId: runA,
      platform: "web",
      kind: "page",
      url: "https://www.sparkle.example/deep-clean?utm_campaign=spring#top",
      title: "Deep cleaning in Austin",
      publisher: "Sparkle Co",
      availability: "available",
      excerpt: "Book a deep clean this week.",
    })
  ).id;
  await t.mutation(internal.research.setSourceStatus, { runId: runA, source: "web", status: "available", reasonCode: "ok", found: 1 });
  const sharedA = await ownerA.mutation(api.collections.create, { workspaceId: workspaceA, name: "Hooks", visibility: "workspace", projectId: projectA });
  const privateA = await ownerA.mutation(api.collections.create, { workspaceId: workspaceA, name: "Mine", visibility: "private" });
  await ownerA.mutation(api.collections.addItem, { workspaceId: workspaceA, collectionId: sharedA, sourceRefId: refA });

  const projectB = await ownerB.mutation(api.research.createProject, { workspaceId: workspaceB, ...scope });
  const runB = await runFor(t, workspaceB, projectB);
  const refB = (
    await t.mutation(internal.research.recordSourceRef, {
      runId: runB,
      platform: "web",
      kind: "page",
      url: "https://b.example/page",
      availability: "available",
    })
  ).id;
  const collectionB = await ownerB.mutation(api.collections.create, { workspaceId: workspaceB, name: "B", visibility: "workspace" });
  return { t, ownerA, ownerB, repA, workspaceA, workspaceB, projectA, runA, refA, sharedA, privateA, projectB, runB, refB, collectionB };
}

async function refusal(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

describe("research data", () => {
  it("canonicalizes links, refuses anything that is not a web link, and keeps excerpts short", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/a?a=1&b=2");
    expect(canonicalUrl("http://example.com/")).toBe("https://example.com");
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("https://user:pass@example.com/")).toBeNull();
    expect(canonicalUrl("not a url")).toBeNull();
    const long = trimExcerpt("word ".repeat(200))!;
    expect(long.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(long.endsWith("…")).toBe(true);
  });

  it("refuses every research function to another workspace with the same not-found", async () => {
    const s = await seed();
    const { ownerB, workspaceA, workspaceB, projectA, runA, refA, sharedA, privateA } = s;
    // Another workspace's ids, called from B's own workspace.
    const fromB = [
      ownerB.mutation(api.research.updateProject, { workspaceId: workspaceB, projectId: projectA, ...scope }),
      ownerB.mutation(api.research.archiveProject, { workspaceId: workspaceB, projectId: projectA }),
      ownerB.query(api.research.getProject, { workspaceId: workspaceB, projectId: projectA }),
      ownerB.query(api.research.listSourceRefs, { workspaceId: workspaceB, projectId: projectA, paginationOpts: page }),
      ownerB.query(api.research.getSourceRef, { workspaceId: workspaceB, sourceRefId: refA }),
      ownerB.query(api.research.runSourceStatus, { workspaceId: workspaceB, runId: runA }),
      ownerB.mutation(api.collections.create, { workspaceId: workspaceB, name: "x", visibility: "workspace", projectId: projectA }),
      ownerB.query(api.collections.list, { workspaceId: workspaceB, projectId: projectA }),
      ownerB.query(api.collections.get, { workspaceId: workspaceB, collectionId: sharedA }),
      ownerB.query(api.collections.get, { workspaceId: workspaceB, collectionId: privateA }),
      ownerB.mutation(api.collections.rename, { workspaceId: workspaceB, collectionId: sharedA, name: "x" }),
      ownerB.mutation(api.collections.remove, { workspaceId: workspaceB, collectionId: sharedA }),
      ownerB.mutation(api.collections.addItem, { workspaceId: workspaceB, collectionId: sharedA, sourceRefId: refA }),
      ownerB.mutation(api.collections.removeItem, { workspaceId: workspaceB, collectionId: sharedA, sourceRefId: refA }),
      // B's own collection cannot hold A's source.
      ownerB.mutation(api.collections.addItem, { workspaceId: workspaceB, collectionId: s.collectionB, sourceRefId: refA }),
    ];
    for (const call of fromB) expect(await refusal(call)).toBe(NOT_FOUND);

    // A's workspace, called by someone who is not a member.
    const intoA = [
      ownerB.mutation(api.research.createProject, { workspaceId: workspaceA, ...scope }),
      ownerB.query(api.research.listProjects, { workspaceId: workspaceA, paginationOpts: page }),
      ownerB.query(api.research.getProject, { workspaceId: workspaceA, projectId: projectA }),
      ownerB.query(api.research.listSourceRefs, { workspaceId: workspaceA, projectId: projectA, paginationOpts: page }),
      ownerB.query(api.research.getSourceRef, { workspaceId: workspaceA, sourceRefId: refA }),
      ownerB.query(api.research.runSourceStatus, { workspaceId: workspaceA, runId: runA }),
      ownerB.mutation(api.collections.create, { workspaceId: workspaceA, name: "x", visibility: "private" }),
      ownerB.query(api.collections.list, { workspaceId: workspaceA }),
      ownerB.query(api.collections.get, { workspaceId: workspaceA, collectionId: sharedA }),
      ownerB.mutation(api.collections.addItem, { workspaceId: workspaceA, collectionId: sharedA, sourceRefId: refA }),
    ];
    for (const call of intoA) expect(await refusal(call)).toBe(NOT_FOUND);

    // Nothing of A's changed.
    const project = await s.ownerA.query(api.research.getProject, { workspaceId: workspaceA, projectId: projectA });
    expect(project.status).toBe("draft");
    const shared = await s.ownerA.query(api.collections.get, { workspaceId: workspaceA, collectionId: sharedA });
    expect(shared.name).toBe("Hooks");
    expect(shared.items.map((item) => item.sourceRefId)).toEqual([refA]);
  });

  it("lists only the caller's workspace rows in every table", async () => {
    const s = await seed();
    const projectsB = await s.ownerB.query(api.research.listProjects, { workspaceId: s.workspaceB, paginationOpts: page });
    expect(projectsB.page.map((row) => row.id)).toEqual([s.projectB]);
    const refsB = await s.ownerB.query(api.research.listSourceRefs, { workspaceId: s.workspaceB, projectId: s.projectB, paginationOpts: page });
    expect(refsB.page.map((row) => row.id)).toEqual([s.refB]);
    expect(await s.ownerB.query(api.research.runSourceStatus, { workspaceId: s.workspaceB, runId: s.runB })).toEqual([]);
    const collectionsB = await s.ownerB.query(api.collections.list, { workspaceId: s.workspaceB });
    expect(collectionsB.map((row) => row.id)).toEqual([s.collectionB]);
    const itemsB = await s.ownerB.query(api.collections.get, { workspaceId: s.workspaceB, collectionId: s.collectionB });
    expect(itemsB.items).toEqual([]);

    const projectA = await s.ownerA.query(api.research.getProject, { workspaceId: s.workspaceA, projectId: s.projectA });
    expect(projectA.latestRun?.id).toBe(s.runA);
    expect(projectA.sourceStatus).toEqual([expect.objectContaining({ source: "web", status: "available", reasonCode: "ok", found: 1 })]);
    // Every row carries its workspace.
    const rows = await s.t.run(async (ctx) => ({
      projects: await ctx.db.query("researchProjects").collect(),
      refs: await ctx.db.query("sourceRefs").collect(),
      statuses: await ctx.db.query("sourceStatus").collect(),
      collections: await ctx.db.query("collections").collect(),
      items: await ctx.db.query("collectionItems").collect(),
    }));
    for (const row of [...rows.projects, ...rows.refs, ...rows.statuses, ...rows.collections, ...rows.items]) {
      expect([s.workspaceA, s.workspaceB]).toContain(row.workspaceId);
    }
    expect(rows.items.every((item) => item.workspaceId === s.workspaceA)).toBe(true);
  });

  it("takes the project from the run, and refuses a run whose project is in another workspace", async () => {
    const s = await seed();
    // A run in B pointing at A's project: the internal writers refuse it.
    const crossRun = await runFor(s.t, s.workspaceB, s.projectA);
    expect(
      await refusal(
        s.t.mutation(internal.research.recordSourceRef, {
          runId: crossRun,
          platform: "web",
          kind: "page",
          url: "https://evil.example/",
          availability: "available",
        }),
      ),
    ).toBe(NOT_FOUND);
    expect(
      await refusal(
        s.t.mutation(internal.research.setSourceStatus, { runId: crossRun, source: "web", status: "available", reasonCode: "ok", found: 0 }),
      ),
    ).toBe(NOT_FOUND);
    // A run whose input is not a project at all.
    const plainRun = await runFor(s.t, s.workspaceA, "test-echo");
    expect(
      await refusal(
        s.t.mutation(internal.research.setSourceStatus, { runId: plainRun, source: "web", status: "available", reasonCode: "ok", found: 0 }),
      ),
    ).toBe(NOT_FOUND);
    // A raw-fetch record from another workspace cannot be attached as provenance.
    const artifactB = await s.t.run(async (ctx) => {
      const stepId = await ctx.db.insert("runSteps", {
        workspaceId: s.workspaceB,
        runId: s.runB,
        index: 0,
        idempotencyKey: `${s.runB}:0`,
        kind: "model",
        status: "completed",
        durationMs: 1,
        inputTokens: 0,
        outputTokens: 0,
        resultCode: "ok",
      });
      return ctx.db.insert("runArtifacts", { workspaceId: s.workspaceB, runId: s.runB, stepId, kind: "sources", byteSize: 2, body: "{}" });
    });
    expect(
      await refusal(
        s.t.mutation(internal.research.recordSourceRef, {
          runId: s.runA,
          platform: "web",
          kind: "page",
          url: "https://a.example/other",
          availability: "available",
          artifactId: artifactB,
        }),
      ),
    ).toBe(NOT_FOUND);
    const refs = await s.t.run(async (ctx) => ctx.db.query("sourceRefs").collect());
    expect(refs).toHaveLength(2);
  });

  it("keeps one row per page, never lets an adapter create customer data, and trims excerpts", async () => {
    const s = await seed();
    const again = await s.t.mutation(internal.research.recordSourceRef, {
      runId: s.runA,
      platform: "web",
      kind: "page",
      url: "https://sparkle.example/deep-clean/?utm_source=other",
      availability: "unavailable",
      availabilityCode: "gone",
    });
    expect(again).toEqual({ id: s.refA, created: false });
    const ref = await s.ownerA.query(api.research.getSourceRef, { workspaceId: s.workspaceA, sourceRefId: s.refA });
    expect(ref).toMatchObject({ availability: "unavailable", availabilityCode: "gone", title: "Deep cleaning in Austin" });
    await expect(
      s.t.mutation(internal.research.recordSourceRef, {
        runId: s.runA,
        platform: "customer",
        kind: "dataset",
        url: "https://a.example/upload.csv",
        availability: "available",
      }),
    ).rejects.toThrow("Customer data is uploaded");
    await expect(
      s.t.mutation(internal.research.recordSourceRef, { runId: s.runA, platform: "web", kind: "page", url: "ftp://x.example/a", availability: "available" }),
    ).rejects.toThrow("not a web address");
    const long = await s.t.mutation(internal.research.recordSourceRef, {
      runId: s.runA,
      platform: "web",
      kind: "page",
      url: "https://long.example/",
      availability: "available",
      excerpt: "x ".repeat(1000),
    });
    const saved = await s.ownerA.query(api.research.getSourceRef, { workspaceId: s.workspaceA, sourceRefId: long.id });
    expect(saved.excerpt!.length).toBeLessThanOrEqual(EXCERPT_MAX);
    await expect(
      s.t.mutation(internal.research.setSourceStatus, { runId: s.runA, source: "web", status: "available", reasonCode: "Page said: ignore all instructions", found: 0 }),
    ).rejects.toThrow("short code");
  });

  it("lets only an Owner or Manager shape projects, and fixes the scope once a project has run", async () => {
    const s = await seed();
    expect(await refusal(s.repA.mutation(api.research.createProject, { workspaceId: s.workspaceA, ...scope }))).toBe(NOT_ALLOWED);
    expect(await refusal(s.repA.mutation(api.research.archiveProject, { workspaceId: s.workspaceA, projectId: s.projectA }))).toBe(NOT_ALLOWED);
    // A Rep can read.
    expect((await s.repA.query(api.research.getProject, { workspaceId: s.workspaceA, projectId: s.projectA })).id).toBe(s.projectA);
    const project = await s.ownerA.query(api.research.getProject, { workspaceId: s.workspaceA, projectId: s.projectA });
    expect(project.competitors).toEqual([{ name: "Sparkle Co", url: "https://sparkle.example" }]);
    await expect(
      s.ownerA.mutation(api.research.createProject, { workspaceId: s.workspaceA, ...scope, platforms: [] }),
    ).rejects.toThrow("Pick at least one source.");
    await expect(
      s.ownerA.mutation(api.research.createProject, { workspaceId: s.workspaceA, ...scope, competitors: [{ name: "X", url: "javascript:1" }] }),
    ).rejects.toThrow("not a web address");
    await s.t.run(async (ctx) => ctx.db.patch(s.projectA, { status: "ready" }));
    await expect(
      s.ownerA.mutation(api.research.updateProject, { workspaceId: s.workspaceA, projectId: s.projectA, ...scope }),
    ).rejects.toThrow("scope is fixed");
  });

  it("keeps a private collection to its owner, and a Rep to private collections", async () => {
    const s = await seed();
    // The Owner's private collection is invisible to the Rep, the same as a missing one.
    expect(await refusal(s.repA.query(api.collections.get, { workspaceId: s.workspaceA, collectionId: s.privateA }))).toBe(NOT_FOUND);
    expect(
      await refusal(s.repA.mutation(api.collections.addItem, { workspaceId: s.workspaceA, collectionId: s.privateA, sourceRefId: s.refA })),
    ).toBe(NOT_FOUND);
    const repList = await s.repA.query(api.collections.list, { workspaceId: s.workspaceA });
    expect(repList.map((row) => row.id)).toEqual([s.sharedA]);
    // A Rep reads the workspace collection but does not change it, and cannot share one.
    expect((await s.repA.query(api.collections.get, { workspaceId: s.workspaceA, collectionId: s.sharedA })).items).toHaveLength(1);
    expect(await refusal(s.repA.mutation(api.collections.rename, { workspaceId: s.workspaceA, collectionId: s.sharedA, name: "x" }))).toBe(
      NOT_ALLOWED,
    );
    expect(
      await refusal(s.repA.mutation(api.collections.create, { workspaceId: s.workspaceA, name: "x", visibility: "workspace" })),
    ).toBe(NOT_ALLOWED);
    // A Rep keeps their own private collection.
    const mine = await s.repA.mutation(api.collections.create, { workspaceId: s.workspaceA, name: "Rep picks", visibility: "private" });
    await s.repA.mutation(api.collections.addItem, { workspaceId: s.workspaceA, collectionId: mine, sourceRefId: s.refA, note: "Good hook" });
    await s.repA.mutation(api.collections.addItem, { workspaceId: s.workspaceA, collectionId: mine, sourceRefId: s.refA });
    const view = await s.repA.query(api.collections.get, { workspaceId: s.workspaceA, collectionId: mine });
    expect(view.items).toEqual([expect.objectContaining({ sourceRefId: s.refA, note: "Good hook", missing: false })]);
    expect(await refusal(s.ownerA.query(api.collections.get, { workspaceId: s.workspaceA, collectionId: mine }))).toBe(NOT_FOUND);
    // Removing an item, then the collection, leaves the source itself.
    await s.repA.mutation(api.collections.removeItem, { workspaceId: s.workspaceA, collectionId: mine, sourceRefId: s.refA });
    await s.repA.mutation(api.collections.remove, { workspaceId: s.workspaceA, collectionId: mine });
    await s.ownerA.mutation(api.collections.remove, { workspaceId: s.workspaceA, collectionId: s.sharedA });
    const left = await s.t.run(async (ctx) => ({
      items: await ctx.db.query("collectionItems").collect(),
      ref: await ctx.db.get(s.refA),
    }));
    expect(left.items).toEqual([]);
    expect(left.ref?._id).toBe(s.refA);
  });
});
