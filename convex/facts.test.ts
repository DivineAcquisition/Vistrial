/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NEEDS_REVIEW } from "./assets";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { FACT_TEXT, factsForRun, writeAgentFact } from "./lib/facts";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const page = { numItems: 20, cursor: null };

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

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const invite = async (role: "manager" | "rep") => {
    const row = await owner.mutation(api.workspace.invite, { workspaceId, email: `${name}-${role}@example.com`, role });
    const caller = t.withIdentity(person(`${name}-${role}`));
    await caller.mutation(api.workspace.acceptInvite, { token: row.token });
    return caller;
  };
  const manager = await invite("manager");
  const rep = await invite("rep");
  const assetId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("assets", { workspaceId, kind: "marketReport", title: "Report", status: "draft", currentVersion: 1, createdAt: Date.now() });
    await ctx.db.insert("assetVersions", { workspaceId, assetId: id, version: 1, body: "v1", createdBy: "agent" });
    return id;
  });
  return { owner, manager, rep, workspaceId, assetId };
}

describe("business facts (2.18)", () => {
  it("a person's fact is verified; replacing it keeps the old row as superseded", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const first = await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "monthlyAdBudget", value: "$2,000" });
    const second = await a.manager.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "monthlyAdBudget", value: " $3,000  a month " });
    const current = await a.rep.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "monthlyAdBudget" });
    expect(current).toMatchObject({ id: second, value: "$3,000 a month", status: "verified", sourceType: "owner", supersedesFactId: first });
    const history = await a.rep.query(api.facts.history, { workspaceId: a.workspaceId, factKey: "monthlyAdBudget" });
    expect(history.map((row: { id: string; status: string; value: string }) => [row.id, row.status, row.value])).toEqual([
      [second, "verified", "$3,000 a month"],
      [first, "superseded", "$2,000"],
    ]);
    const live = await a.rep.query(api.facts.list, { workspaceId: a.workspaceId });
    expect(live.map((row: { id: string }) => row.id)).toEqual([second]);
  });

  it("only an Owner or Manager records, verifies, disputes or removes a fact", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    expect(await message(a.rep.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "salesCycle", value: "2 weeks" }))).toBe(NOT_ALLOWED);
    const id = await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "salesCycle", value: "2 weeks" });
    expect(await message(a.rep.mutation(api.facts.setStatus, { workspaceId: a.workspaceId, factId: id, status: "disputed" }))).toBe(NOT_ALLOWED);
    expect(await message(a.rep.mutation(api.facts.remove, { workspaceId: a.workspaceId, factId: id }))).toBe(NOT_ALLOWED);
    await a.manager.mutation(api.facts.setStatus, { workspaceId: a.workspaceId, factId: id, status: "disputed" });
    const disputed = await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "salesCycle" });
    // Verification history stays when a fact is later disputed.
    expect(disputed).toMatchObject({ status: "disputed" });
    expect(disputed?.verifiedAt).not.toBeNull();
  });

  it("checks keys, values and source references", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const record = (factKey: string, value: string) => message(a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey, value }));
    expect(await record("Monthly budget", "x")).toBe(FACT_TEXT.badKey);
    expect(await record("budget", "   ")).toBe(FACT_TEXT.emptyValue);
    expect(await record("budget", "x".repeat(501))).toBe(FACT_TEXT.longValue);
    const agentWithoutReference = t.run((ctx) => writeAgentFact(ctx, { workspaceId: a.workspaceId, factKey: "budget", value: "x", sourceType: "agent" }));
    expect(await message(agentWithoutReference)).toBe(FACT_TEXT.needsReference);
    expect(await message(t.run((ctx) => writeAgentFact(ctx, { workspaceId: a.workspaceId, factKey: "budget", value: "not given", sourceType: "assumption" })))).toBe("accepted");
  });

  it("an agent's fact is unverified, never replaces a verified one, and a person can verify it", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const agent = await t.run((ctx) => writeAgentFact(ctx, { workspaceId: a.workspaceId, factKey: "topObjection", value: "Price", sourceType: "agent", sourceReference: "run:1" }));
    expect(agent.written).toBe(true);
    expect(await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "topObjection" })).toMatchObject({ status: "unverified", sourceType: "agent" });
    await a.owner.mutation(api.facts.setStatus, { workspaceId: a.workspaceId, factId: agent.id, status: "verified" });
    const again = await t.run((ctx) => writeAgentFact(ctx, { workspaceId: a.workspaceId, factKey: "topObjection", value: "Trust", sourceType: "agent", sourceReference: "run:2" }));
    expect(again).toEqual({ id: agent.id, written: false });
    expect(await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "topObjection" })).toMatchObject({ value: "Price", status: "verified" });
  });

  it("a removed or replaced fact is never current, and a run sees only live facts with their status", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const old = await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "contractValue", value: "$400" });
    await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "contractValue", value: "$450" });
    const gone = await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "adBudget", value: "$1,000" });
    await a.owner.mutation(api.facts.remove, { workspaceId: a.workspaceId, factId: gone });
    expect(await message(a.owner.mutation(api.facts.setStatus, { workspaceId: a.workspaceId, factId: old, status: "verified" }))).toBe(FACT_TEXT.notLive);
    expect(await message(a.owner.mutation(api.facts.remove, { workspaceId: a.workspaceId, factId: gone }))).toBe(FACT_TEXT.notLive);
    expect(await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "adBudget" })).toBeNull();
    const history = await a.owner.query(api.facts.history, { workspaceId: a.workspaceId, factKey: "adBudget" });
    expect(history[0]).toMatchObject({ removed: true });
    const forRun = await t.run((ctx) => factsForRun(ctx, a.workspaceId));
    expect(forRun.map((row) => [row.factKey, row.value])).toEqual([["contractValue", "$450"]]);
  });

  it("another workspace reaches none of these facts", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const id = await a.owner.mutation(api.facts.record, { workspaceId: a.workspaceId, factKey: "adBudget", value: "$1,000" });
    expect(await message(b.owner.mutation(api.facts.setStatus, { workspaceId: b.workspaceId, factId: id, status: "disputed" }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.facts.remove, { workspaceId: b.workspaceId, factId: id }))).toBe(NOT_FOUND);
    expect(await b.owner.query(api.facts.list, { workspaceId: b.workspaceId })).toEqual([]);
    expect(await b.owner.query(api.facts.get, { workspaceId: b.workspaceId, factKey: "adBudget" })).toBeNull();
    expect(await b.owner.query(api.facts.history, { workspaceId: b.workspaceId, factKey: "adBudget" })).toEqual([]);
    expect(await message(b.owner.query(api.facts.list, { workspaceId: a.workspaceId }))).toBe(NOT_FOUND);
    expect(await t.run((ctx) => factsForRun(ctx, b.workspaceId))).toEqual([]);
  });
});

