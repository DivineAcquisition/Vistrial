/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { saveSourceRef } from "./lib/sourceRefs";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const page = { numItems: 50, cursor: null };

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
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

const TIKTOK = "https://www.tiktok.com/@shop/video/7234567890123456789";
const scope = {
  title: "Austin cleaners",
  objective: "What do local competitors show?",
  market: "Deep cleaning",
  geography: "Austin, TX",
  competitors: [{ name: "Sparkle", url: "https://sparkle.example.com" }],
  platforms: ["web" as const, "youtube" as const, "tiktok" as const, "instagram" as const, "metaAdLibrary" as const],
  suppliedUrls: [TIKTOK, "https://www.instagram.com/p/Cabc123xyz/", "https://www.facebook.com/ads/library/?id=1234567890"],
};

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-rep@example.com`, role: "rep" });
  const rep = t.withIdentity(person(`${name}-rep`));
  await rep.mutation(api.workspace.acceptInvite, { token: invite.token });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
  const projectId = await owner.mutation(api.research.createProject, { workspaceId, ...scope });
  return { owner, rep, workspaceId, projectId };
}

async function finishRun(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

/** The network the adapters see in these tests. Anything unexpected fails loudly. */
function fakeNetwork() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://www.googleapis.com/youtube/v3/search")) {
      return reply({ items: [{ id: { videoId: "aaaaaaaaaaa" }, snippet: { title: "Deep clean Austin", channelTitle: "Sparkle" } }] });
    }
    if (url.startsWith("https://www.tiktok.com/oembed")) {
      return reply({ title: "Clean with me", author_name: "shop", embed_product_id: "7234567890123456789" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return calls;
}

describe("collect steps (Milestone B)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.ALLOW_DEV_SKILLS = "true";
    process.env.YOUTUBE_API_KEY = "yt-test-key";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.ALLOW_DEV_SKILLS;
    delete process.env.YOUTUBE_API_KEY;
  });

  it("runs every adapter on the project, saves sources and an honest status per source, and locks the scope", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const calls = fakeNetwork();
    const runId = await a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", projectId: a.projectId });
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("completed");

    const run = await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId });
    expect(run.steps.map((step: { kind: string; toolSlug: string | null; resultCode: string }) => [step.kind === "model" ? "model" : step.toolSlug, step.resultCode])).toEqual([
      ["model", "ok"],
      ["source.web", "ok"],
      ["source.youtube", "ok"],
      ["source.tiktok", "ok"],
      ["source.instagram", "awaiting_authorization"],
      ["source.metaAdLibrary", "partial"],
    ]);

    const statuses = await a.rep.query(api.research.sourceStatuses, { workspaceId: a.workspaceId, projectId: a.projectId, runId });
    const byPlatform = Object.fromEntries(statuses.map((row: { platform: string; state: string; reasonCode: string; found: number }) => [row.platform, [row.state, row.reasonCode, row.found]]));
    expect(byPlatform).toEqual({
      web: ["available", "ok", 1],
      youtube: ["available", "ok", 1],
      tiktok: ["available", "ok", 1],
      instagram: ["awaitingAuthorization", "not_configured", 1],
      metaAdLibrary: ["partial", "commercial_outside_eu_uk", 1],
    });

    const sources = await a.rep.query(api.research.listSourceRefs, { workspaceId: a.workspaceId, projectId: a.projectId, paginationOpts: page });
    const rows = sources.page as { platform: string; url: string; embed: { provider: string; id: string } | null; availability: string }[];
    expect(rows.map((row) => row.platform).sort()).toEqual(["instagram", "metaAdLibrary", "tiktok", "web", "youtube"]);
    expect(rows.find((row) => row.platform === "tiktok")).toMatchObject({ availability: "available", embed: { provider: "tiktok", id: "7234567890123456789" } });
    expect(rows.find((row) => row.platform === "youtube")).toMatchObject({ embed: { provider: "youtube", id: "aaaaaaaaaaa" } });
    expect(JSON.stringify(sources)).not.toContain("yt-test-key");
    expect(calls.filter((url) => url.includes("googleapis"))).toHaveLength(2);
    expect(calls.every((url) => !url.includes("graph.facebook.com"))).toBe(true);

    // Running locked the scope. The project points at this run.
    const project = await a.owner.query(api.research.getProject, { workspaceId: a.workspaceId, projectId: a.projectId });
    expect(project.latestRunId).toBe(runId);
    expect(await message(a.owner.mutation(api.research.updateProject, { workspaceId: a.workspaceId, projectId: a.projectId, ...scope }))).toContain("already run");
    // Every saved source links back to the raw adapter record of its step, and never to page text on screen.
    const stored = await t.run((ctx) => ctx.db.query("sourceRefs").collect());
    expect(stored.every((row) => row.runId === runId && row.artifactId)).toBe(true);
  });

  it("a second run keeps the same pages once and only fills gaps", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    fakeNetwork();
    const first = await a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", projectId: a.projectId });
    await finishRun(t, a.owner, a.workspaceId, first);
    const before = (await t.run((ctx) => ctx.db.query("sourceRefs").collect())).length;
    const second = await a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", projectId: a.projectId });
    expect(await finishRun(t, a.owner, a.workspaceId, second)).toBe("completed");
    expect((await t.run((ctx) => ctx.db.query("sourceRefs").collect())).length).toBe(before);
  });

  it("a later check adds an embed to a link the web search found, and never overwrites", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const id = await t.run(async (ctx) => {
      const base = { workspaceId: a.workspaceId, projectId: a.projectId, platform: "tiktok" as const, url: TIKTOK, observedAt: 1 };
      const found = await saveSourceRef(ctx, { ...base, origin: "found", kind: "short", title: TIKTOK, availability: "linkOnly", excerpt: "first" });
      await saveSourceRef(ctx, { ...base, origin: "supplied", kind: "short", title: "Clean with me", publisher: "shop", embed: { provider: "tiktok", id: "7234567890123456789" }, availability: "available", excerpt: "second" });
      return found.id;
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ origin: "found", title: "Clean with me", publisher: "shop", availability: "available", excerpt: "first", embed: { provider: "tiktok", id: "7234567890123456789" } });
  });

  it("refuses a run on another workspace's project or by a Rep, and a run with no project fails its first collect step", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    fakeNetwork();
    const start = (caller: Caller, workspaceId: Id<"workspaces">, projectId?: Id<"researchProjects">) =>
      caller.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", ...(projectId ? { projectId } : {}) });
    expect(await message(start(b.owner, b.workspaceId, a.projectId))).toBe(NOT_FOUND);
    expect(await message(start(a.rep, a.workspaceId, a.projectId))).toBe(NOT_ALLOWED);
    const runId = await start(a.owner, a.workspaceId);
    expect(await finishRun(t, a.owner, a.workspaceId, runId)).toBe("failed");
    const run = await a.owner.query(api.runs.get, { workspaceId: a.workspaceId, runId });
    expect(run.steps.at(-1)).toMatchObject({ toolSlug: "source.web", resultCode: "no_project" });
  });

  it("an archived project cannot run, and an open run blocks archiving", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    fakeNetwork();
    const runId = await a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", projectId: a.projectId });
    expect(await message(a.owner.mutation(api.research.archiveProject, { workspaceId: a.workspaceId, projectId: a.projectId }))).toContain("Stop the run");
    await finishRun(t, a.owner, a.workspaceId, runId);
    await a.owner.mutation(api.research.archiveProject, { workspaceId: a.workspaceId, projectId: a.projectId });
    expect(
      await message(a.owner.mutation(api.runs.start, { workspaceId: a.workspaceId, agentSlug: "growth-architect", skillSlug: "test-sources", projectId: a.projectId })),
    ).toContain("archived");
  });
});
