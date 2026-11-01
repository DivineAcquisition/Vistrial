/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MISSING_SOURCE, claimsWithoutEvidence, type ClaimInput } from "./lib/evidence";
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

/** A workspace with a confirmed profile (first-party) and a saved run record (not first-party). */
async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("owner"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  await owner.mutation(api.profile.saveDraft, {
    workspaceId,
    offer: "Deep cleaning",
    priceNotes: "",
    audience: "Homeowners",
    geography: "Austin",
    channels: "",
    brandVoice: "",
    competitors: [],
  });
  await owner.mutation(api.profile.confirm, { workspaceId });
  const ids = await t.run(async (ctx) => {
    const profile = (await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId))
      .first())!;
    const runId = await ctx.db.insert("agentRuns", {
      workspaceId,
      agentSlug: "growth-architect",
      skillSlug: "test-research",
      status: "completed",
      startedBy: "owner",
      inputRef: "x",
      startedAt: 0,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId,
      runId,
      index: 0,
      idempotencyKey: "k",
      kind: "model",
      status: "completed",
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      resultCode: "ok",
    });
    const artifact = await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId, kind: "sources", byteSize: 2, body: "{}" });
    const asset = await ctx.db.insert("assets", {
      workspaceId,
      kind: "researchReport",
      title: "Report",
      status: "draft",
      currentVersion: 0,
      createdAt: 0,
    });
    return { profile: profile._id as string, artifact: artifact as string, asset };
  });
  const other = t.withIdentity(person("other"));
  const otherWorkspace = await other.mutation(api.workspace.create, { name: "Beta" });
  const otherArtifact = await t.run(async (ctx) => {
    const runId = await ctx.db.insert("agentRuns", {
      workspaceId: otherWorkspace,
      agentSlug: "growth-architect",
      skillSlug: "x",
      status: "completed",
      startedBy: "other",
      inputRef: "x",
      startedAt: 0,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    const stepId = await ctx.db.insert("runSteps", {
      workspaceId: otherWorkspace,
      runId,
      index: 0,
      idempotencyKey: "k",
      kind: "model",
      status: "completed",
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      resultCode: "ok",
    });
    return (await ctx.db.insert("runArtifacts", { workspaceId: otherWorkspace, runId, stepId, kind: "sources", byteSize: 2, body: "{}" })) as string;
  });
  const write = (claims: ClaimInput[]) =>
    owner.mutation(api.assets.addVersion, { workspaceId, assetId: ids.asset as Id<"assets">, body: "b", claims });
  const read = () => owner.query(api.assets.get, { workspaceId, assetId: ids.asset as Id<"assets"> });
  return { t, owner, workspaceId, ...ids, otherArtifact, write, read };
}

const claim = (basis: ClaimInput["basis"], extra: Partial<ClaimInput> = {}): ClaimInput => ({
  claimKey: `${basis}-claim`,
  statement: "A statement.",
  basis,
  ...extra,
});

describe("evidence basis rules", () => {
  it("observed: needs a real source in this workspace", async () => {
    const s = await setup();
    await expect(s.write([claim("observed")])).rejects.toThrow("evidence");
    await expect(s.write([claim("observed", { sourceIds: ["none"] })])).rejects.toThrow("evidence");
    await expect(s.write([claim("observed", { sourceIds: [s.otherArtifact] })])).rejects.toThrow("evidence");
    await s.write([claim("observed", { sourceIds: [s.artifact], fetchedAt: 1 })]);
    const [row] = (await s.read()).evidence;
    expect(row).toMatchObject({ basis: "observed", sourceLabels: ["Saved run record"], missing: false });
  });

  it("inferred: needs at least one supporting source, every one real", async () => {
    const s = await setup();
    await expect(s.write([claim("inferred")])).rejects.toThrow("evidence");
    await expect(s.write([claim("inferred", { sourceIds: [s.artifact, s.otherArtifact] })])).rejects.toThrow("evidence");
    await s.write([claim("inferred", { sourceIds: [s.artifact, s.profile] })]);
    const [row] = (await s.read()).evidence;
    expect(row).toMatchObject({ basis: "inferred", sourceLabels: ["Saved run record", "Business profile, version 1"] });
  });

  it("hypothesis: needs no source, cannot pose as a computed figure, and can be approved", async () => {
    const s = await setup();
    await expect(s.write([claim("hypothesis", { computed: true })])).rejects.toThrow("evidence");
    await s.write([claim("hypothesis")]);
    const asset = await s.read();
    expect(asset.evidence[0]).toMatchObject({ basis: "hypothesis", sourceLabels: [], missing: false });
    await s.owner.mutation(api.assets.approve, { workspaceId: s.workspaceId, assetId: asset.id });
  });

  it("firstParty: every source must be the business's own record", async () => {
    const s = await setup();
    await expect(s.write([claim("firstParty")])).rejects.toThrow("evidence");
    // A saved run record is the agent's own output, not the business's data.
    await expect(s.write([claim("firstParty", { sourceIds: [s.artifact] })])).rejects.toThrow("evidence");
    await expect(s.write([claim("firstParty", { sourceIds: [s.profile, s.artifact] })])).rejects.toThrow("evidence");
    await s.write([claim("firstParty", { sourceIds: [s.profile] })]);
    expect((await s.read()).evidence[0]).toMatchObject({ basis: "firstParty", sourceLabels: ["Business profile, version 1"] });
  });

  it("insufficient: the Not enough data line cites nothing and computes nothing", async () => {
    const s = await setup();
    await expect(s.write([claim("insufficient", { sourceIds: [s.artifact] })])).rejects.toThrow("evidence");
    await expect(s.write([claim("insufficient", { computed: true })])).rejects.toThrow("evidence");
    await s.write([claim("insufficient")]);
    const asset = await s.read();
    expect(asset.evidence[0]).toMatchObject({ basis: "insufficient", sourceLabels: [], missing: false });
    await s.owner.mutation(api.assets.approve, { workspaceId: s.workspaceId, assetId: asset.id });
  });

  it("keeps the rule for claims written before bases existed", () => {
    expect(claimsWithoutEvidence([{ claimKey: "a", statement: "s", sourceId: "x", fetchedAt: 1 }])).toEqual([]);
    expect(claimsWithoutEvidence([{ claimKey: "b", statement: "s", computed: true }])).toEqual([]);
    expect(claimsWithoutEvidence([{ claimKey: "c", statement: "s", sourceId: "x" }])).toEqual(["c"]);
    expect(claimsWithoutEvidence([{ claimKey: "d", statement: "s" }])).toEqual(["d"]);
  });

  it("refuses approval and marks the claim when a first-party source is deleted later", async () => {
    const s = await setup();
    await s.write([claim("firstParty", { sourceIds: [s.profile] }), claim("hypothesis")]);
    await s.t.run(async (ctx) => ctx.db.delete(s.profile as Id<"profileVersions">));
    const asset = await s.read();
    expect(asset.evidence.map((row) => [row.basis, row.missing])).toEqual([
      ["firstParty", true],
      ["hypothesis", false],
    ]);
    await expect(s.owner.mutation(api.assets.approve, { workspaceId: s.workspaceId, assetId: asset.id })).rejects.toThrow(MISSING_SOURCE);
  });
});
