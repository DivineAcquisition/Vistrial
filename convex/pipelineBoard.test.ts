/**
 * @vitest-environment edge-runtime
 *
 * The Pipeline board (build step 9): health, temperature, who has the ball, readiness, today's moves and the
 * forecast, all worked out in code from the CRM, and the board filtered to each person's home.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { CrmActivity, CrmDeal } from "./lib/crm/types";
import { DAY, NOT_ENOUGH_DATA, buildBoard, forecastOf, healthOf, temperatureOf, type BoardInput } from "./lib/dealmaker/board";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const NOW = Date.UTC(2026, 10, 14, 15);

function deal(ref: string, input: Partial<CrmDeal> = {}): CrmDeal {
  return { ref, pipelineRef: "p1", stageRef: "s1", status: "open", value: 1000, source: "Referral", contactRef: `c-${ref}`, ownerRef: null, createdAt: NOW - 30 * DAY, updatedAt: NOW, stageChangedAt: null, statusChangedAt: null, ...input };
}
const talk = (ref: string, contactRef: string, direction: "inbound" | "outbound", daysAgo: number): CrmActivity => ({ ref, kind: "sms", direction, at: NOW - daysAgo * DAY, contactRef, dealRef: null, status: null, seconds: null, fromStageRef: null, toStageRef: null });

describe("board rules", () => {
  it("names health against the quiet-days setting and temperature from engagement only", () => {
    expect(healthOf({ status: "open" }, NOW - 2 * DAY, NOW, 14).health).toBe("active");
    expect(healthOf({ status: "open" }, NOW - 8 * DAY, NOW, 14).health).toBe("cooling");
    expect(healthOf({ status: "open" }, NOW - 20 * DAY, NOW, 14)).toEqual({ health: "quiet", why: "No activity for 20 days (quiet after 14)." });
    expect(healthOf({ status: "won" }, null, NOW, 14).health).toBe("won");
    expect(temperatureOf(NOW - 2 * DAY, null, NOW).temperature).toBe("hot");
    expect(temperatureOf(NOW - 10 * DAY, null, NOW).temperature).toBe("warm");
    expect(temperatureOf(null, null, NOW)).toEqual({ temperature: "cold", why: "No reply recorded." });
  });

  it("knows who has the ball, what is established and unresolved, and the one next move", () => {
    const input: BoardInput = {
      now: NOW,
      quietDays: 14,
      currency: "USD",
      pipeline: { ref: "p1", name: "Sales", stages: [{ ref: "s1", name: "Booked", order: 0 }] },
      deals: [deal("a"), deal("b"), deal("c"), deal("d")],
      activities: [talk("1", "c-a", "outbound", 3), talk("2", "c-a", "inbound", 1), talk("3", "c-b", "outbound", 2), talk("4", "c-c", "outbound", 30), talk("5", "c-d", "inbound", 1)],
      appointments: [],
      waitingContacts: new Set(["c-d"]),
      pausedContacts: new Set(),
      facts: [{ dealRef: "a", field: "budget", value: "About $5k a month", kind: "buyer", author: null, at: NOW - DAY }],
      commitments: [{ id: "k1", dealRef: "b", text: "Send the case study", owner: "m1", due: NOW, done: false }],
    };
    const board = buildBoard(input);
    const card = (ref: string) => board.stages[0].cards.find((row) => row.ref === ref)!;
    expect(card("a")).toMatchObject({ ball: "us", temperature: "hot", move: { kind: "answer" } });
    expect(card("a").established).toEqual([{ field: "budget", label: "Budget", value: "About $5k a month", kind: "Buyer's words", author: null }]);
    expect(card("a").unresolved.map((row) => row.label)).toEqual(["Need", "Who decides", "Timing", "Fit"]);
    expect(card("b")).toMatchObject({ ball: "lead", move: { kind: "deliver", words: "Deliver what was promised: Send the case study" } });
    expect(card("c")).toMatchObject({ health: "quiet", move: { kind: "checkIn", words: "Ask honestly whether further contact is welcome." } });
    expect(card("d").ball).toBe("approval");
    expect(board.moves[0]).toMatchObject({ ref: "a", kind: "answer" });
    expect(JSON.stringify(board)).not.toMatch(/score/i);
  });

  it("gives a forecast range only from enough of the business's own closed deals", () => {
    expect(forecastOf([deal("a"), deal("w", { status: "won" })], "USD").range).toBe(NOT_ENOUGH_DATA);
    const deals = [deal("o1", { value: 10_000 }), ...["w1", "w2"].map((ref) => deal(ref, { status: "won" })), ...["l1", "l2", "l3"].map((ref) => deal(ref, { status: "lost" }))];
    expect(forecastOf(deals, "USD")).toEqual({ range: "$3,333 to $5,000", basis: "Open deal value $10,000 at your own win rate of 2 won of 5 closed. A range, not a promise." });
  });
});

describe("the board query", () => {
  it("reads the CRM, filters to the person's home, records readiness and commitments, and keeps per-rep figures for Owners and Admins", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await owner.query(api.pipelineBoard.board, { workspaceId })).toEqual({ connected: false });
    await t.run(async (ctx) => {
      const now = Date.now();
      const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: now + DAY, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", connectedBy: "nora", connectedAt: now, lastSyncAt: now, callsOk: 0, callsFailed: 0 });
      await ctx.db.insert("crmPipelines", { workspaceId, connectionId, seenAt: now, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Booked", position: 0 }] });
      for (const [externalId, assignedTo] of [["d1", "crm-milo"], ["d2", "crm-ada"]]) await ctx.db.insert("crmDeals", { workspaceId, connectionId, seenAt: now, externalId, pipelineId: "p1", stageId: "s1", status: "open", value: 1000, assignedTo, contactId: `c-${externalId}`, lastStageChangeAt: now - DAY });
    });
    const people = await owner.query(api.settings.people, { workspaceId });
    await owner.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: people.members.find((row) => row.name === "milo")!.id as never, salesRole: "closer", crmUserRef: "crm-milo" });

    await member.mutation(api.pipelineBoard.recordFact, { workspaceId, dealRef: "d1", field: "need", value: "More booked consultations", kind: "rep" });
    await member.mutation(api.pipelineBoard.addCommitment, { workspaceId, dealRef: "d1", text: "Send pricing", owner: "lead" });

    const mine = await member.query(api.pipelineBoard.board, { workspaceId });
    if (!mine.connected) throw new Error("expected a board");
    expect(mine.stages[0].cards.map((row) => row.ref)).toEqual(["d1"]);
    expect(mine.stages[0].cards[0].established[0]).toMatchObject({ label: "Need", kind: "Rep's account", author: "milo" });
    expect(mine.stages[0].cards[0].commitments[0]).toMatchObject({ text: "Send pricing", owner: "lead" });
    expect(mine.perRep).toBeNull();

    const all = await owner.query(api.pipelineBoard.board, { workspaceId });
    if (!all.connected) throw new Error("expected a board");
    expect(all.stages[0].cards).toHaveLength(2);
    // The linked member by name; the unlinked CRM user numbered, never its id.
    expect(all.perRep?.map((row) => row.name).sort()).toEqual(["CRM user 1", "milo"]);
  });
});
