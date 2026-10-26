/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { LIBRARY_ACCEPTANCE } from "./lib/salesWork";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

describe("sales studio", () => {
  it("keeps a research report waiting until someone approves it", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    await expect(owner.mutation(api.studio.completeSetup, { workspaceId })).rejects.toThrow("Add the offer and the audience");
    await owner.mutation(api.studio.saveProfile, {
      workspaceId,
      offer: "A recorded sales system",
      price: "$12,000",
      audience: "High-ticket closers",
      voice: "Direct",
      examples: "",
      pastAds: "",
      competitors: "",
    });
    await owner.mutation(api.studio.addSwipe, {
      workspaceId,
      excerpt: "A public line",
      sourceName: "Example Daily",
    });
    await expect(owner.mutation(api.studio.acceptLibraryRisk, { workspaceId, statement: "no" })).rejects.toThrow(
      "Collection stays off",
    );
    await owner.mutation(api.studio.acceptLibraryRisk, { workspaceId, statement: LIBRARY_ACCEPTANCE });
    const assetId = await owner.mutation(api.studio.runSkill, {
      workspaceId,
      agentSlug: "sales",
      skillSlug: "ad-research",
    });
    const waiting = await owner.query(api.studio.overview, { workspaceId });
    expect(waiting.waiting.map((row: { id: string }) => row.id)).toEqual([assetId]);
    expect(waiting.waiting[0]?.body).toContain("Not enough data.");
    expect(waiting.libraryAccepted).toBe(true);
    await owner.mutation(api.studio.decideAsset, { workspaceId, assetId, status: "approved" });
    const after = await owner.query(api.studio.overview, { workspaceId });
    expect(after.waiting).toEqual([]);
    await expect(
      owner.mutation(api.studio.runSkill, { workspaceId, agentSlug: "retention", skillSlug: "health" }),
    ).rejects.toThrow("not built yet");
  });
});
