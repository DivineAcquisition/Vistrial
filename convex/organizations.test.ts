/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { canWork, isAdmin, isOwner, roleOf } from "./lib/roles";
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

type Tester = ReturnType<typeof convexTest>;
const newTest = () => convexTest(schema, modules);

/** An agency owner with one organization, and a helper that brings a person in through a real invite. */
async function agency(t: Tester, ownerId = "nora", name = "Northlight Growth") {
  const owner = t.withIdentity(person(ownerId));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  const accountId = (await t.run((ctx) => ctx.db.get(workspaceId)))!.accountId!;
  const join = async (subject: string, role: "admin" | "member" | "viewer", grants?: { workspaceId: Id<"workspaces">; role: "admin" | "member" | "viewer" }[], from = workspaceId) => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId: from, email: `${subject}@example.com`, role, grants });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  return { owner, workspaceId, accountId, join };
}

describe("the four roles", () => {
  it("reads the old words as the new ones, and an unknown word as the least", () => {
    expect(roleOf("manager")).toBe("admin");
    expect(roleOf("rep")).toBe("member");
    expect(roleOf("owner")).toBe("owner");
    expect(roleOf("something else")).toBe("viewer");
    expect([isOwner("owner"), isOwner("manager")]).toEqual([true, false]);
    expect([isAdmin("owner"), isAdmin("manager"), isAdmin("admin"), isAdmin("rep"), isAdmin("viewer")]).toEqual([true, true, true, false, false]);
    expect([canWork("rep"), canWork("member"), canWork("viewer")]).toEqual([true, true, false]);
  });

  it("lets a Member work and not approve, and keeps a Viewer to reading", async () => {
    const t = newTest();
    await t.mutation(internal.seed.agents, {});
    const { owner, workspaceId, join } = await agency(t);
    const admin = await join("ada", "admin");
    const member = await join("milo", "member");
    const viewer = await join("vera", "viewer");
    const project = { title: "Coaching offers", objective: "What do coaches charge for group programs?", market: "Business coaching", geography: "US", competitors: [], platforms: ["web" as const], suppliedUrls: [] };

    // A Member starts work. A Viewer does not.
    const projectId = await member.mutation(api.research.createProject, { workspaceId, ...project });
    expect(await message(viewer.mutation(api.research.createProject, { workspaceId, ...project }))).toBe(NOT_ALLOWED);
    expect((await viewer.query(api.research.getProject, { workspaceId, projectId })).title).toBe("Coaching offers");

    // Approving is for Owners and Admins.
    const assetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("assets", { workspaceId, kind: "researchReport", title: "Report", status: "draft", currentVersion: 1, createdAt: Date.now() });
      await ctx.db.insert("assetVersions", { workspaceId, assetId: id, version: 1, body: "{}", createdBy: "agent" });
      return id;
    });
    expect(await message(member.mutation(api.assets.approve, { workspaceId, assetId }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.assets.approve, { workspaceId, assetId }))).toBe(NOT_ALLOWED);
    await admin.mutation(api.assets.approve, { workspaceId, assetId });

    // Running the organization: Admin yes, Member no. Vistrial support access stays with the Owner.
    await admin.mutation(api.settings.renameWorkspace, { workspaceId, name: "Northlight Growth Co" });
    expect(await message(member.mutation(api.settings.renameWorkspace, { workspaceId, name: "Mine" }))).toBe(NOT_ALLOWED);
    expect(await message(member.query(api.settings.people, { workspaceId }))).toBe(NOT_ALLOWED);
    expect(await message(admin.mutation(api.settings.setSupportAccess, { workspaceId, on: false }))).toBe(NOT_ALLOWED);
    await owner.mutation(api.settings.setSupportAccess, { workspaceId, on: false });

    // Everyone keeps their own choices, a Viewer included.
    await viewer.mutation(api.settings.setMyPreferences, { workspaceId, theme: "dark" });
    expect((await viewer.query(api.settings.me, { workspaceId })).role).toBe("viewer");

    // Actions go through the same door.
    expect(await message(viewer.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" }))).toBe(NOT_ALLOWED);
    expect(await message(member.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" }))).toBe(NOT_ALLOWED);
    expect(await message(t.withIdentity(person("stranger")).action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" }))).toBe(NOT_FOUND);
  });

  it("still treats a manager row as an Admin and a rep row as a Member before the backfill has run", async () => {
    const t = newTest();
    await t.mutation(internal.seed.agents, {});
    const { workspaceId } = await agency(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId, userId: "old-manager", role: "manager", displayName: "Old Manager", active: true });
      await ctx.db.insert("members", { workspaceId, userId: "old-rep", role: "rep", displayName: "Old Rep", active: true });
    });
    const manager = t.withIdentity(person("old-manager"));
    const rep = t.withIdentity(person("old-rep"));
    expect((await manager.query(api.workspace.shell, { workspaceId })).role).toBe("admin");
    expect((await rep.query(api.workspace.shell, { workspaceId })).role).toBe("member");
    expect((await manager.query(api.settings.people, { workspaceId })).members.map((row) => row.role).sort()).toEqual(["admin", "member", "owner"]);
    expect(await message(rep.query(api.settings.people, { workspaceId }))).toBe(NOT_ALLOWED);
    // A browser tab opened before the change still sends the old words.
    const sent = await manager.mutation(api.workspace.invite, { workspaceId, email: "late@example.com", role: "rep" });
    await t.withIdentity(person("late")).mutation(api.workspace.acceptInvite, { token: sent.token });
    const late = await t.run((ctx) => ctx.db.query("members").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", "late")).unique());
    expect(late?.role).toBe("member");
  });
});

describe("accounts and organizations", () => {
  it("makes an account with a person's first organization, billed under that organization's id", async () => {
    const t = newTest();
    const { owner, workspaceId, accountId } = await agency(t);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account).toMatchObject({ name: "Northlight Growth", billingCustomerId: workspaceId, createdBy: "nora" });
    const mine = await owner.query(api.organizations.mine, {});
    expect(mine.organizations).toEqual([expect.objectContaining({ workspaceId, name: "Northlight Growth", role: "owner", accountId })]);
    expect(mine.accounts).toEqual([expect.objectContaining({ accountId, owner: true, organizations: 1, canAdd: true })]);
    // One organization and nobody else: exactly what a workspace was.
    expect(await owner.query(api.workspace.mine, {})).toMatchObject({ workspaceId, role: "owner" });
  });

  it("lets only an Owner of the account add an organization, and every Owner is an Owner in it", async () => {
    const t = newTest();
    const { owner, workspaceId, accountId, join } = await agency(t);
    const admin = await join("ada", "admin");
    const coOwner = await join("omar", "admin");
    const omar = (await owner.query(api.settings.people, { workspaceId })).members.find((row) => row.name === "omar")!;
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: omar.id, role: "owner" });

    expect(await message(admin.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" }))).toContain("Only an Owner");
    expect(await message(t.withIdentity(person("stranger")).mutation(api.organizations.create, { accountId, name: "Theirs" }))).toBe(NOT_FOUND);
    expect(await message(owner.mutation(api.organizations.create, { accountId, name: "  " }))).toContain("Name the organization");
    expect(await message(owner.mutation(api.organizations.create, { accountId, name: "northlight growth" }))).toContain("already have");

    const second = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
    expect((await owner.query(api.workspace.shell, { workspaceId: second })).role).toBe("owner");
    expect((await coOwner.query(api.workspace.shell, { workspaceId: second })).role).toBe("owner");
    // It is a full organization of its own: settings, pipeline and agents, and it shares the account.
    const made = await t.run(async (ctx) => ({
      workspace: await ctx.db.get(second),
      settings: await ctx.db.query("workspaceSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", second)).unique(),
      accounts: (await ctx.db.query("accounts").collect()).length,
    }));
    expect(made.workspace?.accountId).toBe(accountId);
    expect(made.settings).not.toBeNull();
    expect(made.accounts).toBe(1);
    expect((await owner.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth", "Northlight Coaching"]);
  });

  it("keeps another account out with the same not-found as a missing organization", async () => {
    const t = newTest();
    const a = await agency(t, "nora", "Northlight Growth");
    const b = await agency(t, "ben", "Beacon Coaching");
    expect(await message(a.owner.query(api.workspace.shell, { workspaceId: b.workspaceId }))).toBe(NOT_FOUND);
    expect(await message(a.owner.query(api.settings.people, { workspaceId: b.workspaceId }))).toBe(NOT_FOUND);
    expect(await message(a.owner.mutation(api.settings.renameWorkspace, { workspaceId: b.workspaceId, name: "Taken" }))).toBe(NOT_FOUND);
    expect(await message(a.owner.mutation(api.organizations.create, { accountId: b.accountId, name: "Planted" }))).toBe(NOT_FOUND);
    expect(await message(a.owner.mutation(api.organizations.renameAccount, { accountId: b.accountId, name: "Taken" }))).toBe(NOT_FOUND);
    // An invite cannot reach into another account's organization.
    expect(await message(a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "x@example.com", role: "member", grants: [{ workspaceId: b.workspaceId, role: "admin" }] }))).toBe(NOT_FOUND);
    expect((await a.owner.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth"]);
    expect((await a.owner.query(api.organizations.mine, {})).accounts).toHaveLength(1);
  });

  it("keeps a person out of an organization of the same account that they were not given", async () => {
    const t = newTest();
    const { owner, workspaceId, accountId, join } = await agency(t);
    const second = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
    // Ada runs the first organization only. Being on the account opens nothing else.
    const ada = await join("ada", "admin");
    expect(await message(ada.query(api.workspace.shell, { workspaceId: second }))).toBe(NOT_FOUND);
    expect(await message(ada.query(api.settings.people, { workspaceId: second }))).toBe(NOT_FOUND);
    expect(await message(ada.mutation(api.settings.renameWorkspace, { workspaceId: second, name: "Hers" }))).toBe(NOT_FOUND);
    expect((await ada.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth"]);
    expect((await ada.query(api.settings.people, { workspaceId })).grantable).toEqual([]);
    // She cannot hand out an organization she does not run herself.
    expect(await message(ada.mutation(api.workspace.invite, { workspaceId, email: "y@example.com", role: "viewer", grants: [{ workspaceId: second, role: "admin" }] }))).toBe(NOT_FOUND);

    // One invite, two organizations, a role in each.
    const milo = await join("milo", "member", [{ workspaceId: second, role: "viewer" }]);
    expect((await milo.query(api.workspace.shell, { workspaceId })).role).toBe("member");
    expect((await milo.query(api.workspace.shell, { workspaceId: second })).role).toBe("viewer");
    expect((await milo.query(api.organizations.mine, {})).organizations.map((row) => [row.name, row.role])).toEqual([
      ["Northlight Growth", "member"],
      ["Northlight Coaching", "viewer"],
    ]);
    expect((await owner.query(api.settings.people, { workspaceId })).grantable).toEqual([{ workspaceId: second, name: "Northlight Coaching" }]);

    // Removing him from one leaves the other alone.
    const row = (await owner.query(api.settings.people, { workspaceId })).members.find((member) => member.name === "milo")!;
    await owner.mutation(api.settings.removeMember, { workspaceId, memberId: row.id });
    expect(await message(milo.query(api.workspace.shell, { workspaceId }))).toBe(NOT_FOUND);
    expect((await milo.query(api.workspace.shell, { workspaceId: second })).role).toBe("viewer");
  });

  it("treats Owner as a role on the whole account", async () => {
    const t = newTest();
    const { owner, workspaceId, accountId, join } = await agency(t);
    const second = await owner.mutation(api.organizations.create, { accountId, name: "Northlight Coaching" });
    const ada = await join("ada", "admin");
    const memberId = (await owner.query(api.settings.people, { workspaceId })).members.find((row) => row.name === "ada")!.id;
    const ownerMemberId = (await owner.query(api.settings.people, { workspaceId })).me;

    // The only Owner cannot step down or be removed.
    expect(await message(owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: ownerMemberId, role: "admin" }))).toContain("at least one owner");
    expect(await message(owner.mutation(api.settings.removeMember, { workspaceId, memberId: ownerMemberId }))).toContain("at least one owner");
    // An Admin cannot make an Owner.
    expect(await message(ada.mutation(api.settings.setMemberRole, { workspaceId, memberId, role: "owner" }))).toContain("Only an Owner");

    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId, role: "owner" });
    expect((await ada.query(api.workspace.shell, { workspaceId: second })).role).toBe("owner");
    expect((await ada.query(api.organizations.mine, {})).accounts[0]).toMatchObject({ owner: true });

    // Lowering her here leaves her an Admin in the other, and no longer an Owner of the account.
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId, role: "member" });
    expect((await ada.query(api.workspace.shell, { workspaceId })).role).toBe("member");
    expect((await ada.query(api.workspace.shell, { workspaceId: second })).role).toBe("admin");
    expect((await ada.query(api.organizations.mine, {})).accounts[0]).toMatchObject({ owner: false, canAdd: false });
    expect(await message(ada.mutation(api.organizations.create, { accountId, name: "Hers" }))).toContain("Only an Owner");
  });
});

