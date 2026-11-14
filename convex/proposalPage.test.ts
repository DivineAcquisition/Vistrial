/**
 * @vitest-environment edge-runtime
 *
 * The lead's proposal page (Dealmaker, Proposal Architect): sharing only once a person approved it, the email to
 * the lead as a Comms draft of the price kind, the page showing only what the lead should read, opens counted,
 * "Accept" proposing won for the Owner, the follow-up when it is not opened, and Stripe "Not set up yet".
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ProposalView } from "./lib/dealmaker/proposalView";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const DAY = 86_400_000;
const SECRET = "page-secret";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function setup(options: { contact?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const ids = await t.run(async (ctx) => {
    const item = (title: string, kind: "package" | "price" | "proof") => ctx.db.insert("playbookItems", { workspaceId, folder: "offer", kind, title, body: "", source: { type: "person" }, basis: "firstParty", status: "active", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    const pkg = await item("Growth Sprint", "package");
    const price = await item("Growth Sprint: $4,500 a month", "price");
    const view: ProposalView = {
      title: "Growth Sprint for Jordan & Co.",
      intro: "Thanks for the call, Jordan.",
      needs: [{ need: "More booked calls every month", quote: "We need more booked calls every month", kind: "Buyer's words" }],
      package: { itemId: pkg, title: "Growth Sprint", body: "Twelve weeks." },
      deliverables: ["Weekly strategy call"],
      price: { itemId: price, title: "Growth Sprint: $4,500 a month", body: "Three-month minimum." },
      proof: [],
      nextSteps: ["Talk it over with your partner"],
      closing: "Speak soon.",
      checksPassed: true,
      missing: ["For the team only"],
    };
    const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Proposal", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    const reviewProject = await ctx.db.insert("researchProjects", { workspaceId, title: "Review", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: 1, updatedAt: 1 });
    const reviewId = await ctx.db.insert("callReviews", { workspaceId, projectId: reviewProject, leadName: "Jordan Lee", status: "ready", createdBy: "dana", createdAt: 1 });
    const assetId = await ctx.db.insert("assets", { workspaceId, kind: "proposal", title: "Proposal: Jordan Lee", status: "draft", currentVersion: 1, createdAt: 1 });
    const proposalId = await ctx.db.insert("proposals", { workspaceId, projectId, reviewId, ...(options.contact === false ? {} : { contactRef: "c1", dealRef: "d1" }), leadName: "Jordan Lee", status: "ready", assetId, view, createdBy: "dana", createdAt: 1 });
    return { assetId, proposalId };
  });
  return { t, owner, workspaceId, ...ids };
}

const approve = (s: Awaited<ReturnType<typeof setup>>) => s.t.run((ctx) => ctx.db.patch(s.assetId, { status: "approved" }));
const tokenOf = (url: string) => url.split("/p/")[1];

describe("the lead's proposal page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("PUBLIC_FORM_SECRET", SECRET);
    vi.stubEnv("SITE_URL", "https://app.example.com");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("shares only an approved proposal, files the email as a price draft, and shows the lead only their proposal", async () => {
    const s = await setup();
    await expect(s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId })).rejects.toThrow(/approves the proposal/);
    await approve(s);
    const shared = await s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId });
    expect(shared.url).toMatch(/^https:\/\/app\.example\.com\/p\/[0-9a-f]{48}$/);
    // Sharing twice keeps the same link and files one email.
    expect((await s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId })).url).toBe(shared.url);
    const drafts = await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ kind: "price", channel: "email", status: "draft", contactRef: "c1", dealRef: "d1", trigger: "proposal" });
    expect(drafts[0].body).toContain(shared.url);
    expect(drafts[0].body).not.toMatch(/\$/);

    const token = tokenOf(shared.url);
    await expect(s.t.mutation(api.proposalPage.page, { secret: "wrong", token })).rejects.toThrow();
    const page = await s.t.mutation(api.proposalPage.page, { secret: SECRET, token });
    expect(page).toMatchObject({ business: "Northpeak", title: "Growth Sprint for Jordan & Co.", needs: ["More booked calls every month"], price: { title: "Growth Sprint: $4,500 a month" }, payment: "notSetUp", acceptedAt: null });
    // The quotes, who said them and the team's notes stay with the team.
    expect(JSON.stringify(page)).not.toContain("Buyer's words");
    expect(JSON.stringify(page)).not.toContain("For the team only");
    expect(await s.t.mutation(api.proposalPage.page, { secret: SECRET, token: "0".repeat(48) })).toBeNull();
  });

  it("counts opens, and accepting proposes won for the Owner, once", async () => {
    const s = await setup();
    await approve(s);
    const token = tokenOf((await s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId })).url);
    await s.t.mutation(api.proposalPage.seen, { secret: SECRET, token });
    vi.advanceTimersByTime(DAY);
    await s.t.mutation(api.proposalPage.seen, { secret: SECRET, token });
    await expect(s.t.mutation(api.proposalPage.accept, { secret: SECRET, token, name: "  " })).rejects.toThrow(/Type your name/);
    await s.t.mutation(api.proposalPage.accept, { secret: SECRET, token, name: "Jordan Lee" });
    await s.t.mutation(api.proposalPage.accept, { secret: SECRET, token, name: "Someone else" });
    const shown = await s.owner.query(api.proposals.proposal, { workspaceId: s.workspaceId, proposalId: s.proposalId });
    expect(shown.share).toMatchObject({ views: 2, acceptedName: "Jordan Lee", drafted: true });
    // The first open is kept; the second one a day later does not move it.
    expect(shown.share!.firstViewedAt).toBeLessThan(NOW + DAY);
    expect(shown.payment).toBe("notSetUp");
    // Won is never set here: with no CRM connected it is handed back as a step for a person.
    expect(shown.share?.wonStep).toEqual({ state: "doItYourself", detail: expect.stringContaining("won") });
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toEqual([]);
    expect((await s.t.mutation(api.proposalPage.page, { secret: SECRET, token }))?.acceptedName).toBe("Jordan Lee");
  });

  it("drafts one follow-up when the page is not opened in three days, and none once it is", async () => {
    const s = await setup();
    await approve(s);
    await s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId });
    await s.t.mutation(internal.proposalPage.nudges, {});
    expect(await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect())).toHaveLength(1);
    vi.advanceTimersByTime(3 * DAY + 1);
    await s.t.mutation(internal.proposalPage.nudges, {});
    await s.t.mutation(internal.proposalPage.nudges, {});
    const drafts = await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect());
    expect(drafts.map((row) => [row.kind, row.trigger])).toEqual([
      ["price", "proposal"],
      ["followUp", "proposalNotOpened"],
    ]);
    expect(drafts[1].body).toContain("November 14");
    expect(drafts[1].body).not.toMatch(/just checking in/i);

    const opened = await setup();
    await approve(opened);
    const token = tokenOf((await opened.owner.mutation(api.proposalPage.share, { workspaceId: opened.workspaceId, proposalId: opened.proposalId })).url);
    await opened.t.mutation(api.proposalPage.seen, { secret: SECRET, token });
    vi.advanceTimersByTime(3 * DAY + 1);
    await opened.t.mutation(internal.proposalPage.nudges, {});
    expect(await opened.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect())).toHaveLength(1);
  });

  it("without a CRM lead, shares the link to copy and drafts nothing; Stripe says ready only with its key", async () => {
    const s = await setup({ contact: false });
    await approve(s);
    expect(await s.owner.mutation(api.proposalPage.share, { workspaceId: s.workspaceId, proposalId: s.proposalId })).toMatchObject({ draftId: null });
    expect(await s.t.run((ctx) => ctx.db.query("dealmakerDrafts").collect())).toEqual([]);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    expect((await s.owner.query(api.proposals.proposal, { workspaceId: s.workspaceId, proposalId: s.proposalId as Id<"proposals"> })).payment).toBe("ready");
  });
});
