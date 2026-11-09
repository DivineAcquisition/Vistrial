/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

/** An owner, a manager and a rep in one workspace, joined through real invites. */
async function team() {
  const t = newTest();
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const owner = t.withIdentity(identity("user_owner"));
  const manager = t.withIdentity(identity("user_manager"));
  const rep = t.withIdentity(identity("user_rep"));
  const m = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_manager@example.com", role: "manager" });
  const r = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_rep@example.com", role: "rep" });
  await manager.mutation(api.workspace.acceptInvite, { token: m.token });
  await rep.mutation(api.workspace.acceptInvite, { token: r.token });
  const people = await owner.query(api.settings.people, { workspaceId });
  const idOf = (role: string) => people.members.find((row) => row.role === role)!.id;
  return { t, workspaceId, owner, manager, rep, ownerId: idOf("owner"), managerId: idOf("manager"), repId: idOf("rep") };
}

const newTest = () => convexTest(schema, modules);

async function auditActions(t: ReturnType<typeof newTest>, workspaceId: Id<"workspaces">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).map((row) => row.action),
  );
}

describe("settings: roles", () => {
  it("lets an owner change workspace settings and writes an audit row for each", async () => {
    const { t, workspaceId, owner } = await team();
    await owner.mutation(api.settings.renameWorkspace, { workspaceId, name: "  Bay Area Cleaning  " });
    await owner.mutation(api.settings.setCountry, { workspaceId, country: "gb" });
    await owner.mutation(api.settings.setDefaultResearchMode, { workspaceId, mode: "fast" });
    await owner.mutation(api.settings.setSupportAccess, { workspaceId, on: false });
    const business = await owner.query(api.settings.business, { workspaceId });
    expect(business).toMatchObject({ name: "Bay Area Cleaning", defaultCountry: "GB", canEdit: true });
    const actions = await auditActions(t, workspaceId);
    expect(actions).toEqual(
      expect.arrayContaining(["workspace.renamed", "settings.country_updated", "settings.research_mode_updated", "support_access.off"]),
    );
  });

  it("lets a manager read the workspace sections but change none of them", async () => {
    const { workspaceId, manager, repId } = await team();
    expect((await manager.query(api.settings.business, { workspaceId })).canEdit).toBe(false);
    expect((await manager.query(api.settings.people, { workspaceId })).canManage).toBe(false);
    expect((await manager.query(api.settings.agentDefaults, { workspaceId })).canEdit).toBe(false);
    await expect(manager.mutation(api.settings.renameWorkspace, { workspaceId, name: "Mine now" })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.settings.setCountry, { workspaceId, country: "CA" })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.settings.setDefaultResearchMode, { workspaceId, mode: "fast" })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.settings.setSupportAccess, { workspaceId, on: false })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.settings.setMemberRole, { workspaceId, memberId: repId, role: "manager" })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.settings.removeMember, { workspaceId, memberId: repId })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.workspace.invite, { workspaceId, email: "x@example.com", role: "rep" })).rejects.toThrow(/Not allowed/);
    await expect(manager.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "off" })).rejects.toThrow(/Not allowed/);
  });

  it("keeps a rep to their own section, on the server", async () => {
    const { workspaceId, rep } = await team();
    await expect(rep.query(api.settings.business, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(rep.query(api.settings.people, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(rep.query(api.settings.agentDefaults, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(rep.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(rep.mutation(api.settings.renameWorkspace, { workspaceId, name: "Rep's" })).rejects.toThrow(/Not allowed/);
    const me = await rep.query(api.settings.me, { workspaceId });
    expect(me).toMatchObject({ role: "rep", email: "user_rep@example.com", defaultResearchMode: "thorough" });
    await rep.mutation(api.settings.setMyPreferences, { workspaceId, theme: "dark", reportReady: false });
    expect(await rep.query(api.settings.me, { workspaceId })).toMatchObject({
      theme: "dark",
      notifications: { checkInsDue: true, questionsWaiting: true, reportReady: false },
    });
  });
});

describe("settings: owners", () => {
  it("never demotes or removes the last owner", async () => {
    const { workspaceId, owner, ownerId } = await team();
    await expect(owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerId, role: "manager" })).rejects.toThrow(/at least one owner/);
    await expect(owner.mutation(api.settings.removeMember, { workspaceId, memberId: ownerId })).rejects.toThrow(/at least one owner/);
  });

  it("lets an owner step down once another owner exists", async () => {
    const { t, workspaceId, owner, manager, ownerId, managerId } = await team();
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: managerId, role: "owner" });
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerId, role: "manager" });
    const people = await manager.query(api.settings.people, { workspaceId });
    expect(people.canManage).toBe(true);
    expect(people.members.filter((row) => row.role === "owner")).toHaveLength(1);
    await expect(manager.mutation(api.settings.removeMember, { workspaceId, memberId: managerId })).rejects.toThrow(/at least one owner/);
    expect((await auditActions(t, workspaceId)).filter((a) => a === "member.role_changed")).toHaveLength(2);
  });

  it("removes a member, who then loses access, and audits it", async () => {
    const { t, workspaceId, owner, rep, repId } = await team();
    await owner.mutation(api.settings.removeMember, { workspaceId, memberId: repId });
    await expect(rep.query(api.settings.me, { workspaceId })).rejects.toThrow();
    const people = await owner.query(api.settings.people, { workspaceId });
    expect(people.members.map((row) => row.role)).toEqual(["owner", "manager"]);
    expect(await auditActions(t, workspaceId)).toContain("member.removed");
    // Invited back, the same row returns, so the workspace never holds two rows for one person.
    const again = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_rep@example.com", role: "rep" });
    await rep.mutation(api.workspace.acceptInvite, { token: again.token });
    expect((await rep.query(api.settings.me, { workspaceId })).memberId).toBe(repId);
  });
});

