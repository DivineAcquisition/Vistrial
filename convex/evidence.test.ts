/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { CLAIM_PROBLEM_TEXT, MISSING_SOURCE, screenClaims, shapeProblem } from "./lib/evidence";
import { saveSourceRef } from "./lib/sourceRefs";
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

const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;

/** A workspace with a research project, one web source, one customer-data source, and a draft asset. */
async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const projectId = await owner.mutation(api.research.createProject, {
    workspaceId,
    title: "Austin cleaners",
    objective: "What do competitors advertise?",
    market: "Deep cleaning",
    geography: "Austin",
    competitors: [],
    platforms: ["web"],
    suppliedUrls: [],
  });
  const ids = await t.run(async (ctx) => {
    const write = ctx as unknown as MutationCtx;
    const web = await saveSourceRef(write, {
      workspaceId,
      projectId,
      origin: "found",
      platform: "web",
      kind: "page",
      url: `https://${name.toLowerCase()}.example.com/offer`,
      title: "Offer page",
      observedAt: Date.now(),
      availability: "available",
    });
    const customer = await saveSourceRef(write, {
      workspaceId,
      projectId,
      origin: "supplied",
      platform: "customerData",
      kind: "dataset",
      url: `https://${name.toLowerCase()}.example.com/uploads/results.csv`,
      title: "Past campaign results",
      observedAt: Date.now(),
      availability: "linkOnly",
    });
    const assetId = await ctx.db.insert("assets", {
      workspaceId,
      kind: "marketReport",
      title: "Report",
      status: "draft",
      currentVersion: 1,
      createdAt: Date.now(),
    });
    await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 1, body: "v1", createdBy: "agent" });
    return { web: web.id, customer: customer.id, assetId };
  });
  return { owner, workspaceId, projectId, ...ids };
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