describe("no write for a Viewer, no read for a stranger", () => {
  /** A Viewer's own choices, and personal collections that only they see. Everything else must refuse. */
  const SELF = new Set(["settings:rememberMe", "settings:setMyPreferences", "agentWaitlist:toggle", "collections:create", "collections:rename", "collections:remove", "collections:addItem", "collections:removeItem", "briefing:markSeen", "home:visit", "personalNotes:add", "personalNotes:update", "personalNotes:remove"]);

  type Registered = { isPublic?: boolean; isMutation?: boolean; isQuery?: boolean; exportArgs?: () => string; _handler?: (ctx: MutationCtx, args: unknown) => Promise<unknown> };

  async function publicFunctions(kind: "isMutation" | "isQuery") {
    const out: { name: string; fn: Registered }[] = [];
    for (const [path, load] of Object.entries(modules)) {
      if (path.includes("/_generated/")) continue;
      const loaded = (await load()) as Record<string, unknown>;
      for (const [name, value] of Object.entries(loaded)) {
        if (typeof value !== "function") continue;
        const fn = value as Registered;
        if (!fn.isPublic || !fn[kind] || !fn._handler) continue;
        if (!JSON.parse(fn.exportArgs?.() ?? "{}").value?.workspaceId) continue;
        out.push({ name: `${path.replace(/^\.\//, "").replace(/\.ts$/, "")}:${name}`, fn });
      }
    }
    return out;
  }

  async function codeOf(run: Promise<unknown>) {
    try {
      await run;
      return "ran";
    } catch (error) {
      return (error as { data?: { code?: string } }).data?.code ?? `threw: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`;
    }
  }

  it("refuses every organization mutation for a Viewer, whatever is added later", async () => {
    const t = newTest();
    const { workspaceId, join } = await agency(t);
    await join("vera", "viewer");
    const mutations = await publicFunctions("isMutation");
    // The sweep must be looking at the real surface, not an empty list.
    expect(mutations.length).toBeGreaterThan(80);
    const wrong: string[] = [];
    await t.withIdentity(person("vera")).run(async (ctx) => {
      for (const { name, fn } of mutations) {
        if (SELF.has(name)) continue;
        const code = await codeOf(fn._handler!(ctx as unknown as MutationCtx, { workspaceId }));
        // Vistrial staff functions take a workspace too; to anyone who is not staff they do not exist.
        const expected = name.startsWith("staff:") ? "not_found" : "not_allowed";
        if (code !== expected) wrong.push(`${name} → ${code}`);
      }
    });
    expect(wrong).toEqual([]);
    // Every name on the allow-list is a real function, so the list cannot hide a typo.
    expect([...SELF].filter((name) => !mutations.some((row) => row.name === name))).toEqual([]);
  });

  it("refuses every organization query and mutation for someone who is not a member, as not found", async () => {
    const t = newTest();
    const { workspaceId } = await agency(t);
    const other = await agency(t, "ben", "Beacon Coaching");
    void other;
    const functions = [...(await publicFunctions("isMutation")), ...(await publicFunctions("isQuery"))];
    expect(functions.length).toBeGreaterThan(150);
    const wrong: string[] = [];
    await t.withIdentity(person("ben")).run(async (ctx) => {
      for (const { name, fn } of functions) {
        const code = await codeOf(fn._handler!(ctx as unknown as MutationCtx, { workspaceId }));
        if (code !== "not_found") wrong.push(`${name} → ${code}`);
      }
    });
    expect(wrong).toEqual([]);
  });
});

