/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BASIS_LABEL, MISSING_SOURCE, claimProblems, type ClaimInput } from "./lib/evidence";
import schema from "./schema";

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

type Tester = ReturnType<typeof convexTest>;

async function addRef(t: Tester, workspaceId: Id<"workspaces">, platform: "web" | "customer", url: string) {
  return t.run(async (ctx) =>
    ctx.db.insert("sourceRefs", {
      workspaceId,
      platform,
      kind: platform === "customer" ? "dataset" : "page",
      url,
      canonicalUrl: url,
      observedAt: Date.now(),
      availability: "available",
    }),
  );
}

/** Two workspaces, each with a web source and a customer-data source, and a draft asset in A. */
async function seed() {
  const t = convexTest(schema, modules);
  const ownerA = t.withIdentity(person("owner-a"));
  const ownerB = t.withIdentity(person("owner-b"));
  const workspaceA = await ownerA.mutation(api.workspace.create, { name: "Alpha" });
  const workspaceB = await ownerB.mutation(api.workspace.create, { name: "Beta" });
  const webA = await addRef(t, workspaceA, "web", "https://a.example/ad");
  const customerA = await addRef(t, workspaceA, "customer", "https://a.example/upload.csv");
  const webB = await addRef(t, workspaceB, "web", "https://b.example/ad");
  const assetId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("assets", {
      workspaceId: workspaceA,
      kind: "marketReport",
      title: "Market report",
      status: "draft",
      currentVersion: 1,
      createdAt: Date.now(),
    });
    await ctx.db.insert("assetVersions", { workspaceId: workspaceA, assetId: id, version: 1, body: "v1", createdBy: "agent" });
    return id;
  });
  const problems = (claims: ClaimInput[]) => t.run((ctx) => claimProblems(ctx, workspaceA, claims));
  const addVersion = (claims: ClaimInput[]) =>
    ownerA.mutation(api.assets.addVersion, {
      workspaceId: workspaceA,
      assetId,
      body: "next",
      claims: claims.map((claim) => ({ ...claim, sourceRefIds: claim.sourceRefIds as Id<"sourceRefs">[] | undefined })),
    });
  return { t, ownerA, workspaceA, webA, customerA, webB, assetId, problems, addVersion };
}

const claim = (basis: ClaimInput["basis"], statement: string, sourceRefIds?: string[]): ClaimInput => ({
  claimKey: "c1",
  statement,
  basis,
  sourceRefIds,
});