describe("settings: invites", () => {
  it("shows pending invites, lets an owner cancel one, and refuses the cancelled link", async () => {
    const { t, workspaceId, owner, manager } = await team();
    const sent = await owner.mutation(api.workspace.invite, { workspaceId, email: "New@Example.com", role: "rep" });
    let people = await owner.query(api.settings.people, { workspaceId });
    expect(people.invites).toEqual([expect.objectContaining({ email: "new@example.com", role: "rep" })]);
    await expect(manager.mutation(api.settings.cancelInvite, { workspaceId, invitationId: sent.invitationId })).rejects.toThrow(/Not allowed/);
    await owner.mutation(api.settings.cancelInvite, { workspaceId, invitationId: sent.invitationId });
    people = await owner.query(api.settings.people, { workspaceId });
    expect(people.invites).toEqual([]);
    const invited = t.withIdentity({ ...identity("user_new"), email: "new@example.com" });
    await expect(invited.mutation(api.workspace.acceptInvite, { token: sent.token })).rejects.toThrow(/cancelled/);
    expect(await auditActions(t, workspaceId)).toEqual(expect.arrayContaining(["invite.created", "invite.canceled", "invite.accepted"]));
  });

  it("accepts an invite into the right role and keeps the email for the member list", async () => {
    const { workspaceId, owner } = await team();
    const people = await owner.query(api.settings.people, { workspaceId });
    expect(people.members.find((row) => row.role === "rep")).toMatchObject({ email: "user_rep@example.com", name: "user_rep" });
    expect(people.invites).toEqual([]);
  });
});

