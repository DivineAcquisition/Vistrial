/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

/** An owner, a admin and a viewer in one workspace, joined through real invites. */
async function team() {
  const t = newTest();
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const owner = t.withIdentity(identity("user_owner"));
  const admin = t.withIdentity(identity("user_admin"));
  const viewer = t.withIdentity(identity("user_viewer"));
  const m = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_admin@example.com", role: "admin" });
  const r = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_viewer@example.com", role: "viewer" });
  await admin.mutation(api.workspace.acceptInvite, { token: m.token });
  await viewer.mutation(api.workspace.acceptInvite, { token: r.token });
  const people = await owner.query(api.settings.people, { workspaceId });
  const idOf = (role: string) => people.members.find((row) => row.role === role)!.id;
  return { t, workspaceId, owner, admin, viewer, ownerId: idOf("owner"), adminId: idOf("admin"), viewerId: idOf("viewer") };
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
      expect.arrayContaining(["workspace.renamed", "settings.country_updated", "settings.research_mode_updated", "workspace.service_team_access_off"]),
    );
  });

  it("lets an admin run the organization, but not touch an owner or Vistrial support access", async () => {
    const { workspaceId, admin, ownerId, viewerId } = await team();
    expect((await admin.query(api.settings.business, { workspaceId })).canEdit).toBe(true);
    expect(await admin.query(api.settings.people, { workspaceId })).toMatchObject({ canManage: true, isOwner: false });
    expect((await admin.query(api.settings.agentDefaults, { workspaceId })).canEdit).toBe(true);
    await admin.mutation(api.settings.renameWorkspace, { workspaceId, name: "Northlight Growth" });
    await admin.mutation(api.settings.setCountry, { workspaceId, country: "CA" });
    await admin.mutation(api.settings.setDefaultResearchMode, { workspaceId, mode: "fast" });
    await admin.mutation(api.settings.setMemberRole, { workspaceId, memberId: viewerId, role: "member" });
    await expect(admin.mutation(api.settings.setSupportAccess, { workspaceId, on: false })).rejects.toThrow(/Not allowed/);
    await expect(admin.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(admin.mutation(api.settings.setMemberRole, { workspaceId, memberId: viewerId, role: "owner" })).rejects.toThrow(/Only an Owner/);
    await expect(admin.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerId, role: "member" })).rejects.toThrow(/Only an Owner/);
    await expect(admin.mutation(api.settings.removeMember, { workspaceId, memberId: ownerId })).rejects.toThrow(/Only an Owner/);
    await admin.mutation(api.settings.removeMember, { workspaceId, memberId: viewerId });
    await admin.mutation(api.workspace.invite, { workspaceId, email: "x@example.com", role: "viewer" });
    await admin.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "off" });
  });

  it("keeps a viewer to their own section, on the server", async () => {
    const { workspaceId, viewer } = await team();
    await expect(viewer.query(api.settings.business, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(viewer.query(api.settings.people, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(viewer.query(api.settings.agentDefaults, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(viewer.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(viewer.mutation(api.settings.renameWorkspace, { workspaceId, name: "Viewer's" })).rejects.toThrow(/Not allowed/);
    const me = await viewer.query(api.settings.me, { workspaceId });
    expect(me).toMatchObject({ role: "viewer", email: "user_viewer@example.com", defaultResearchMode: "thorough" });
    await viewer.mutation(api.settings.setMyPreferences, { workspaceId, theme: "dark", reportReady: false });
    expect(await viewer.query(api.settings.me, { workspaceId })).toMatchObject({
      theme: "dark",
      notifications: { checkInsDue: true, questionsWaiting: true, reportReady: false, email: true },
    });
  });
});

describe("settings: owners", () => {
  it("never demotes or removes the last owner", async () => {
    const { workspaceId, owner, ownerId } = await team();
    await expect(owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerId, role: "admin" })).rejects.toThrow(/at least one owner/);
    await expect(owner.mutation(api.settings.removeMember, { workspaceId, memberId: ownerId })).rejects.toThrow(/at least one owner/);
  });

  it("lets an owner step down once another owner exists", async () => {
    const { t, workspaceId, owner, admin, ownerId, adminId } = await team();
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: adminId, role: "owner" });
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerId, role: "admin" });
    const people = await admin.query(api.settings.people, { workspaceId });
    expect(people.canManage).toBe(true);
    expect(people.members.filter((row) => row.role === "owner")).toHaveLength(1);
    await expect(admin.mutation(api.settings.removeMember, { workspaceId, memberId: adminId })).rejects.toThrow(/at least one owner/);
    expect((await auditActions(t, workspaceId)).filter((a) => a === "member.role_changed")).toHaveLength(2);
  });

  it("removes a member, who then loses access, and audits it", async () => {
    const { t, workspaceId, owner, viewer, viewerId } = await team();
    await owner.mutation(api.settings.removeMember, { workspaceId, memberId: viewerId });
    await expect(viewer.query(api.settings.me, { workspaceId })).rejects.toThrow();
    const people = await owner.query(api.settings.people, { workspaceId });
    expect(people.members.map((row) => row.role)).toEqual(["owner", "admin"]);
    expect(await auditActions(t, workspaceId)).toContain("member.removed");
    // Invited back, the same row returns, so the workspace never holds two rows for one person.
    const again = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_viewer@example.com", role: "viewer" });
    await viewer.mutation(api.workspace.acceptInvite, { token: again.token });
    expect((await viewer.query(api.settings.me, { workspaceId })).memberId).toBe(viewerId);
  });
});

