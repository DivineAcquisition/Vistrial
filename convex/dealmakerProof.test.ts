/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's proof and weekly scorecard (build step 18a): before and after from the business's own CRM only
 * once there is enough of both, "involved" never "caused", time saved counted with a stated time per item,
 * and a scorecard posted to the Briefing once a week.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { CrmActivity, CrmContact, CrmDeal } from "./lib/crm/types";
import { MINUTES_EACH, NOT_ENOUGH_DATA, beforeAndAfter, closeRate, dealsInvolved, scorecard, speedToLead, timeSaved, weekStart } from "./lib/dealmaker/proof";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 15);

function deal(ref: string, input: Partial<CrmDeal> = {}): CrmDeal {
  return { ref, pipelineRef: "p1", stageRef: "s1", status: "open", value: 1000, source: null, contactRef: `c-${ref}`, ownerRef: null, createdAt: NOW - 100 * DAY, updatedAt: NOW, stageChangedAt: null, statusChangedAt: null, ...input };
}
const contact = (ref: string, addedAt: number): CrmContact => ({ ref, name: null, email: null, phone: null, source: null, tags: [], addedAt, lastActivityAt: null });
const touch = (contactRef: string, at: number): CrmActivity => ({ ref: `t-${contactRef}-${at}`, kind: "sms", direction: "outbound", at, contactRef, dealRef: null, status: null, seconds: null, fromStageRef: null, toStageRef: null });