describe("evidence basis", () => {
  it("observed needs at least one source reference in the same workspace", async () => {
    const { webA, webB, problems, addVersion } = await seed();
    expect(await problems([claim("observed", "Three competitors run video ads.")])).toEqual([
      { claimKey: "c1", code: "observed_needs_source" },
    ]);
    expect(await problems([claim("observed", "Three competitors run video ads.", [webB])])).toEqual([
      { claimKey: "c1", code: "source_missing" },
    ]);
    expect(await problems([claim("observed", "Three competitors run video ads.", [webA])])).toEqual([]);
    await expect(addVersion([claim("observed", "Three competitors run video ads.")])).rejects.toThrow("A claim needs evidence.");
    await expect(addVersion([claim("observed", "Three competitors run video ads.", [webB])])).rejects.toThrow(
      "A claim needs evidence.",
    );
    expect(await addVersion([claim("observed", "Three competitors run video ads.", [webA])])).toBe(2);
  });

  it("inferred needs at least one supporting source reference and is labeled as inference", async () => {
    const { ownerA, workspaceA, assetId, webA, problems, addVersion } = await seed();
    expect(await problems([claim("inferred", "Price is the main hook.")])).toEqual([
      { claimKey: "c1", code: "inferred_needs_source" },
    ]);
    await expect(addVersion([claim("inferred", "Price is the main hook.")])).rejects.toThrow("A claim needs evidence.");
    await addVersion([claim("inferred", "Price is the main hook.", [webA])]);
    const asset = await ownerA.query(api.assets.get, { workspaceId: workspaceA, assetId });
    expect(asset.evidence[0]).toMatchObject({ basis: "inferred", basisLabel: "Inference" });
    expect(asset.evidence[0].sources).toEqual([
      expect.objectContaining({ id: webA, missing: false, platform: "web", url: "https://a.example/ad" }),
    ]);
  });

  it("hypothesis needs no source and is always labeled as untested", async () => {
    const { ownerA, workspaceA, assetId, webB, problems, addVersion } = await seed();
    expect(await problems([claim("hypothesis", "A same-week guarantee could lift bookings.")])).toEqual([]);
    // It needs no source, but anything it does cite must be real and in the workspace.
    expect(await problems([claim("hypothesis", "A same-week guarantee could lift bookings.", [webB])])).toEqual([
      { claimKey: "c1", code: "source_missing" },
    ]);
    await addVersion([claim("hypothesis", "A same-week guarantee could lift bookings.")]);
    const asset = await ownerA.query(api.assets.get, { workspaceId: workspaceA, assetId });
    expect(asset.evidence[0]).toMatchObject({ basis: "hypothesis", basisLabel: "Hypothesis, untested", sources: [] });
    expect(BASIS_LABEL.hypothesis).toContain("untested");
  });

  it("firstParty needs a customer-data source, and a web source does not count", async () => {
    const { webA, customerA, problems, addVersion } = await seed();
    expect(await problems([claim("firstParty", "Your repeat rate is 41%.")])).toEqual([
      { claimKey: "c1", code: "first_party_needs_customer_data" },
    ]);
    expect(await problems([claim("firstParty", "Your repeat rate is 41%.", [webA])])).toEqual([
      { claimKey: "c1", code: "first_party_needs_customer_data" },
    ]);
    expect(await problems([claim("firstParty", "Your repeat rate is 41%.", [customerA])])).toEqual([]);
    await expect(addVersion([claim("firstParty", "Your repeat rate is 41%.", [webA])])).rejects.toThrow(
      "A claim needs evidence.",
    );
    expect(await addVersion([claim("firstParty", "Your repeat rate is 41%.", [customerA])])).toBe(2);
  });

  it("insufficient is the not-enough-data line and carries no claim", async () => {
    const { ownerA, workspaceA, assetId, problems, addVersion } = await seed();
    expect(await problems([claim("insufficient", "TikTok ads lean on price.")])).toEqual([
      { claimKey: "c1", code: "insufficient_is_not_a_claim" },
    ]);
    expect(await problems([claim("insufficient", "Not enough data: 2 TikTok ads found, 5 needed.")])).toEqual([]);
    await expect(addVersion([claim("insufficient", "TikTok ads lean on price.")])).rejects.toThrow("A claim needs evidence.");
    await addVersion([claim("insufficient", "Not enough data: 2 TikTok ads found, 5 needed.")]);
    const asset = await ownerA.query(api.assets.get, { workspaceId: workspaceA, assetId });
    expect(asset.evidence[0]).toMatchObject({ basis: "insufficient", basisLabel: "Not enough data" });
  });

  it("refuses a claim that cites one real source next to a made-up or foreign one", async () => {
    const { webA, webB, problems } = await seed();
    expect(await problems([claim("observed", "Two ads mention price.", [webA, webB])])).toEqual([
      { claimKey: "c1", code: "source_missing" },
    ]);
  });

  it("keeps the old rule for claims written without a basis", async () => {
    const { problems } = await seed();
    expect(await problems([{ claimKey: "c1", statement: "Twelve ads ran.", computed: true }])).toEqual([]);
    expect(await problems([{ claimKey: "c1", statement: "Twelve ads ran." }])).toEqual([
      { claimKey: "c1", code: "needs_evidence" },
    ]);
    expect(await problems([{ claimKey: "c1", statement: "Twelve ads ran.", sourceId: "none", fetchedAt: 1 }])).toEqual([
      { claimKey: "c1", code: "source_missing" },
    ]);
  });

  it("refuses on the server to approve a version whose cited source reference is gone", async () => {
    const { t, ownerA, workspaceA, assetId, webA, addVersion } = await seed();
    await addVersion([claim("observed", "Three competitors run video ads.", [webA])]);
    await t.run(async (ctx) => ctx.db.delete(webA));
    await expect(ownerA.mutation(api.assets.approve, { workspaceId: workspaceA, assetId })).rejects.toThrow(MISSING_SOURCE);
    const asset = await ownerA.query(api.assets.get, { workspaceId: workspaceA, assetId });
    expect(asset.status).toBe("draft");
    expect(asset.evidence[0].sources).toEqual([{ id: webA, missing: true }]);
  });
});
