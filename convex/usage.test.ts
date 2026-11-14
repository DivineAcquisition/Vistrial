/**
 * @vitest-environment edge-runtime
 *
 * The usage page's data: every charge says who and what it was for, folds into the per-day rollup, and is
 * shown to each role as docs/rebuild/usage-page.md section 4 says. Nothing returned holds a cost or markup.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { chargeUsage } from "./lib/billing";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
type Tester = ReturnType<typeof convexTest>;

async function setup(t: Tester) {
  const owner = t.withIdentity(person("nora"));
  const growth = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  const accountId = (await t.run((ctx) => ctx.db.get(growth)))!.accountId!;
  const coaching = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
  const join = async (subject: string, role: "admin" | "member" | "viewer") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId: growth, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  return { owner, growth, coaching, admin: await join("ada", "admin"), member: await join("milo", "member"), viewer: await join("vic", "viewer") };
}

const run = (t: Tester, workspaceId: Id<"workspaces">, startedBy: string, skillSlug = "market-intelligence") =>
  t.run((ctx) =>
    ctx.db.insert("agentRuns", { workspaceId, agentSlug: "growth-architect", skillSlug, status: "running", startedBy, inputRef: "x", startedAt: Date.now(), costCents: 0, inputTokens: 0, outputTokens: 0 }),
  );

describe("usage", () => {
  it("stamps each charge and folds a run's steps into one row per model and day", async () => {
    const t = convexTest(schema, modules);
    const { growth } = await setup(t);
    const runId = await run(t, growth, "milo");
    await t.run((ctx) => chargeUsage(ctx, { workspaceId: growth, costCents: 10, source: "run", ref: runId, model: "claude-opus-5-5" }));
    await t.run((ctx) => chargeUsage(ctx, { workspaceId: growth, costCents: 5, source: "run", ref: runId, model: "claude-opus-5-5" }));
    await t.run((ctx) => chargeUsage(ctx, { workspaceId: growth, costCents: 2, source: "run", ref: runId }));
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger[0]).toMatchObject({ startedBy: "milo", agentSlug: "growth-architect", skillSlug: "market-intelligence", model: "claude-opus-5-5", inUsage: true });
    // A tool call in a run has no model, even though the run records which model wrote.
    expect(ledger[2].model).toBeUndefined();
    const items = await t.run((ctx) => ctx.db.query("usageItems").collect());
    expect(items.map((row) => [row.model, row.priceCents, row.charges])).toEqual([
      ["claude-opus-5-5", 45, 2],
      ["", 6, 1],
    ]);
    expect(JSON.stringify(items)).not.toMatch(/costCents|markup/);
  });

  it("shows the Owner the account, the Admin the organization, the Member their own work, the Viewer a summary", async () => {
    const t = convexTest(schema, modules);
    const { owner, admin, member, viewer, growth, coaching } = await setup(t);
    const mine = await run(t, growth, "milo");
    const noras = await run(t, growth, "nora", "offer-intelligence");
    const elsewhere = await run(t, coaching, "nora");
    for (const [workspaceId, ref, cost] of [[growth, mine, 10], [growth, noras, 20], [coaching, elsewhere, 40]] as const) {
      await t.run((ctx) => chargeUsage(ctx, { workspaceId, costCents: cost, source: "run", ref, model: "claude-opus-5-5" }));
      // "Newest first" needs the charges at different times; two in the same millisecond have no order.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const read = (who: typeof owner) => who.query(api.usage.overview, { workspaceId: growth, period: "30d" });

    const asOwner = await read(owner);
    expect(asOwner.access).toBe("account");
    expect(asOwner.totals?.credits).toBe(210);
    expect(asOwner.by?.organization?.map((slice) => slice.label)).toEqual(["Northlight Coaching", "Northlight Growth"]);

    const asAdmin = await read(admin);
    expect(asAdmin.access).toBe("organization");
    expect(asAdmin.totals?.credits).toBe(90);
    expect(asAdmin.by?.organization).toBeUndefined();
    expect(asAdmin.by?.person?.map((slice) => slice.credits)).toEqual([60, 30]);

    const asMember = await read(member);
    expect(asMember.access).toBe("own");
    expect(asMember.totals?.credits).toBe(30);
    expect(asMember.by?.person).toBeUndefined();
    expect(asMember.balance.forecast).toBeNull();
    // Asking for someone else's work changes nothing for a Member.
    expect((await member.query(api.usage.overview, { workspaceId: growth, period: "30d", person: "nora" })).totals?.credits).toBe(30);

    const asViewer = await read(viewer);
    expect(asViewer.access).toBe("summary");
    expect(asViewer.by).toBeNull();
    expect((await viewer.query(api.usage.items, { workspaceId: growth, period: "30d" })).items).toEqual([]);

    const list = await owner.query(api.usage.items, { workspaceId: growth, period: "30d", skillSlug: "market-intelligence" });
    expect(list.items.map((item) => [item.credits, item.href])).toEqual([
      [120, null],
      [30, `/app/runs/${mine}`],
    ]);
    for (const result of [asOwner, asAdmin, asMember, asViewer, list]) expect(JSON.stringify(result)).not.toMatch(/costCents|markup/);
  });

  it("backfills older ledger rows from what they point at, once", async () => {
    const t = convexTest(schema, modules);
    const { growth } = await setup(t);
    const runId = await run(t, growth, "milo");
    await t.run((ctx) => ctx.db.insert("billingLedger", { workspaceId: growth, source: "run", ref: runId, costCents: 10, priceCents: 30, markup: 3, at: Date.now() }));
    await t.mutation(internal.usage.backfill, {});
    await t.finishAllScheduledFunctions(() => {});
    await t.mutation(internal.usage.backfill, {});
    await t.finishAllScheduledFunctions(() => {});
    const items = await t.run((ctx) => ctx.db.query("usageItems").collect());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ priceCents: 30, startedBy: "milo", skillSlug: "market-intelligence", backfilled: true });
  });
});
