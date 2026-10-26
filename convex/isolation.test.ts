/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const page = { numItems: 10, cursor: null };

function person(subject: string, email: string, extra: Record<string, string | boolean> = {}) {
  return {
    subject,
    email,
    name: email,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
    ...extra,
  };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

describe("workspace isolation", () => {
  it("refuses another workspace with the same not-found as a missing one, and enforces roles", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});

    const ownerA = t.withIdentity(person("owner-a", "owner-a@example.com"));
    const ownerB = t.withIdentity(person("owner-b", "owner-b@example.com"));
    const workspaceA = await ownerA.mutation(api.workspace.create, { name: "Alpha" });
    const workspaceB = await ownerB.mutation(api.workspace.create, { name: "Beta" });
    const missing = await t.run(async (ctx) => {
      const id = await ctx.db.insert("workspaces", {
        name: "Gone",
        slug: "gone",
        timezone: "America/New_York",
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    expect(await message(ownerA.query(api.workspace.shell, { workspaceId: workspaceB }))).toBe(NOT_FOUND);
    expect(await message(ownerA.query(api.workspace.shell, { workspaceId: missing }))).toBe(NOT_FOUND);
    expect(await message(ownerA.mutation(api.workspace.markSetupDone, { workspaceId: workspaceB, setupDone: true }))).toBe(
      NOT_FOUND,
    );
    expect(await message(ownerA.mutation(api.workspace.markSetupDone, { workspaceId: missing, setupDone: true }))).toBe(
      NOT_FOUND,
    );
    expect(
      await message(ownerA.query(api.leads.list, { workspaceId: workspaceB, paginationOpts: page })),
    ).toBe(NOT_FOUND);
    expect(
      await message(ownerA.query(api.leads.list, { workspaceId: missing, paginationOpts: page })),
    ).toBe(NOT_FOUND);
    expect(await message(ownerA.query(api.events.recent, { workspaceId: workspaceB }))).toBe(
      await message(ownerA.query(api.events.recent, { workspaceId: missing })),
    );

    await expect(ownerA.mutation(api.workspace.create, { name: "Second" })).rejects.toThrow(
      "You already belong to a workspace.",
    );

    const repInvite = await ownerA.mutation(api.workspace.invite, {
      workspaceId: workspaceA,
      email: "rep-a@example.com",
      role: "rep",
    });
    const otherRepInvite = await ownerA.mutation(api.workspace.invite, {
      workspaceId: workspaceA,
      email: "rep-b@example.com",
      role: "rep",
    });
    const managerInvite = await ownerA.mutation(api.workspace.invite, {
      workspaceId: workspaceA,
      email: "manager-a@example.com",
      role: "manager",
    });

    const stranger = t.withIdentity(person("stranger", "someone-else@example.com"));
    await expect(stranger.mutation(api.workspace.acceptInvite, { token: repInvite.token })).rejects.toThrow(
      "This invite is for a different email.",
    );

    const repA = t.withIdentity(person("rep-a", "rep-a@example.com"));
    const repB = t.withIdentity(person("rep-b", "rep-b@example.com"));
    const manager = t.withIdentity(person("manager-a", "manager-a@example.com"));
    await repA.mutation(api.workspace.acceptInvite, { token: repInvite.token });
    await repB.mutation(api.workspace.acceptInvite, { token: otherRepInvite.token });
    await manager.mutation(api.workspace.acceptInvite, { token: managerInvite.token });
    await expect(repA.mutation(api.workspace.acceptInvite, { token: repInvite.token })).rejects.toThrow(
      "This invite has already been used.",
    );

    const expired = await ownerB.mutation(api.workspace.invite, {
      workspaceId: workspaceB,
      email: "late@example.com",
      role: "rep",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(expired.invitationId, { expiresAt: Date.now() - 1000 });
    });
    const late = t.withIdentity(person("late", "late@example.com"));
    await expect(late.mutation(api.workspace.acceptInvite, { token: expired.token })).rejects.toThrow(
      "This invite has expired.",
    );
    await expect(late.mutation(api.workspace.acceptInvite, { token: "missing-token" })).rejects.toThrow(NOT_FOUND);

    const members = await t.run(async (ctx) =>
      ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceA)).take(10),
    );
    const repAMember = members.find((row) => row.userId === "rep-a");
    const repBMember = members.find((row) => row.userId === "rep-b");
    expect(repAMember && repBMember).toBeTruthy();

    const leadForA = await t.run(async (ctx) =>
      ctx.db.insert("leads", {
        workspaceId: workspaceA,
        ownerMemberId: repAMember!._id,
        status: "open",
        source: "manual",
        historic: false,
        lastActivityAt: 3,
        createdAt: 3,
      }),
    );
    const leadForB = await t.run(async (ctx) =>
      ctx.db.insert("leads", {
        workspaceId: workspaceA,
        ownerMemberId: repBMember!._id,
        status: "open",
        source: "manual",
        historic: false,
        lastActivityAt: 2,
        createdAt: 2,
      }),
    );
    const leadInBeta = await t.run(async (ctx) =>
      ctx.db.insert("leads", {
        workspaceId: workspaceB,
        status: "open",
        source: "manual",
        historic: false,
        lastActivityAt: 1,
        createdAt: 1,
      }),
    );

    const seenByRep = await repA.query(api.leads.list, { workspaceId: workspaceA, paginationOpts: page });
    expect(seenByRep.page.map((lead: { id: string }) => lead.id)).toEqual([leadForA]);
    const seenByManager = await manager.query(api.leads.list, { workspaceId: workspaceA, paginationOpts: page });
    expect(seenByManager.page.map((lead: { id: string }) => lead.id).sort()).toEqual([leadForA, leadForB].sort());
    const seenByOwner = await ownerA.query(api.leads.list, { workspaceId: workspaceA, paginationOpts: page });
    expect(seenByOwner.page.map((lead: { id: string }) => lead.id)).not.toContain(leadInBeta);

    expect(await message(ownerA.query(api.leads.get, { workspaceId: workspaceA, leadId: leadInBeta }))).toBe(NOT_FOUND);
    expect(await message(repA.query(api.leads.get, { workspaceId: workspaceA, leadId: leadForB }))).toBe(NOT_FOUND);
    expect(await message(ownerA.mutation(api.leads.assign, { workspaceId: workspaceB, leadId: leadForA, ownerMemberId: repAMember!._id }))).toBe(
      NOT_FOUND,
    );

    await expect(
      manager.mutation(api.workspace.markSetupDone, { workspaceId: workspaceA, setupDone: true }),
    ).rejects.toThrow("Not allowed.");
    await expect(
      manager.mutation(api.workspace.setAgentState, { workspaceId: workspaceA, slug: "sales", state: "suggesting" }),
    ).rejects.toThrow("Not allowed.");
    await ownerA.mutation(api.workspace.markSetupDone, { workspaceId: workspaceA, setupDone: true });
    await ownerA.mutation(api.workspace.setAgentState, { workspaceId: workspaceA, slug: "sales", state: "suggesting" });

    await t.run(async (ctx) => {
      await ctx.db.insert("agents", {
        slug: "north",
        name: "North",
        area: "sales",
        job: "Watches a motion the others do not.",
        promise: "North never messages a lead.",
        sort: 9,
      });
    });
    const shell = await ownerA.query(api.workspace.shell, { workspaceId: workspaceA });
    expect(shell.setupDone).toBe(true);
    expect(shell.agents.find((agent: { slug: string; state: string }) => agent.slug === "sales")?.state).toBe("suggesting");
    expect(shell.agents.map((agent: { slug: string }) => agent.slug)).toContain("north");
    expect(shell.agents.filter((agent: { slug: string }) => agent.slug === "sales")).toHaveLength(1);

    const noteId = await ownerA.mutation(api.records.addNote, {
      workspaceId: workspaceA,
      leadId: leadForA,
      body: "private note",
    });
    const taskId = await ownerA.mutation(api.records.addTask, {
      workspaceId: workspaceA,
      leadId: leadForA,
      title: "Ping",
      purposeKey: "ping",
    });
    const callId = await ownerA.mutation(api.records.addCall, {
      workspaceId: workspaceA,
      leadId: leadForA,
      occurredAt: 10,
    });
    const bookingId = await ownerA.mutation(api.records.addBooking, {
      workspaceId: workspaceA,
      leadId: leadForA,
      startsAt: 11,
      endsAt: 12,
    });
    const messageId = await ownerA.mutation(api.records.addMessage, {
      workspaceId: workspaceA,
      leadId: leadForA,
      text: "private message",
      at: 13,
      direction: "in",
    });
    const conversationId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("conversations")
        .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", workspaceA).eq("leadId", leadForA))
        .take(1);
      return rows[0]!._id;
    });
    const foreign = [
      ownerB.query(api.records.timeline, { workspaceId: workspaceA, leadId: leadForA }),
      ownerB.query(api.records.timeline, { workspaceId: missing, leadId: leadForA }),
      ownerB.query(api.records.getNote, { workspaceId: workspaceB, noteId }),
      ownerB.query(api.records.getTask, { workspaceId: workspaceB, taskId }),
      ownerB.query(api.records.getCall, { workspaceId: workspaceB, callId }),
      ownerB.query(api.records.getBooking, { workspaceId: workspaceB, bookingId }),
      ownerB.query(api.records.getMessage, { workspaceId: workspaceB, messageId }),
      ownerB.query(api.records.getConversation, { workspaceId: workspaceB, conversationId }),
      ownerA.query(api.records.getNote, { workspaceId: workspaceB, noteId }),
      ownerA.query(api.records.getMessage, { workspaceId: missing, messageId }),
    ];
    for (const call of foreign) expect(await message(call)).toBe(NOT_FOUND);

    const events = await ownerA.query(api.events.recent, { workspaceId: workspaceA });
    expect(events).toEqual([]);
  });
});
