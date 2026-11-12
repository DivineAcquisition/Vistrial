/**
 * @vitest-environment edge-runtime
 *
 * One account, one credit balance: every organization of the account reads and spends the same balance,
 * another account's is never touched, and an organization after the first is added only by an Owner who
 * agreed to its price, once it is paid for.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { EXTRA_ORG, assertCanSpend, chargeUsage, extraOrgsOpen, extraUnitsFrom } from "./lib/billing";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
type Tester = ReturnType<typeof convexTest>;

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

const ENV = ["AUTUMN_SECRET_KEY", "AUTUMN_TEST_SECRET_KEY", "AUTUMN_MODE", "BILLING_EXTRA_ORGS"];
const liveBilling = () => {
  process.env.AUTUMN_SECRET_KEY = "am_sk_live_x";
};

/** Northlight: an agency owner with two organizations on one account. Beacon: someone else's account. */
async function accounts(t: Tester) {
  const owner = t.withIdentity(person("nora"));
  const growth = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  const accountId = (await t.run((ctx) => ctx.db.get(growth)))!.accountId!;
  const coaching = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
  const other = t.withIdentity(person("ben"));
  const beacon = await other.mutation(api.workspace.create, { name: "Beacon Coaching" });
  const join = async (subject: string, workspaceId: Id<"workspaces">, role: "admin" | "member") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  return { owner, other, growth, coaching, beacon, accountId, join };
}

const charge = (t: Tester, workspaceId: Id<"workspaces">, costCents: number, ref: string) => t.run((ctx) => chargeUsage(ctx, { workspaceId, costCents, source: "run", ref }));

afterEach(() => {
  for (const name of ENV) delete process.env[name];
});