describe("settings: invites", () => {
  it("shows pending invites, lets an owner cancel one, and refuses the cancelled link", async () => {
    const { t, workspaceId, owner, viewer } = await team();
    const sent = await owner.mutation(api.workspace.invite, { workspaceId, email: "New@Example.com", role: "viewer" });
    let people = await owner.query(api.settings.people, { workspaceId });
    expect(people.invites).toEqual([expect.objectContaining({ email: "new@example.com", role: "viewer" })]);
    await expect(viewer.mutation(api.settings.cancelInvite, { workspaceId, invitationId: sent.invitationId })).rejects.toThrow(/Not allowed/);
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
    expect(people.members.find((row) => row.role === "viewer")).toMatchObject({ email: "user_viewer@example.com", name: "user_viewer" });
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
    const { workspaceId, owner, admin, viewer } = await withGrant();
    const log = await owner.query(api.settings.supportLog, { workspaceId });
    expect(log.on).toBe(true);
    expect(log.grants).toEqual([
      expect.objectContaining({ who: "Vistrial support", staffRef: "abc123", reason: "Customer asked for help with a report", open: true, opens: 1 }),
    ]);
    await expect(admin.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    await expect(viewer.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not allowed/);
    expect((await admin.query(api.settings.people, { workspaceId })).supportAccess).toBe(true);
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
    expect(await auditActions(t, workspaceId)).toEqual(expect.arrayContaining(["workspace.service_team_access_off", "workspace.service_team_access_on"]));
  });
});

describe("settings: defaults and preferences", () => {
  it("stores the default research quality for every member's chat box", async () => {
    const { workspaceId, owner, viewer } = await team();
    expect((await viewer.query(api.settings.me, { workspaceId })).defaultResearchMode).toBe("thorough");
    await owner.mutation(api.settings.setDefaultResearchMode, { workspaceId, mode: "fast" });
    expect((await viewer.query(api.settings.me, { workspaceId })).defaultResearchMode).toBe("fast");
    expect((await owner.query(api.settings.agentDefaults, { workspaceId })).defaultResearchMode).toBe("fast");
  });

  it("keeps notification choices per member", async () => {
    const { workspaceId, owner, admin } = await team();
    await owner.mutation(api.settings.setMyPreferences, { workspaceId, checkInsDue: false, theme: "system" });
    expect((await owner.query(api.settings.me, { workspaceId })).notifications.checkInsDue).toBe(false);
    expect((await owner.query(api.settings.me, { workspaceId })).theme).toBe("system");
    expect((await admin.query(api.settings.me, { workspaceId })).notifications.checkInsDue).toBe(true);
    expect((await admin.query(api.settings.me, { workspaceId })).theme).toBeNull();
    await owner.mutation(api.settings.setMyPreferences, { workspaceId, questionsWaiting: false });
    expect((await owner.query(api.settings.me, { workspaceId })).notifications).toEqual({ checkInsDue: false, questionsWaiting: false, reportReady: true, email: true });
  });
});

describe("settings: isolation", () => {
  it("never reads or changes another workspace", async () => {
    const { t, workspaceId, owner, viewerId } = await team();
    const otherId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_other" });
    const other = t.withIdentity(identity("user_other"));
    await expect(other.query(api.settings.people, { workspaceId })).rejects.toThrow(/Not found/);
    await expect(other.query(api.settings.supportLog, { workspaceId })).rejects.toThrow(/Not found/);
    await expect(other.mutation(api.settings.renameWorkspace, { workspaceId, name: "Taken" })).rejects.toThrow(/Not found/);
    // An owner of one workspace cannot reach a member or invite of another through their own.
    await expect(other.mutation(api.settings.removeMember, { workspaceId: otherId, memberId: viewerId })).rejects.toThrow(/Not found/);
    await expect(other.mutation(api.settings.setMemberRole, { workspaceId: otherId, memberId: viewerId, role: "owner" })).rejects.toThrow(/Not found/);
    const sent = await owner.mutation(api.workspace.invite, { workspaceId, email: "z@example.com", role: "viewer" });
    await expect(other.mutation(api.settings.cancelInvite, { workspaceId: otherId, invitationId: sent.invitationId })).rejects.toThrow(/Not found/);
    expect((await owner.query(api.settings.people, { workspaceId })).invites).toHaveLength(1);
    expect((await other.query(api.settings.people, { workspaceId: otherId })).members).toHaveLength(1);
  });
});
