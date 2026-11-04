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
