/**
 * @vitest-environment edge-runtime
 *
 * Credits: every AI cost is charged at 3×, new work is blocked at zero once billing is on, work already
 * running is always charged, and each workspace sees only its own ledger.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { chargeUsage, priceFor } from "./lib/billing";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

async function setup() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const owner = t.withIdentity(identity("user_owner"));
  const projectId = await owner.mutation(api.research.createProject, {
    workspaceId,
    title: "London cleaning",
    objective: "Why are we losing move-out jobs?",
    market: "End-of-tenancy cleaning",
    geography: "London, UK",
    competitors: [{ name: "Housekeep" }],
    platforms: ["web"],
    suppliedUrls: [],
  });
  return { t, workspaceId, owner, projectId };
}

const start = (owner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">) =>
  owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "market-intelligence", projectId });

describe("credits billing", () => {
  afterEach(() => {
    delete process.env.AUTUMN_SECRET_KEY;
    delete process.env.BILLING_MARKUP;
  });

  it("prices real cost at 3× by default, rounding up", () => {
    expect(priceFor(82)).toBe(246);
    expect(priceFor(1)).toBe(3);
    expect(priceFor(0)).toBe(0);
    process.env.BILLING_MARKUP = "2";
    expect(priceFor(82, 2)).toBe(164);
  });

  it("never blocks work while billing is off", async () => {
    const { workspaceId, owner, projectId } = await setup();
    await expect(start(owner, workspaceId, projectId)).resolves.toBeTruthy();
  });

  it("blocks new work at zero once billing is on, and lets it start with credit", async () => {
    const { t, workspaceId, owner, projectId } = await setup();
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    await expect(start(owner, workspaceId, projectId)).rejects.toThrow(/credit balance is empty/);
    await expect(owner.mutation(api.followups.ask, { workspaceId, projectId, text: "Who is cheapest?" })).rejects.toThrow(/credit balance is empty/);
    await t.mutation(internal.billing.saveAccount, { workspaceId, balanceCents: 500 });
    await expect(start(owner, workspaceId, projectId)).resolves.toBeTruthy();
  });

  it("tells the browser it is out of credits, with a code the chat box can act on", async () => {
    const { workspaceId, owner } = await setup();
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    const problem = await owner.mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "Why are we losing move-out jobs?" }).catch((error: unknown) => error);
    // ConvexError data reaches the browser in production; a plain Error shows only "Server Error".
    expect((problem as { data?: unknown }).data).toEqual({
      code: "out_of_credits",
      message: "Your credit balance is empty. An owner can add credits in Billing to start new work.",
    });
  });

  it("charges work already running in full, even past zero, and records cost and price", async () => {
    const { t, workspaceId, owner } = await setup();
    await t.mutation(internal.billing.saveAccount, { workspaceId, balanceCents: 100 });
    await t.run(async (ctx) => {
      await chargeUsage(ctx, { workspaceId, costCents: 82, source: "run", ref: "run_1" });
      await chargeUsage(ctx, { workspaceId, costCents: 0, source: "file", ref: "file_1" });
    });
    const view = await owner.query(api.billing.overview, { workspaceId });
    expect(view.account?.balanceCents).toBe(100 - 246);
    expect(view.ledger).toHaveLength(1);
    expect(view.ledger[0]).toMatchObject({ source: "run", costCents: 82, priceCents: 246, synced: false });
    expect(view.spent30dCents).toBe(246);
  });

  it("keeps the ledger to the workspace and hides it from Reps", async () => {
    const { t, workspaceId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
      await chargeUsage(ctx, { workspaceId, costCents: 10, source: "followup", ref: "chat_1" });
    });
    const rep = await t.withIdentity(identity("user_rep")).query(api.billing.overview, { workspaceId });
    expect(rep.ledger).toHaveLength(0);
    expect(rep.canManage).toBe(false);
    await expect(t.withIdentity(identity("user_stranger")).query(api.billing.overview, { workspaceId })).rejects.toThrow();
  });
});
