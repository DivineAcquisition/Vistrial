/**
 * @vitest-environment edge-runtime
 *
 * The shared CRM layer against saved CRM rows: the read view gives the shared model whatever CRM it is, a
 * client's CRM stays with that client, and the act door proposes through the existing approvals or says why
 * not, with the step for a person, and never fails a run. docs/rebuild/dealmaker.md, sections 3.5 and 3.6.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { proposeCrmAction } from "./lib/crm/act";
import { crmFor } from "./lib/crm/read";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const DAY = 86_400_000;

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function setup(options: { acting?: boolean; messaging?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const ids = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", { workspaceId, type: "business", name: "Aster Coaching", normalizedName: "aster coaching", status: "active", createdBy: "dana", createdAt: NOW, updatedAt: NOW });
    const connectionId = await ctx.db.insert("crmConnections", {
      workspaceId,
      provider: "highlevel",
      status: "connected",
      accessToken: "token",
      refreshToken: "refresh",
      tokenExpiresAt: NOW + DAY,
      scopes: [],
      accountId: "loc1",
      accountName: "Northpeak sub-account",
      currency: "USD",
      timezone: "America/New_York",
      connectedBy: "dana",
      connectedAt: NOW - 30 * DAY,
      lastSyncAt: NOW - 3_600_000,
      callsOk: 0,
      callsFailed: 0,
      ...(options.acting ? { actingEnabled: true } : {}),
      ...(options.messaging ? { messagingEnabled: true } : {}),
    });
    const base = { workspaceId, connectionId, seenAt: NOW };
    await ctx.db.insert("crmPipelines", { ...base, externalId: "pipe1", name: "Sales calls", stages: [{ id: "stNew", name: "New lead", position: 0 }, { id: "stBooked", name: "Call booked", position: 1 }, { id: "stProposal", name: "Proposal sent", position: 2 }] });
    await ctx.db.insert("crmDeals", { ...base, externalId: "opp1", pipelineId: "pipe1", stageId: "stProposal", status: "open", value: 3200, contactId: "con1", source: "Facebook ads", updatedAt: NOW - 20 * DAY, lastStageChangeAt: NOW - 20 * DAY });
    await ctx.db.insert("crmDeals", { ...base, externalId: "opp2", pipelineId: "pipe1", stageId: "stBooked", status: "won", value: 1800, contactId: "con2", updatedAt: NOW - 2 * DAY });
    await ctx.db.insert("crmContacts", { ...base, externalId: "con1", name: "Jordan Lee", phone: "+15555550101", email: "jordan@example.com", source: "Facebook ads", tags: ["webinar"], addedAt: NOW - 40 * DAY });
    await ctx.db.insert("crmContacts", { ...base, externalId: "con2", name: "Sam Ray", tags: [], addedAt: NOW - 10 * DAY });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "m1", kind: "call", direction: "outbound", at: NOW - 21 * DAY, contactId: "con1", status: "completed", seconds: 900 });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a1", kind: "appointment", at: NOW + 3 * 3_600_000, contactId: "con2", status: "confirmed" });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a2", kind: "appointment", at: NOW - 2 * DAY, contactId: "con1", status: "noshow" });
    return { clientId: clientId as Id<"clients">, connectionId };
  });
  return { t, workspaceId, ...ids };
}

describe("reading a CRM through the shared view", () => {
  it("gives the shared model, with appointments apart from activity", async () => {
    const { t, workspaceId } = await setup();
    const out = await t.run(async (ctx) => {
      const crm = (await crmFor(ctx, { workspaceId }))!;
      return {
        connection: crm.connection,
        pipelines: await crm.pipelines(),
        open: await crm.deals({ open: true }),
        all: await crm.deals(),
        deal: await crm.deal("opp1"),
        missing: await crm.deal("nope"),
        contact: await crm.contact("con1"),
        activities: await crm.activities({ since: NOW - 30 * DAY }),
        forJordan: await crm.activities({ contactRef: "con1" }),
        upcoming: await crm.appointments({ from: NOW, to: NOW + DAY }),
        past: await crm.appointments({ from: NOW - 7 * DAY, to: NOW }),
      };
    });
    expect(out.connection).toMatchObject({ provider: "highlevel", label: "HighLevel", accountName: "Northpeak sub-account", currency: "USD", connected: true, actingOn: false, messagingOn: false });
    expect(out.connection.capabilities.appointments).toBe(true);
    expect(out.pipelines).toEqual([{ ref: "pipe1", name: "Sales calls", stages: [{ ref: "stNew", name: "New lead", order: 0 }, { ref: "stBooked", name: "Call booked", order: 1 }, { ref: "stProposal", name: "Proposal sent", order: 2 }] }]);
    expect(out.open.map((deal) => deal.ref)).toEqual(["opp1"]);
    expect(out.all).toHaveLength(2);
    expect(out.deal).toMatchObject({ ref: "opp1", stageRef: "stProposal", status: "open", value: 3200, contactRef: "con1", source: "Facebook ads", stageChangedAt: NOW - 20 * DAY });
    expect(out.missing).toBeNull();
    expect(out.contact).toMatchObject({ ref: "con1", name: "Jordan Lee", tags: ["webinar"] });
    // Appointments are booked calls, never mixed into activity.
    expect(out.activities.map((row) => row.kind)).toEqual(["call"]);
    expect(out.forJordan.map((row) => row.ref)).toEqual(["m1"]);
    expect(out.upcoming).toEqual([{ ref: "a1", startsAt: NOW + 3 * 3_600_000, status: "confirmed", contactRef: "con2", dealRef: null }]);
    expect(out.past.map((row) => row.status)).toEqual(["noShow"]);
  });

  it("keeps a client's CRM with that client: the organization's view does not see it, and nothing connected is null", async () => {
    const { t, workspaceId, clientId, connectionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { clientId });
      for (const row of await ctx.db.query("crmPipelines").collect()) await ctx.db.patch(row._id, { clientId });
      for (const row of await ctx.db.query("crmDeals").collect()) await ctx.db.patch(row._id, { clientId });
    });
    const views = await t.run(async (ctx) => [(await crmFor(ctx, { workspaceId }))?.connection ?? null, (await crmFor(ctx, { workspaceId, clientId }))?.connection ?? null]);
    expect(views[0]).toBeNull();
    expect(views[1]?.accountName).toBe("Northpeak sub-account");
  });
});

describe("acting through the shared door", () => {
  const scope = (workspaceId: Id<"workspaces">) => ({ workspaceId, agentSlug: "sales-conversion" });
  const move = { kind: "move_stage" as const, dealId: "opp1", stageId: "stBooked", why: "The lead asked to talk again before a proposal." };

  it("proposes through the existing approvals when acting is on, as the agent, and changes nothing in the CRM", async () => {
    const { t, workspaceId } = await setup({ acting: true });
    const out = await t.run((ctx) => proposeCrmAction(ctx, scope(workspaceId), move));
    expect(out.ok).toBe(true);
    const rows = await t.run(async (ctx) => ({ actions: await ctx.db.query("crmActions").collect(), approvals: await ctx.db.query("approvals").collect() }));
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({ kind: "move_stage", state: "proposed", proposedBy: "agent", agentSlug: "sales-conversion", stageId: "stBooked" });
    expect(rows.approvals[0]).toMatchObject({ kind: "accountChange", subjectTable: "crmActions", status: "waiting", agentSlug: "sales-conversion" });
  });

  it("says why not, with the step for a person, when acting is off or no CRM is connected; nothing is written", async () => {
    const { t, workspaceId } = await setup();
    const off = await t.run((ctx) => proposeCrmAction(ctx, scope(workspaceId), move, { stage: "Call booked" }));
    expect(off).toMatchObject({ ok: false, code: "acting_off", doItYourself: 'Move the deal to "Call booked" in HighLevel.' });
    const other = await t.run(async (ctx) => {
      const { _id, _creationTime, ...copy } = (await ctx.db.get(workspaceId))!;
      void _id;
      void _creationTime;
      const elsewhere = await ctx.db.insert("workspaces", copy);
      return proposeCrmAction(ctx, scope(elsewhere), move);
    });
    expect(other).toMatchObject({ ok: false, code: "no_crm", doItYourself: 'Move the deal to the next stage in your CRM.' });
    expect(await t.run((ctx) => ctx.db.query("crmActions").collect())).toHaveLength(0);
  });

  it("falls back to Copy for a message while messaging is off, and proposes it with SEND when it is on", async () => {
    const text = { kind: "send_sms" as const, contactId: "con1", body: "Hi Jordan, still keen to start in December?", why: "Quiet for 20 days after the proposal." };
    const off = await setup({ acting: true });
    expect(await off.t.run((ctx) => proposeCrmAction(ctx, scope(off.workspaceId), text, { lead: "Jordan" }))).toMatchObject({
      ok: false,
      code: "messaging_off",
      doItYourself: "Copy the text and send it to Jordan yourself.",
    });
    const on = await setup({ acting: true, messaging: true });
    expect((await on.t.run((ctx) => proposeCrmAction(ctx, scope(on.workspaceId), text))).ok).toBe(true);
    const [row] = await on.t.run((ctx) => ctx.db.query("crmActions").collect());
    expect(row).toMatchObject({ kind: "send_sms", restricted: "message", state: "proposed" });
  });

  it("returns a refusal a person can act on instead of failing the run", async () => {
    const { t, workspaceId } = await setup({ acting: true });
    const invented = await t.run((ctx) => proposeCrmAction(ctx, scope(workspaceId), { ...move, dealId: "made-up" }));
    expect(invented).toMatchObject({ ok: false, code: "refused" });
    expect((invented as { reason: string }).reason).toMatch(/has not read that deal/);
  });
});