describe("feedback (2.20)", () => {
  it("reject needs a reason, takes the asset out of the queue, and saves the reason as feedback", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    expect(await message(a.rep.mutation(api.assets.reject, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "Too generic" }))).toBe(NOT_ALLOWED);
    expect(await message(a.owner.mutation(api.assets.reject, { workspaceId: a.workspaceId, assetId: a.assetId, reason: " x " }))).toContain("Say why");
    await a.manager.mutation(api.assets.reject, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "Do not lead with price." });
    const waiting = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, status: "draft", paginationOpts: page });
    expect(waiting.page).toHaveLength(0);
    const rejected = await a.owner.query(api.assets.list, { workspaceId: a.workspaceId, status: "rejected", paginationOpts: page });
    expect(rejected.page.map((row: { id: string }) => row.id)).toEqual([a.assetId]);
    const rows = await a.rep.query(api.feedback.list, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(rows).toMatchObject([{ kind: "rejection", reason: "Do not lead with price.", promotedFactId: null }]);
    expect(await message(a.owner.mutation(api.assets.reject, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "Again" }))).toContain("not waiting");
  });

  it("a revision request keeps the asset waiting", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await a.owner.mutation(api.assets.requestRevision, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "Name the Austin competitors." });
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(asset.status).toBe("draft");
    expect(await a.owner.query(api.feedback.list, { workspaceId: a.workspaceId })).toMatchObject([{ kind: "revisionRequest" }]);
  });

  it("a person promotes feedback into a verified fact, once", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const feedbackId = await a.owner.mutation(api.assets.reject, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "Do not lead with price." });
    expect(await message(a.rep.mutation(api.feedback.promote, { workspaceId: a.workspaceId, feedbackId, factKey: "messagingRule", value: "Do not lead with price" }))).toBe(NOT_ALLOWED);
    const factId = await a.manager.mutation(api.feedback.promote, { workspaceId: a.workspaceId, feedbackId, factKey: "messagingRule", value: "Do not lead with price" });
    expect(await a.owner.query(api.facts.get, { workspaceId: a.workspaceId, factKey: "messagingRule" })).toMatchObject({
      id: factId,
      status: "verified",
      sourceType: "feedback",
      sourceReference: feedbackId,
    });
    expect(await message(a.owner.mutation(api.feedback.promote, { workspaceId: a.workspaceId, feedbackId, factKey: "messagingRule", value: "again" }))).toContain("already");
  });

  it("another workspace cannot read, reject or promote", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    const feedbackId = await a.owner.mutation(api.assets.requestRevision, { workspaceId: a.workspaceId, assetId: a.assetId, reason: "More detail" });
    expect(await message(b.owner.mutation(api.assets.reject, { workspaceId: b.workspaceId, assetId: a.assetId, reason: "No" }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.assets.requestRevision, { workspaceId: b.workspaceId, assetId: a.assetId, reason: "No" }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.feedback.promote, { workspaceId: b.workspaceId, feedbackId, factKey: "rule", value: "x" }))).toBe(NOT_FOUND);
    expect(await b.owner.query(api.feedback.list, { workspaceId: b.workspaceId })).toEqual([]);
    expect(await b.owner.query(api.feedback.list, { workspaceId: b.workspaceId, assetId: a.assetId })).toEqual([]);
  });

  it("a draft that failed its checks cannot be approved until a person adds a version", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await t.run((ctx) => ctx.db.patch(a.assetId as Id<"assets">, { status: "needsReview" }));
    expect(await message(a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: a.assetId }))).toBe(NEEDS_REVIEW);
    await a.owner.mutation(api.assets.addVersion, { workspaceId: a.workspaceId, assetId: a.assetId, body: "v2", claims: [] });
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect((await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: a.assetId })).status).toBe("approved");
  });
});