describe("settings: Vistrial support access", () => {
  async function withGrant() {
    const ctx = await team();
    await ctx.t.run(async (db) => {
      await db.db.insert("staff", { userId: "user_staff_abc123", role: "service_team" });
    });
    const staff = ctx.t.withIdentity({ ...identity("user_staff_abc123"), secondFactor: true });
    const grantId = await staff.mutation(api.staff.grant, { workspaceId: ctx.workspaceId, reason: "Customer asked for help with a report", hours: 4 });
    await staff.mutation(api.staff.enter, { workspaceId: ctx.workspaceId });
    return { ...ctx, staff, grantId };
  }

  it("shows the grant log to owners only", async () => {
    const { workspaceId, owner, manager, rep } = await withGrant();
    const log = await owner.query(api.settings.supportLog, { workspaceId });
    expect(log.on).toBe(true);
    expect(log.grants).toEqual([
      expect.objectContaining({ who: "Vistrial support", staffRef: "abc123", reason: "Customer asked for help with a report", open: true, opens: 1 }),
    ]);
    await expect(manager.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(rep.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    expect((await manager.query(api.settings.people, { workspaceId })).supportAccess).toBe(true);
  });

  it("turning it off ends open grants and blocks new ones; turning it on allows them again", async () => {
    const { t, workspaceId, owner, staff } = await withGrant();
    const result = await owner.mutation(api.settings.setSupportAccess, { workspaceId, on: false });
    expect(result.ended).toBe(1);
    await expect(staff.mutation(api.staff.enter, { workspaceId })).rejects.toThrow();
    await expect(staff.mutation(api.staff.grant, { workspaceId, reason: "Trying again after the switch", hours: 1 })).rejects.toThrow(/turned off/);
    const log = await owner.query(api.settings.supportLog, { workspaceId });
    expect(log.on).toBe(false);
    expect(log.grants[0]).toMatchObject({ open: false });
    expect(log.grants[0].revokedAt).not.toBeNull();
    await owner.mutation(api.settings.setSupportAccess, { workspaceId, on: true });
    await staff.mutation(api.staff.grant, { workspaceId, reason: "Second look at the report", hours: 1 });
    expect((await owner.query(api.settings.supportLog, { workspaceId })).grants).toHaveLength(2);
    expect(await auditActions(t, workspaceId)).toEqual(expect.arrayContaining(["support_access.off", "support_access.on"]));
  });
});

describe("settings: defaults and preferences", () => {
  it("stores the default research quality for every member's chat box", async () => {
    const { workspaceId, owner, rep } = await team();
    expect((await rep.query(api.settings.me, { workspaceId })).defaultResearchMode).toBe("thorough");
    await owner.mutation(api.settings.setDefaultResearchMode, { workspaceId, mode: "fast" });
    expect((await rep.query(api.settings.me, { workspaceId })).defaultResearchMode).toBe("fast");
    expect((await owner.query(api.settings.agentDefaults, { workspaceId })).defaultResearchMode).toBe("fast");
  });

  it("keeps notification choices per member", async () => {
    const { workspaceId, owner, manager } = await team();
    await owner.mutation(api.settings.setMyPreferences, { workspaceId, checkInsDue: false, theme: "system" });
    expect((await owner.query(api.settings.me, { workspaceId })).notifications.checkInsDue).toBe(false);
    expect((await owner.query(api.settings.me, { workspaceId })).theme).toBe("system");
    expect((await manager.query(api.settings.me, { workspaceId })).notifications.checkInsDue).toBe(true);
    expect((await manager.query(api.settings.me, { workspaceId })).theme).toBeNull();
    await owner.mutation(api.settings.setMyPreferences, { workspaceId, questionsWaiting: false });
    expect((await owner.query(api.settings.me, { workspaceId })).notifications).toEqual({ checkInsDue: false, questionsWaiting: false, reportReady: true });
  });
});

describe("settings: isolation", () => {
  it("never reads or changes another workspace", async () => {
    const { t, workspaceId, owner, repId } = await team();
    const otherId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_other" });
    const other = t.withIdentity(identity("user_other"));
    await expect(other.query(api.settings.people, { workspaceId })).rejects.toThrow(/Not found/);
    await expect(other.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not found/);
    await expect(other.mutation(api.settings.renameWorkspace, { workspaceId, name: "Taken" })).rejects.toThrow(/Not found/);
    // An owner of one workspace cannot reach a member or invite of another through their own.
    await expect(other.mutation(api.settings.removeMember, { workspaceId: otherId, memberId: repId })).rejects.toThrow(/Not found/);
    await expect(other.mutation(api.settings.setMemberRole, { workspaceId: otherId, memberId: repId, role: "owner" })).rejects.toThrow(/Not found/);
    const sent = await owner.mutation(api.workspace.invite, { workspaceId, email: "z@example.com", role: "rep" });
    await expect(other.mutation(api.settings.cancelInvite, { workspaceId: otherId, invitationId: sent.invitationId })).rejects.toThrow(/Not found/);
    expect((await owner.query(api.settings.people, { workspaceId })).invites).toHaveLength(1);
    expect((await other.query(api.settings.people, { workspaceId: otherId })).members).toHaveLength(1);
  });
});