describe("one balance for the account", () => {
  it("is read and spent by every organization, and by nobody else", async () => {
    const t = convexTest(schema, modules);
    const { owner, other, growth, coaching, beacon } = await accounts(t);
    liveBilling();
    // Autumn reported $150 for Northlight, through whichever organization asked.
    await t.mutation(internal.billing.saveAccount, { workspaceId: coaching, balanceCents: 15_000, planId: "growth", planStatus: "active" });
    await t.mutation(internal.billing.saveAccount, { workspaceId: beacon, balanceCents: 4_000, planId: "growth", planStatus: "active" });
    expect((await owner.query(api.billing.status, { workspaceId: growth })).balanceCents).toBe(15_000);
    expect((await owner.query(api.billing.status, { workspaceId: coaching })).balanceCents).toBe(15_000);
    expect(await t.run(async (ctx) => (await ctx.db.query("billingAccounts").collect()).length)).toBe(2);

    // Work in either organization lowers the one balance, at 3× real cost. Beacon's is untouched.
    await charge(t, growth, 100, "run-a");
    await charge(t, coaching, 200, "run-b");
    expect((await owner.query(api.billing.status, { workspaceId: growth })).balanceCents).toBe(15_000 - 900);
    expect((await owner.query(api.billing.status, { workspaceId: coaching })).balanceCents).toBe(15_000 - 900);
    expect((await other.query(api.billing.status, { workspaceId: beacon })).balanceCents).toBe(4_000);

    // The ledger still says which organization spent.
    const ledger = await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).map((row) => [row.workspaceId, row.priceCents]));
    expect(ledger).toEqual([[growth, 300], [coaching, 600]]);

    // Empty for one is empty for both; the other account still works.
    await charge(t, coaching, 5_000, "run-c");
    for (const workspaceId of [growth, coaching]) await expect(t.run((ctx) => assertCanSpend(ctx, workspaceId))).rejects.toThrow(/credit balance is empty/);
    await t.run((ctx) => assertCanSpend(ctx, beacon));
    // A fresh number from Autumn keeps charges it has not been sent yet off the balance, from every organization.
    await t.mutation(internal.billing.saveAccount, { workspaceId: growth, balanceCents: 20_000, planId: "growth", planStatus: "active" });
    expect((await owner.query(api.billing.status, { workspaceId: coaching })).balanceCents).toBe(20_000 - 300 - 600 - 15_000);
  });

  it("bills an account made from an existing workspace under that workspace's id, with its balance as it was", async () => {
    const t = convexTest(schema, modules);
    // A paying workspace as stored before accounts existed.
    const workspaceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("workspaces", { name: "Northlight Growth", slug: "nl", timezone: "UTC", status: "active", createdAt: 1 });
      await ctx.db.insert("members", { workspaceId: id, userId: "nora", role: "owner", displayName: "Nora", email: "nora@example.com", active: true });
      await ctx.db.insert("workspaceSettings", { workspaceId: id, setupDone: true, themeDefault: "light" });
      await ctx.db.insert("billingAccounts", { workspaceId: id, balanceCents: 7_300, planId: "growth", planStatus: "active", refreshedAt: 1 });
      return id;
    });
    liveBilling();
    const owner = t.withIdentity(person("nora"));
    const before = await t.query(internal.billing.customerInfo, { workspaceId });
    expect(before).toEqual({ customerId: workspaceId, name: "Northlight Growth", email: "nora@example.com" });
    expect((await owner.query(api.billing.status, { workspaceId })).balanceCents).toBe(7_300);

    await t.mutation(internal.organizationsMigration.backfill, {});
    // Same customer in Autumn, same balance, nothing moved.
    expect(await t.query(internal.billing.customerInfo, { workspaceId })).toEqual(before);
    expect((await owner.query(api.billing.status, { workspaceId })).balanceCents).toBe(7_300);
    const overview = await owner.query(api.billing.overview, { workspaceId });
    expect(overview).toMatchObject({ accountName: "Northlight Growth", canManage: true, account: { balanceCents: 7_300, planId: "growth" } });
    expect(overview.organizations).toEqual([expect.objectContaining({ name: "Northlight Growth", current: true, first: true })]);
    // The next read from Autumn stamps the row with its account; there is still one row.
    await t.mutation(internal.billing.saveAccount, { workspaceId, balanceCents: 7_000, planId: "growth", planStatus: "active" });
    const rows = await t.run((ctx) => ctx.db.query("billingAccounts").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspaceId, balanceCents: 7_000 });
    expect(rows[0].accountId).toBeDefined();
  });

  it("shows an Owner what each organization used, and everyone else only their own", async () => {
    const t = convexTest(schema, modules);
    const { owner, growth, coaching, join } = await accounts(t);
    const admin = await join("ada", coaching, "admin");
    const member = await join("milo", coaching, "member");
    await t.mutation(internal.billing.saveAccount, { workspaceId: growth, balanceCents: 20_000, planId: "growth", planStatus: "active", extraOrganizations: 1 });
    await charge(t, growth, 100, "run-a");
    await charge(t, coaching, 250, "run-b");

    const asOwner = await owner.query(api.billing.overview, { workspaceId: growth });
    expect(asOwner.organizations).toEqual([
      { workspaceId: growth, name: "Northlight Growth", current: true, first: true, spent30dCents: 300 },
      { workspaceId: coaching, name: "Northlight Coaching", current: false, first: false, spent30dCents: 750 },
    ]);
    // $179 + $99 a month, with $150 + $50 of credits.
    expect(asOwner.extra).toMatchObject({ priceCents: 9_900, includedCents: 5_000, count: 1, paid: 1, monthlyCents: 27_800, monthlyCreditsCents: 20_000 });
    expect(asOwner.spent30dCents).toBe(300);

    const asAdmin = await admin.query(api.billing.overview, { workspaceId: coaching });
    expect(asAdmin.canManage).toBe(false);
    expect(asAdmin.organizations).toEqual([{ workspaceId: coaching, name: "Northlight Coaching", current: true, first: false, spent30dCents: 750 }]);
    expect(asAdmin.ledger.map((row) => row.priceCents)).toEqual([750]);
    expect(asAdmin.account?.balanceCents).toBe(20_000 - 1_050);

    const asMember = await member.query(api.billing.overview, { workspaceId: coaching });
    expect(asMember.ledger).toEqual([]);
    expect(asMember.organizations).toEqual([expect.objectContaining({ name: "Northlight Coaching", spent30dCents: null })]);
    expect(asMember.account?.balanceCents).toBe(20_000 - 1_050);
    expect(asMember.extra.pendingName).toBeNull();
  });

  it("marks a charge with the client the work was for", async () => {
    const t = convexTest(schema, modules);
    const { owner, growth } = await accounts(t);
    const clientId = await owner.mutation(api.clients.create, { workspaceId: growth, type: "business", name: "Aster Coaching" });
    const runId = await t.run((ctx) => ctx.db.insert("agentRuns", { workspaceId: growth, clientId, agentSlug: "growth-architect", skillSlug: "market-intelligence", status: "completed", startedBy: "nora", inputRef: "x", startedAt: 1, costCents: 0, inputTokens: 0, outputTokens: 0 }));
    await charge(t, growth, 40, runId);
    await charge(t, growth, 40, "a-planning-chat");
    expect(await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).map((row) => row.clientId ?? null))).toEqual([clientId, null]);
  });
});