describe("evidence basis rules", () => {
  it("lists a market report under its own kind", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const page = { numItems: 10, cursor: null };
    const market = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, kind: "marketReport", paginationOpts: page });
    expect(market.page.map((row: { id: string }) => row.id)).toEqual([a.assetId]);
    const other = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, kind: "researchReport", paginationOpts: page });
    expect(other.page).toHaveLength(0);
  });

  it("observed: needs at least one source in the same workspace", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const add = (sourceRefIds: Id<"sourceRefs">[]) =>
      a.owner.mutation(api.assets.addVersion, {
        workspaceId: a.workspaceId,
        assetId: a.assetId,
        body: "v2",
        claims: [{ claimKey: "c", statement: "Three competitors offer a first-clean discount.", basis: "observed", sourceRefIds }],
      });
    expect(await message(add([]))).toBe(CLAIM_PROBLEM_TEXT.observed_needs_source);
    // A real source, but from another workspace, does not count.
    expect(await message(add([b.web]))).toBe("A claim needs evidence.");
    // One good source does not cover a bad one beside it.
    expect(await message(add([a.web, b.web]))).toBe("A claim needs evidence.");
    expect(await message(add([a.web]))).toBe("accepted");
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ basis: "observed", basisLabel: "Observed", sourceMissing: false });
    expect(asset.evidence[0].sources.map((row) => row.title)).toEqual(["Offer page"]);
  });

  it("inferred: needs a supporting source, and always reads as an inference", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const add = (sourceRefIds: Id<"sourceRefs">[]) =>
      a.owner.mutation(api.assets.addVersion, {
        workspaceId: a.workspaceId,
        assetId: a.assetId,
        body: "v2",
        // Worded as fact on purpose: the label comes from the basis, not the words.
        claims: [{ claimKey: "c", statement: "Busy parents are the main audience.", basis: "inferred", sourceRefIds }],
      });
    expect(await message(add([]))).toBe(CLAIM_PROBLEM_TEXT.inferred_needs_source);
    expect(await message(add([a.web]))).toBe("accepted");
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ basis: "inferred", basisLabel: "Inference", sourceMissing: false });
  });

  it("hypothesis: needs no source, always reads as untested, and cannot be marked computed", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const add = (computed?: boolean) =>
      a.owner.mutation(api.assets.addVersion, {
        workspaceId: a.workspaceId,
        assetId: a.assetId,
        body: "v2",
        claims: [{ claimKey: "c", statement: "A weekend offer would do better.", basis: "hypothesis", computed }],
      });
    expect(await message(add(true))).toBe(CLAIM_PROBLEM_TEXT.hypothesis_cannot_be_computed);
    expect(await message(add())).toBe("accepted");
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ basisLabel: "Untested hypothesis", sources: [], sourceMissing: false });
    // A hypothesis with no source can still be approved: it is labeled, not passed off as fact.
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: a.assetId });
  });

  it("firstParty: needs a customer-data source; a web page is not enough", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const add = (sourceRefIds: Id<"sourceRefs">[]) =>
      a.owner.mutation(api.assets.addVersion, {
        workspaceId: a.workspaceId,
        assetId: a.assetId,
        body: "v2",
        claims: [{ claimKey: "c", statement: "Your Meta ads cost $41 per lead last quarter.", basis: "firstParty", sourceRefIds }],
      });
    expect(await message(add([]))).toBe(CLAIM_PROBLEM_TEXT.first_party_needs_customer_data);
    expect(await message(add([a.web]))).toBe(CLAIM_PROBLEM_TEXT.first_party_needs_customer_data);
    expect(await message(add([a.customer]))).toBe("accepted");
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ basisLabel: "Your data", sourceMissing: false });
  });

  it("insufficient: is the \"Not enough data\" line and carries no claim or source", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const add = (statement: string, sourceRefIds?: Id<"sourceRefs">[], computed?: boolean) =>
      a.owner.mutation(api.assets.addVersion, {
        workspaceId: a.workspaceId,
        assetId: a.assetId,
        body: "v2",
        claims: [{ claimKey: "c", statement, basis: "insufficient", sourceRefIds, computed }],
      });
    expect(await message(add("Most TikTok ads use a discount."))).toBe(CLAIM_PROBLEM_TEXT.insufficient_carries_no_claim);
    expect(await message(add("Not enough data: 2 TikTok ads found, 5 needed.", [a.web]))).toBe(
      CLAIM_PROBLEM_TEXT.insufficient_carries_no_claim,
    );
    expect(await message(add("Not enough data: 2 TikTok ads found, 5 needed.", undefined, true))).toBe(
      CLAIM_PROBLEM_TEXT.insufficient_carries_no_claim,
    );
    expect(await message(add("Not enough data: 2 TikTok ads found, 5 needed."))).toBe("accepted");
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ basisLabel: "Not enough data", sources: [], sourceMissing: false });
  });

  it("a claim with a basis cites collected sources, not an older profile or run record", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    expect(
      await message(
        a.owner.mutation(api.assets.addVersion, {
          workspaceId: a.workspaceId,
          assetId: a.assetId,
          body: "v2",
          claims: [{ claimKey: "c", statement: "x", basis: "observed", sourceId: "anything", fetchedAt: 1, sourceRefIds: [a.web] }],
        }),
      ),
    ).toBe(CLAIM_PROBLEM_TEXT.basis_uses_source_refs);
    // Older claims keep their rule: a source and a time, or computed. Source references alone are not one.
    expect(shapeProblem({ claimKey: "c", statement: "x", sourceRefIds: [a.web] })).toBe("no_evidence");
    expect(shapeProblem({ claimKey: "c", statement: "x", computed: true })).toBeNull();
  });

  it("refuses approval once a cited source is gone, and the screen says so", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await a.owner.mutation(api.assets.addVersion, {
      workspaceId: a.workspaceId,
      assetId: a.assetId,
      body: "v2",
      claims: [{ claimKey: "c", statement: "Three competitors offer a discount.", basis: "observed", sourceRefIds: [a.web] }],
    });
    await t.run(async (ctx) => ctx.db.delete(a.web));
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.evidence[0]).toMatchObject({ sourceMissing: true, sources: [] });
    expect(await message(a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: a.assetId }))).toBe(MISSING_SOURCE);
  });

  it("lets the report writer drop a bad claim with its reason instead of failing the report", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const result = await t.run(async (ctx) =>
      screenClaims(ctx, a.workspaceId, [
        { claimKey: "ok", statement: "Seen.", basis: "observed", sourceRefIds: [a.web] },
        { claimKey: "made-up", statement: "Seen.", basis: "observed", sourceRefIds: ["none"] },
        { claimKey: "elsewhere", statement: "Seen.", basis: "inferred", sourceRefIds: [b.web] },
        { claimKey: "bare", statement: "Seen.", basis: "observed" },
        { claimKey: "idea", statement: "Try this.", basis: "hypothesis" },
      ]),
    );
    expect(result.kept.map((row) => row.claimKey)).toEqual(["ok", "idea"]);
    expect(result.dropped).toEqual([
      { claimKey: "made-up", problem: "source_not_found" },
      { claimKey: "elsewhere", problem: "source_not_found" },
      { claimKey: "bare", problem: "observed_needs_source" },
    ]);
  });
});
