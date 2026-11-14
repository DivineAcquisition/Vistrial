/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's roles and autonomy (build step 8): the hard stops, which kinds may ever be automatic, and each
 * member's home filtered to the deals assigned to them.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_ALLOWED } from "./lib/errors";
import { MESSAGE_KINDS, STOP_WORDS, decideSend, type MessageKind } from "./lib/dealmaker/autonomy";
import { SCOPE_WORDS, dealScope, inScope } from "./lib/dealmaker/roles";
import { isPaused } from "./dealmakerTeam";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

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

const base = { autonomous: ["reminder", "confirmation", "deliverPromised"], hasPrice: false, firstToLead: false, paused: false };

describe("what Dealmaker may send on its own", () => {
  it("lets only low-stakes kinds the Owner chose go without a person", () => {
    const sent = MESSAGE_KINDS.filter((kind) => decideSend({ ...base, kind }).action === "send");
    expect(sent).toEqual(["reminder", "confirmation", "deliverPromised"]);
    // Even if a stored setting named them, persuading, pricing, re-engaging and closing still wait.
    for (const kind of ["answer", "followUp", "checkIn", "price", "close"] as MessageKind[]) {
      expect(decideSend({ ...base, autonomous: [...MESSAGE_KINDS], kind })).toMatchObject({ action: "approve" });
    }
    expect(decideSend({ ...base, autonomous: [], kind: "reminder" })).toEqual({ action: "approve", reason: STOP_WORDS.notAutonomous });
  });

  it("holds the four hard stops whatever is automatic", () => {
    expect(decideSend({ ...base, kind: "reminder", paused: true })).toEqual({ action: "hold", reason: STOP_WORDS.paused });
    expect(decideSend({ ...base, kind: "deliverPromised", hasPrice: true })).toEqual({ action: "approve", reason: STOP_WORDS.price });
    expect(decideSend({ ...base, kind: "confirmation", firstToLead: true })).toEqual({ action: "approve", reason: STOP_WORDS.first });
  });
});

describe("each person's home", () => {
  const deals = [{ ownerRef: "u1" }, { ownerRef: "u2" }, { ownerRef: null }];
  it("shows Owners, Admins and sales leads every deal, others only theirs, and says why when it shows none", () => {
    expect(inScope(dealScope("owner", undefined), deals)).toHaveLength(3);
    expect(inScope(dealScope("member", { memberId: "m", salesRole: "lead" }), deals)).toHaveLength(3);
    expect(inScope(dealScope("member", { memberId: "m", salesRole: "closer", crmUserRef: "u2" }), deals)).toEqual([{ ownerRef: "u2" }]);
    expect(dealScope("member", { memberId: "m", salesRole: "setter" })).toEqual({ kind: "none", why: SCOPE_WORDS.unlinked });
    expect(dealScope("member", undefined)).toEqual({ kind: "none", why: SCOPE_WORDS.noRole });
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  const join = async (subject: string, role: "admin" | "member") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  const admin = await join("ada", "admin");
  const member = await join("milo", "member");
  await t.run(async (ctx) => {
    const now = Date.now();
    const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: now + 86_400_000, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", connectedBy: "nora", connectedAt: now, lastSyncAt: now, callsOk: 0, callsFailed: 0 });
    await ctx.db.insert("crmPipelines", { workspaceId, connectionId, seenAt: now, externalId: "pipe1", name: "Sales calls", stages: [{ id: "stNew", name: "New lead", position: 0 }, { id: "stBooked", name: "Call booked", position: 1 }] });
    const deal = (externalId: string, stageId: string, assignedTo?: string) => ctx.db.insert("crmDeals", { workspaceId, connectionId, seenAt: now, externalId, pipelineId: "pipe1", stageId, status: "open", value: 1000, ...(assignedTo ? { assignedTo } : {}) });
    await deal("d1", "stNew", "crm-milo");
    await deal("d2", "stBooked", "crm-milo");
    await deal("d3", "stBooked", "crm-ada");
  });
  const people = await owner.query(api.settings.people, { workspaceId });
  const idOf = (name: string) => people.members.find((row) => row.name === name)!.id;
  return { t, owner, admin, member, workspaceId, idOf };
}

describe("team and autonomy functions", () => {
  it("lists the CRM users seen on deals, links a member, and filters their home to their deals", async () => {
    const { owner, member, workspaceId, idOf } = await setup();
    const team = await owner.query(api.dealmakerTeam.team, { workspaceId });
    // No member is linked yet, so the CRM's ids are never shown: they are numbered.
    expect(team.crmUsers).toEqual([{ ref: "crm-milo", deals: 2, label: "CRM user 1" }, { ref: "crm-ada", deals: 1, label: "CRM user 2" }]);
    expect(team.kinds.filter((row) => row.canBeAutomatic).map((row) => row.id)).toEqual(["reminder", "confirmation", "deliverPromised"]);

    expect((await member.query(api.dealmakerTeam.myHome, { workspaceId })).why).toBe(SCOPE_WORDS.noRole);
    await owner.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: idOf("milo") as never, salesRole: "closer", crmUserRef: "crm-milo" });
    const home = await member.query(api.dealmakerTeam.myHome, { workspaceId });
    expect(home).toMatchObject({ salesRole: "closer", scope: "assigned", openDeals: 2 });
    expect(home.byStage.map((row) => row.stage).sort()).toEqual(["Call booked", "New lead"]);
    expect((await owner.query(api.dealmakerTeam.myHome, { workspaceId })).openDeals).toBe(3);
    expect(await message(member.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: idOf("milo") as never, salesRole: "lead" }))).toBe(NOT_ALLOWED);
  });

  it("lets only the Owner make only low-stakes kinds automatic", async () => {
    const { owner, admin, workspaceId } = await setup();
    await owner.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "reminder", automatic: true });
    expect(await message(owner.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "price", automatic: true }))).toBe(STOP_WORDS.notLowStakes);
    expect(await message(owner.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "close", automatic: true }))).toBe(STOP_WORDS.notLowStakes);
    expect(await message(admin.mutation(api.dealmakerTeam.setAutonomy, { workspaceId, kind: "confirmation", automatic: true }))).toBe(NOT_ALLOWED);
    const team = await owner.query(api.dealmakerTeam.team, { workspaceId });
    expect(team.kinds.filter((row) => row.automatic).map((row) => row.id)).toEqual(["reminder"]);
  });

  it("pauses a lead until a person lifts it", async () => {
    const { t, member, workspaceId } = await setup();
    const pauseId = await member.mutation(api.dealmakerTeam.pauseLead, { workspaceId, contactRef: "c1", reason: "Asked us to stop." });
    expect(await t.run((ctx) => isPaused(ctx, { workspaceId }, "c1"))).toBe(true);
    await member.mutation(api.dealmakerTeam.liftPause, { workspaceId, pauseId: pauseId! });
    expect(await t.run((ctx) => isPaused(ctx, { workspaceId }, "c1"))).toBe(false);
  });
});