describe("adding an organization", () => {
  it("costs nothing and happens at once where billing is off, for an Owner who confirmed the price", async () => {
    const t = convexTest(schema, modules);
    const { owner, growth, join } = await accounts(t);
    const admin = await join("ada", growth, "admin");
    expect(await message(admin.action(api.billingActions.addOrganization, { workspaceId: growth, name: "Hers", confirmedCents: EXTRA_ORG.priceCents }))).toContain("Only an Owner");
    expect(await message(owner.action(api.billingActions.addOrganization, { workspaceId: growth, name: "The Retainer Playbook", confirmedCents: 4_900 }))).toContain("price changed");
    expect(await message(owner.action(api.billingActions.addOrganization, { workspaceId: growth, name: "northlight coaching", confirmedCents: EXTRA_ORG.priceCents }))).toContain("already have");
    const result = await owner.action(api.billingActions.addOrganization, { workspaceId: growth, name: "The Retainer Playbook", confirmedCents: EXTRA_ORG.priceCents });
    expect(result.url).toBeNull();
    expect((await owner.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth", "Northlight Coaching", "The Retainer Playbook"]);
    expect((await owner.query(api.workspace.shell, { workspaceId: result.workspaceId! })).role).toBe("owner");
  });

  it("is never free where billing is on: closed until switched on, and created only when paid for", async () => {
    const t = convexTest(schema, modules);
    const { owner, growth, accountId } = await accounts(t);
    liveBilling();
    // Real money, not switched on: closed, with the reason, and the price still shown.
    expect(extraOrgsOpen()).toBe(false);
    const closed = (await owner.query(api.organizations.mine, {})).accounts[0];
    expect(closed).toMatchObject({ canAdd: false, addPrice: { priceCents: 9_900, includedCents: 5_000 } });
    expect(closed.addClosedReason).toContain("not switched on");
    expect(await message(owner.mutation(api.organizations.create, { accountId, name: "Free" }))).toContain("not switched on");
    expect(await message(owner.action(api.billingActions.addOrganization, { workspaceId: growth, name: "Free", confirmedCents: 9_900 }))).toContain("not switched on");

    // Switched on: the free path stays shut, and the paid one needs the plan.
    process.env.BILLING_EXTRA_ORGS = "on";
    expect((await owner.query(api.organizations.mine, {})).accounts[0]).toMatchObject({ canAdd: true, addClosedReason: null });
    expect(await message(owner.mutation(api.organizations.create, { accountId, name: "Free" }))).toContain("from Billing");
    expect(await message(owner.action(api.billingActions.addOrganization, { workspaceId: growth, name: "Third", confirmedCents: 9_900 }))).toContain("Start the Growth plan");
    expect((await owner.query(api.organizations.mine, {})).organizations).toHaveLength(2);

    // The Owner confirmed and went to pay: the name is held, and nothing exists yet.
    await t.mutation(internal.billing.holdOrganization, { accountId, userId: "nora", name: "The Retainer Playbook" });
    expect((await owner.query(api.billing.overview, { workspaceId: growth })).extra.pendingName).toBe("The Retainer Playbook");
    // Autumn still shows one paid extra organization (the second): not enough, so nothing is created.
    expect(await t.mutation(internal.billing.saveAccount, { workspaceId: growth, balanceCents: 20_000, planId: "growth", planStatus: "active", extraOrganizations: 1 })).toEqual({ created: null });
    expect((await owner.query(api.organizations.mine, {})).organizations).toHaveLength(2);
    // The payment landed: two paid, two exist beyond the first once this one is made.
    const paid = await t.mutation(internal.billing.saveAccount, { workspaceId: growth, balanceCents: 25_000, planId: "growth", planStatus: "active", extraOrganizations: 2 });
    expect(paid.created).not.toBeNull();
    expect((await owner.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth", "Northlight Coaching", "The Retainer Playbook"]);
    // Reading again does not make it twice, and the new organization spends the same balance.
    expect(await t.mutation(internal.billing.saveAccount, { workspaceId: growth, balanceCents: 25_000, planId: "growth", planStatus: "active", extraOrganizations: 2 })).toEqual({ created: null });
    expect((await owner.query(api.organizations.mine, {})).organizations).toHaveLength(3);
    expect((await owner.query(api.billing.status, { workspaceId: paid.created! })).balanceCents).toBe(25_000);
    expect((await owner.query(api.billing.overview, { workspaceId: growth })).extra).toMatchObject({ count: 2, paid: 2, pendingName: null, monthlyCents: 17_900 + 2 * 9_900, monthlyCreditsCents: 15_000 + 2 * 5_000 });
  });

  it("is open by default only in Stripe test mode, and the switch wins either way", () => {
    expect(extraOrgsOpen()).toBe(false);
    process.env.AUTUMN_MODE = "test";
    expect(extraOrgsOpen()).toBe(true);
    process.env.BILLING_EXTRA_ORGS = "off";
    expect(extraOrgsOpen()).toBe(false);
    delete process.env.AUTUMN_MODE;
    process.env.BILLING_EXTRA_ORGS = "on";
    expect(extraOrgsOpen()).toBe(true);
  });

  it("reads how many are paid for from the add-on's subscription", () => {
    expect(extraUnitsFrom(undefined)).toBe(0);
    expect(extraUnitsFrom([{ planId: "growth", status: "active", quantity: 1 }])).toBe(0);
    expect(extraUnitsFrom([{ planId: "extra_org", status: "active", quantity: 5_000 }])).toBe(1);
    expect(extraUnitsFrom([{ planId: "extra_org", status: "active", quantity: 15_000 }])).toBe(3);
    expect(extraUnitsFrom([{ planId: "extra_org", status: "active", quantity: 2 }])).toBe(2);
    expect(extraUnitsFrom([{ planId: "extra_org", status: "canceled", quantity: 5_000 }])).toBe(0);
  });
});