describe("proof rules", () => {
  it("gives a close rate only from enough closed deals", () => {
    const w = { from: NOW - 30 * DAY, to: NOW };
    const closed = (n: number, status: "won" | "lost") => Array.from({ length: n }, (_, i) => deal(`${status}${i}`, { status, statusChangedAt: NOW - (i + 1) * DAY }));
    expect(closeRate([...closed(2, "won"), ...closed(1, "lost")], w).value).toBe(NOT_ENOUGH_DATA);
    expect(closeRate([...closed(3, "won"), ...closed(2, "lost")], w)).toEqual({ value: "60%", basis: "3 won of 5 closed" });
  });

  it("measures speed to lead as the middle time to the first outbound call, text or email", () => {
    const w = { from: NOW - 30 * DAY, to: NOW };
    const contacts = [1, 2, 3, 4, 5].map((n) => contact(`c${n}`, NOW - 10 * DAY));
    const activities = [1, 2, 3, 4, 5].map((n) => touch(`c${n}`, NOW - 10 * DAY + n * HOUR));
    expect(speedToLead(contacts, activities, w)).toEqual({ value: "3 hours", basis: "the middle of 5 new leads" });
    expect(speedToLead(contacts.slice(0, 3), activities, w).value).toBe(NOT_ENOUGH_DATA);
  });

  it("waits for two weeks after switching on, then compares the same length either side", () => {
    const base = { now: NOW, deals: [], calls: [], contacts: [], activities: [] };
    expect(beforeAndAfter({ ...base, onAt: null }).ready).toBe(false);
    const early = beforeAndAfter({ ...base, onAt: NOW - 5 * DAY });
    expect(early).toEqual({ ready: false, why: "Before and after shows once Dealmaker has been on for 14 days (5 so far)." });
    const later = beforeAndAfter({ ...base, onAt: NOW - 20 * DAY });
    if (!later.ready) throw new Error("expected before and after");
    expect(later.days).toBe(20);
    expect(later.rows.map((row) => [row.label, row.before, row.after])).toEqual([
      ["Close rate", NOT_ENOUGH_DATA, NOT_ENOUGH_DATA],
      ["Show rate", NOT_ENOUGH_DATA, NOT_ENOUGH_DATA],
      ["Typical time to first reply", NOT_ENOUGH_DATA, NOT_ENOUGH_DATA],
    ]);
    expect(later.note).toMatch(/not what caused it/);
  });

  it("says involved, never caused, and counts time saved with the time each", () => {
    const involved = dealsInvolved([deal("a", { status: "won", value: 4000 }), deal("b"), deal("c")], { dealRefs: new Set(["a"]), contactRefs: new Set(["c-b"]) }, "USD");
    expect(involved.words).toBe("Dealmaker was involved in 2 deals: 1 won ($4,000) and 1 still open ($1,000).");
    expect(involved.words).not.toMatch(/caused/);
    const saved = timeSaved({ brief: 3, message: 6, crmUpdate: 5 });
    expect(saved.minutes).toBe(3 * MINUTES_EACH.brief + 6 * MINUTES_EACH.message + 5 * MINUTES_EACH.crmUpdate);
    expect(saved.words).toBe("About 1.7 hours");
  });

  it("writes the scorecard in three rows", () => {
    const card = scorecard({ from: NOW - 7 * DAY, to: NOW, currency: "USD", deals: [deal("a", { status: "won", value: 2500, statusChangedAt: NOW - DAY }), deal("b", { status: "lost", statusChangedAt: NOW - 2 * DAY })], stageMoves: 4, work: { brief: 2, message: 1, crmUpdate: 0 }, movesWaiting: 3, briefsDue: 1, draftsWaiting: 2 });
    expect(card).toMatchObject({ moved: "4 stage moves, 1 won ($2,500), 1 lost.", did: "2 briefs, 1 message sent, 0 CRM updates. About 45 minutes saved.", next: "3 deals need a move, 2 drafts wait in Comms, 1 brief due." });
    expect(new Date(weekStart(NOW)).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});

describe("the proof and the scorecard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records when Dealmaker was first switched on, reads the proof, and posts the week's scorecard once", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    await t.run(async (ctx) => {
      const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", "sales-conversion")).unique())!;
      await ctx.db.patch(agent._id, { status: "live" });
    });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "on" });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "off" });
    vi.setSystemTime(NOW + DAY);
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "on" });
    // The first time it was switched on is kept.
    const link = await t.run(async (ctx) => (await ctx.db.query("workspaceAgents").collect()).find((row) => row.state === "on"));
    expect(link?.firstOnAt).toBeGreaterThanOrEqual(NOW);
    expect(link?.firstOnAt).toBeLessThan(NOW + HOUR);

    expect(await owner.query(api.dealmakerProof.summary, { workspaceId })).toEqual({ connected: false });
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: NOW + 30 * DAY, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", connectedBy: "nora", connectedAt: NOW - 60 * DAY, lastSyncAt: NOW, callsOk: 0, callsFailed: 0 });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Booked", position: 0 }] });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d1", pipelineId: "p1", stageId: "s1", status: "won", value: 4000, contactId: "c1", lastStatusChangeAt: NOW - 2 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [], addedAt: NOW - 30 * DAY });
      await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "m1", kind: "stage_change", at: NOW - 3 * DAY, contactId: "c1", dealId: "d1", fromStage: "s0", toStage: "s1" });
      const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Pre-call brief", objective: "Brief.", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "nora", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("dealBriefings", { workspaceId, projectId, leadName: "Jordan Lee", contactRef: "c1", dealRef: "d1", trigger: "request", status: "ready", createdBy: "nora", createdAt: NOW + HOUR } as never);
    });
    vi.setSystemTime(NOW + 2 * DAY);
    const proof = await owner.query(api.dealmakerProof.summary, { workspaceId });
    if (!proof.connected) throw new Error("expected proof");
    expect(proof.beforeAndAfter).toMatchObject({ ready: false, why: expect.stringMatching(/^Before and after shows once Dealmaker has been on for 14 days/) });
    expect(proof.involved).toMatchObject({ deals: 1, won: 1, wonValue: "$4,000" });
    expect(proof.saved.items.find((row) => row.key === "brief")).toMatchObject({ count: 1, minutesEach: MINUTES_EACH.brief });

    // Monday 16 November: last week's scorecard is posted once.
    vi.setSystemTime(Date.UTC(2026, 10, 16, 9));
    await t.mutation(internal.dealmakerProof.weekly, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.mutation(internal.dealmakerProof.weekly, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const posts = await t.run((ctx) => ctx.db.query("briefingItems").collect());
    const cards = posts.filter((row) => row.key?.startsWith("dealmaker-scorecard:"));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "weeklyReport", agentSlug: "sales-conversion", title: "Dealmaker · Week of Nov 9" });
    expect(cards[0].digest).toMatchObject({ changed: "1 stage move, 1 won ($4,000), 0 lost.", means: "1 brief, 0 messages sent, 0 CRM updates. About 20 minutes saved." });
  });
});
