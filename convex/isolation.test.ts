/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string, email: string, name = email) {
  return { subject, email, name };
}

describe("workspace isolation", () => {
  it("keeps leads, settings, and invites inside the caller's workspace and role", async () => {
    const t = convexTest(schema, modules);
    const ownerA = t.withIdentity(person("owner-a", "owner-a@example.com", "Owner A"));
    const ownerB = t.withIdentity(person("owner-b", "owner-b@example.com", "Owner B"));
    const workspaceA = await ownerA.mutation(api.workspace.create, { name: "Alpha" });
    const workspaceB = await ownerB.mutation(api.workspace.create, { name: "Beta" });

    await expect(ownerA.mutation(api.workspace.create, { name: "Second" })).rejects.toThrow(
      "You already belong to a workspace.",
    );

    const repInvite = await ownerA.mutation(api.workspace.invite, { email: "rep-a@example.com", role: "rep" });
    const otherRepInvite = await ownerA.mutation(api.workspace.invite, { email: "rep-b@example.com", role: "rep" });
    const managerInvite = await ownerA.mutation(api.workspace.invite, { email: "manager-a@example.com", role: "manager" });

    const stranger = t.withIdentity(person("stranger", "someone-else@example.com"));
    await expect(stranger.mutation(api.workspace.acceptInvite, { token: repInvite.token })).rejects.toThrow(
      "This invite is for a different email.",
    );

    const repA = t.withIdentity(person("rep-a", "rep-a@example.com", "Rep A"));
    const repB = t.withIdentity(person("rep-b", "rep-b@example.com", "Rep B"));
    const manager = t.withIdentity(person("manager-a", "manager-a@example.com", "Manager A"));
    await repA.mutation(api.workspace.acceptInvite, { token: repInvite.token });
    await repB.mutation(api.workspace.acceptInvite, { token: otherRepInvite.token });
    await manager.mutation(api.workspace.acceptInvite, { token: managerInvite.token });

    await expect(repA.mutation(api.workspace.acceptInvite, { token: repInvite.token })).rejects.toThrow(
      "This invite has already been used.",
    );

    const expired = await ownerB.mutation(api.workspace.invite, { email: "late@example.com", role: "rep" });
    await t.run(async (ctx) => {
      await ctx.db.patch(expired.invitationId, { expiresAt: Date.now() - 1000 });
    });
    const late = t.withIdentity(person("late", "late@example.com"));
    await expect(late.mutation(api.workspace.acceptInvite, { token: expired.token })).rejects.toThrow(
      "This invite has expired.",
    );
    await expect(late.mutation(api.workspace.acceptInvite, { token: "not-a-real-token" })).rejects.toThrow(
      "This invite is not valid.",
    );

    const secondHome = await ownerB.mutation(api.workspace.invite, { email: "rep-a@example.com", role: "rep" });
    await expect(repA.mutation(api.workspace.acceptInvite, { token: secondHome.token })).rejects.toThrow(
      "You already belong to a workspace.",
    );

    const repMembers = await t.run(async (ctx) =>
      ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceA))
        .collect(),
    );
    const repAMember = repMembers.find((row) => row.userId === "rep-a");
    const repBMember = repMembers.find((row) => row.userId === "rep-b");
    expect(repAMember).toBeTruthy();
    expect(repBMember).toBeTruthy();

    const leadForA = await ownerA.mutation(api.workspace.createLead, { assignedMemberId: repAMember!._id });
    const leadForB = await ownerA.mutation(api.workspace.createLead, { assignedMemberId: repBMember!._id });
    const leadInBeta = await ownerB.mutation(api.workspace.createLead, {});

    const seenByRep = await repA.query(api.workspace.listLeads, {});
    expect(seenByRep.map((lead) => lead.id)).toEqual([leadForA]);

    const seenByManager = await manager.query(api.workspace.listLeads, {});
    expect(seenByManager.map((lead) => lead.id).sort()).toEqual([leadForA, leadForB].sort());

    const seenByOwner = await ownerA.query(api.workspace.listLeads, {});
    expect(seenByOwner.map((lead) => lead.id).sort()).toEqual([leadForA, leadForB].sort());
    expect(seenByOwner.map((lead) => lead.id)).not.toContain(leadInBeta);

    await expect(ownerA.query(api.workspace.getLead, { leadId: leadInBeta })).rejects.toThrow(
      "That lead is not available.",
    );
    await expect(repA.query(api.workspace.getLead, { leadId: leadForB })).rejects.toThrow(
      "That lead is not available.",
    );
    await expect(ownerB.query(api.workspace.listLeads, {})).resolves.toEqual([
      { id: leadInBeta, assignedMemberId: null },
    ]);

    await expect(manager.mutation(api.workspace.updateSettings, { setupDone: true })).rejects.toThrow(
      "Only an owner can change that.",
    );
    await expect(manager.mutation(api.workspace.setAgentState, { slug: "assay", state: "suggesting" })).rejects.toThrow(
      "Only an owner can change that.",
    );
    await ownerA.mutation(api.workspace.updateSettings, { setupDone: true });
    await ownerA.mutation(api.workspace.setAgentState, { slug: "assay", state: "suggesting" });
    const snapshot = await manager.query(api.workspace.snapshot, {});
    expect(snapshot.setupDone).toBe(true);
    expect(snapshot.agents.find((agent) => agent.slug === "assay")?.state).toBe("suggesting");
    expect(snapshot.agents.find((agent) => agent.slug === "relay")?.state).toBe("off");

    await t.run(async (ctx) => {
      await ctx.db.insert("staff", { userId: "staff-open", role: "service_team", mfaEnrolled: true });
      await ctx.db.insert("staff", { userId: "staff-locked", role: "platform_admin", mfaEnrolled: false });
    });
    const staff = t.withIdentity(person("staff-open", "staff@vistrial.io", "Staff"));
    const locked = t.withIdentity(person("staff-locked", "locked@vistrial.io", "Locked"));
    await expect(staff.mutation(api.staff.enter, { workspaceId: workspaceA })).resolves.toBeNull();
    await expect(locked.mutation(api.staff.grant, { workspaceId: workspaceA, reason: "Helping the owner", hours: 4 })).rejects.toThrow(
      "Second factor is required.",
    );
    await staff.mutation(api.staff.grant, { workspaceId: workspaceA, reason: "Helping the owner", hours: 4 });
    await expect(staff.mutation(api.staff.enter, { workspaceId: workspaceA })).resolves.toMatchObject({ name: "Alpha" });
    await expect(staff.mutation(api.staff.enter, { workspaceId: workspaceB })).resolves.toBeNull();

    const grants = await t.run(async (ctx) => ctx.db.query("staffAccessGrants").collect());
    expect(grants).toHaveLength(1);
    await t.run(async (ctx) => {
      await ctx.db.patch(grants[0]!._id, { expiresAt: Date.now() - 1000 });
    });
    await expect(staff.mutation(api.staff.enter, { workspaceId: workspaceA })).resolves.toBeNull();

    const audit = await t.run(async (ctx) => ctx.db.query("auditLog").collect());
    const actions = audit.map((row) => row.action);
    expect(actions).toContain("workspace.created");
    expect(actions).toContain("invite.created");
    expect(actions).toContain("invite.accepted");
    expect(actions).toContain("settings.updated");
    expect(actions).toContain("staff.grant_created");
    expect(actions).toContain("staff.entered");
    expect(audit.every((row) => !JSON.stringify(row.detail).includes("transcript"))).toBe(true);
    expect(workspaceA).not.toEqual(workspaceB);
  });
});