describe("moving existing workspaces onto accounts", () => {
  /** A workspace as it was stored before accounts existed: no account, the old role words. */
  async function legacy(t: Tester, name: string, prefix: string) {
    return t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", { name, slug: prefix, timezone: "UTC", status: "active", createdAt: 1 });
      await ctx.db.insert("members", { workspaceId, userId: `${prefix}-owner`, role: "owner", displayName: "Owner", email: `${prefix}-owner@example.com`, active: true });
      await ctx.db.insert("members", { workspaceId, userId: `${prefix}-manager`, role: "manager", displayName: "Manager", active: true });
      await ctx.db.insert("members", { workspaceId, userId: `${prefix}-rep`, role: "rep", displayName: "Rep", active: true });
      await ctx.db.insert("members", { workspaceId, userId: `${prefix}-gone`, role: "rep", displayName: "Gone", active: false, removedAt: 5 });
      await ctx.db.insert("invitations", { workspaceId, email: `${prefix}-new@example.com`, role: "manager", tokenHash: `${prefix}-hash`, expiresAt: Date.now() + 100_000 });
      await ctx.db.insert("workspaceSettings", { workspaceId, setupDone: true, themeDefault: "light" });
      return workspaceId;
    });
  }

  const snapshot = (t: Tester) =>
    t.run(async (ctx) => ({
      accounts: (await ctx.db.query("accounts").collect()).map((row) => ({ name: row.name, customer: row.billingCustomerId })),
      accountMembers: (await ctx.db.query("accountMembers").collect()).map((row) => `${row.userId}:${row.role}:${row.active}`).sort(),
      roles: (await ctx.db.query("members").collect()).map((row) => `${row.userId}:${row.role}`).sort(),
      invites: (await ctx.db.query("invitations").collect()).map((row) => `${row.email}:${row.role}:${Boolean(row.accountId)}`),
    }));

  it("gives each workspace its own account, keeps its billing customer id, rewrites the roles, and changes nothing the second time", async () => {
    const t = newTest();
    const first = await legacy(t, "Northlight Growth", "nl");
    const second = await legacy(t, "Beacon Coaching", "bc");
    expect(await t.query(internal.organizationsMigration.remaining, {})).toEqual({ workspacesWithoutAccount: 2, membersWithOldRole: 6, invitationsWithOldRole: 2 });

    expect(await t.mutation(internal.organizationsMigration.backfillIfNeeded, {})).toBe(true);
    await t.mutation(internal.organizationsMigration.backfill, {});
    const after = await snapshot(t);
    expect(after.accounts).toEqual([
      { name: "Northlight Growth", customer: first },
      { name: "Beacon Coaching", customer: second },
    ]);
    expect(after.roles).toEqual(["bc-gone:member", "bc-manager:admin", "bc-owner:owner", "bc-rep:member", "nl-gone:member", "nl-manager:admin", "nl-owner:owner", "nl-rep:member"]);
    expect(after.accountMembers).toEqual([
      "bc-gone:member:false", "bc-manager:member:true", "bc-owner:owner:true", "bc-rep:member:true",
      "nl-gone:member:false", "nl-manager:member:true", "nl-owner:owner:true", "nl-rep:member:true",
    ]);
    expect(after.invites).toEqual(["nl-new@example.com:admin:true", "bc-new@example.com:admin:true"]);
    expect(await t.query(internal.organizationsMigration.remaining, {})).toEqual({ workspacesWithoutAccount: 0, membersWithOldRole: 0, invitationsWithOldRole: 0 });

    // Again: nothing to do, and running it anyway changes nothing.
    expect(await t.mutation(internal.organizationsMigration.backfillIfNeeded, {})).toBe(false);
    await t.mutation(internal.organizationsMigration.backfill, {});
    expect(await snapshot(t)).toEqual(after);

    // The two never became one account, and each owner opens only their own.
    const nora = t.withIdentity(person("nl-owner"));
    expect((await nora.query(api.organizations.mine, {})).organizations.map((row) => row.name)).toEqual(["Northlight Growth"]);
    expect(await message(nora.query(api.workspace.shell, { workspaceId: second }))).toBe(NOT_FOUND);
    // The invite sent before the change still works, with the new role.
    const invited = t.withIdentity(person("nl-new"));
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("invitations").collect()).find((invite) => invite.email === "nl-new@example.com")!;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("legacy-token"));
      await ctx.db.patch(row._id, { tokenHash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") });
    });
    await invited.mutation(api.workspace.acceptInvite, { token: "legacy-token" });
    expect((await invited.query(api.workspace.shell, { workspaceId: first })).role).toBe("admin");
  });

  it("works for a person before the backfill reaches their workspace", async () => {
    const t = newTest();
    await t.mutation(internal.seed.agents, {});
    const workspaceId = await legacy(t, "Northlight Growth", "nl");
    const owner = t.withIdentity(person("nl-owner"));
    expect((await owner.query(api.workspace.shell, { workspaceId })).role).toBe("owner");
    expect((await owner.query(api.organizations.mine, {})).organizations).toEqual([expect.objectContaining({ workspaceId, role: "owner", accountId: null })]);
    expect((await owner.query(api.settings.people, { workspaceId })).members.map((row) => row.role)).toEqual(["owner", "admin", "member"]);
  });

  it("can put the old words back for a rollback, but not while a Viewer exists", async () => {
    const t = newTest();
    await legacy(t, "Northlight Growth", "nl");
    await t.mutation(internal.organizationsMigration.backfill, {});
    const viewerId = await t.run(async (ctx) => {
      const workspace = (await ctx.db.query("workspaces").collect())[0];
      return ctx.db.insert("members", { workspaceId: workspace._id, userId: "vera", role: "viewer", displayName: "Vera", active: true });
    });
    await expect(t.mutation(internal.organizationsMigration.revertRoles, { confirm: "put the old role words back" })).rejects.toThrow(/Viewer/);
    await t.run((ctx) => ctx.db.patch(viewerId, { role: "member" }));
    await t.mutation(internal.organizationsMigration.revertRoles, { confirm: "put the old role words back" });
    const roles = await t.run(async (ctx) => (await ctx.db.query("members").collect()).map((row) => row.role).sort());
    expect(roles).toEqual(["manager", "owner", "rep", "rep", "rep"]);
  });
});
