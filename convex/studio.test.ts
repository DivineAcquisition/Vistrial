/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

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

const scope = {
  title: "Austin cleaners",
  objective: "What do competitors lead with?",
  market: "Deep cleaning",
  geography: "Austin, TX",
  competitors: [],
  platforms: ["web" as const],
  suppliedUrls: [],
};

describe("Research Studio queries (2.13)", () => {
  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  it("shows a project before any run, and refuses another workspace", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("a-owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    const projectId = await owner.mutation(api.research.createProject, { workspaceId, ...scope });
    const view = await owner.query(api.studio.studio, { workspaceId, projectId });
    expect(view.project).toMatchObject({ title: "Austin cleaners", objective: "What do competitors lead with?" });
    expect(view.run).toBeNull();
    const other = t.withIdentity(person("b-owner"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    expect(await message(other.query(api.studio.studio, { workspaceId: otherId, projectId }))).toBe(NOT_FOUND);
    expect(await message(other.query(api.studio.studio, { workspaceId, projectId }))).toBe(NOT_FOUND);
  });

  it("says which sources are set up, never what a key is", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("a-owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    const before = await owner.query(api.studio.sourceSetup, { workspaceId });
    expect(before.sources.find((row) => row.platform === "youtube")?.state).toBe("limited");
    process.env.YOUTUBE_API_KEY = "yt-secret-value";
    const after = await owner.query(api.studio.sourceSetup, { workspaceId, geography: "Austin, TX" });
    expect(after.sources.find((row) => row.platform === "youtube")?.state).toBe("ready");
    expect(after.sources.find((row) => row.platform === "metaAdLibrary")?.words).toContain("outside the EU and UK");
    expect(JSON.stringify(after)).not.toContain("yt-secret-value");
    expect(after.cost).toMatchObject({ capCents: 300, reserveCents: 50, dayCapCents: 2500, daySpentCents: 0 });
  });
});

describe("launch routes", () => {
  it("fills only missing routes and never changes one already set", async () => {
    const { internal } = await import("./_generated/api");
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("modelRoutes", { workKind: "write", provider: "claude", model: "claude-sonnet-5-5", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" }));
    const first = await t.mutation(internal.platform.ensureDefaultRoutes, {});
    expect(first).toEqual({ added: ["research", "classify", "summarize"], kept: ["write"] });
    const rows = await t.run((ctx) => ctx.db.query("modelRoutes").collect());
    expect(rows.find((row) => row.workKind === "write")?.model).toBe("claude-sonnet-5-5");
    expect(rows.find((row) => row.workKind === "research")?.model).toBe("claude-opus-5-5");
    expect(await t.mutation(internal.platform.ensureDefaultRoutes, {})).toEqual({ added: [], kept: ["research", "write", "classify", "summarize"] });
  });
});

describe("decisions queue", () => {
  it("lists runs waiting on a person with their project, only in this workspace", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("a-owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    const projectId = await owner.mutation(api.research.createProject, { workspaceId, ...scope, market: "" });
    await t.run((ctx) =>
      ctx.db.insert("agentRuns", {
        workspaceId,
        agentSlug: "growth-architect",
        skillSlug: "market-intelligence",
        status: "waiting",
        waitingFor: { questionId: "q", questionKey: "researchMarket", question: "Which industry or market should I research?", askedAt: 5 },
        startedBy: "a-owner",
        inputRef: projectId,
        startedAt: 1,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
    );
    expect(await owner.query(api.studio.attention, { workspaceId })).toMatchObject([{ status: "waiting", projectTitle: "Austin cleaners", question: "Which industry or market should I research?" }]);
    const other = t.withIdentity(person("b-owner"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    expect(await other.query(api.studio.attention, { workspaceId: otherId })).toEqual([]);
  });
});
