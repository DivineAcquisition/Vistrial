/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const wsA = "ws-a";
const wsB = "ws-b";
const ownerA = "user-owner-a";
const memberA = "user-member-a";
const exporterA = "user-exporter-a";
const operatorA = "user-operator-a";
const ownerB = "user-owner-b";
const serviceA = "user-service-a";
const admin = "user-admin";

function workspace(id: string, name: string) {
  return {
    legacyId: id,
    name,
    slug: id,
    timezone: "America/New_York",
    status: "active",
    product: "core",
    isPlatformWorkspace: false,
    row: { id, name, status: "active" },
  };
}

function member(args: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  seat?: string;
  displayName: string;
  canExport?: boolean;
}) {
  return {
    legacyId: args.id,
    workspaceId: args.workspaceId,
    userId: args.userId,
    role: args.role,
    seat: args.seat ?? "customer",
    active: true,
    email: `${args.userId}@example.com`,
    displayName: args.displayName,
    canExport: Boolean(args.canExport),
    canApprove: false,
    row: {
      id: args.id,
      org_id: args.workspaceId,
      user_id: args.userId,
      role: args.role,
      seat: args.seat ?? "customer",
      active: true,
      email: `${args.userId}@example.com`,
      display_name: args.displayName,
      can_export: Boolean(args.canExport),
      surface_access: "operator",
    },
  };
}

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("workspaces", workspace(wsA, "North"));
    await ctx.db.insert("workspaces", workspace(wsB, "South"));
    await ctx.db.insert("members", member({ id: "m-owner-a", workspaceId: wsA, userId: ownerA, role: "owner", displayName: "Owner North" }));
    await ctx.db.insert("members", member({ id: "m-member-a", workspaceId: wsA, userId: memberA, role: "member", displayName: "Member North" }));
    await ctx.db.insert(
      "members",
      member({ id: "m-export-a", workspaceId: wsA, userId: exporterA, role: "member", displayName: "Exporter North", canExport: true }),
    );
    await ctx.db.insert("members", member({ id: "m-op-a", workspaceId: wsA, userId: operatorA, role: "operator", displayName: "Operator North" }));
    await ctx.db.insert("members", member({ id: "m-owner-b", workspaceId: wsB, userId: ownerB, role: "owner", displayName: "Hidden South" }));
    await ctx.db.insert("platformStaff", {
      userId: serviceA,
      role: "service_team",
      active: true,
      templateAccess: false,
      billingAccess: false,
      canCreateWorkspaces: false,
      displayName: "Service",
      email: "service@example.com",
      row: { user_id: serviceA, role: "service_team", active: true, display_name: "Service", email: "service@example.com" },
    });
    await ctx.db.insert("platformStaff", {
      userId: admin,
      role: "platform_admin",
      active: true,
      templateAccess: true,
      billingAccess: true,
      canCreateWorkspaces: true,
      displayName: "Admin",
      email: "admin@example.com",
      row: { user_id: admin, role: "platform_admin", active: true, display_name: "Admin", email: "admin@example.com" },
    });
    await ctx.db.insert("assignments", {
      legacyId: "as-1",
      workspaceId: wsA,
      userId: serviceA,
      active: true,
      row: { id: "as-1", org_id: wsA, user_id: serviceA, ended_at: null },
    });
    await ctx.db.insert(
      "members",
      member({ id: "m-service-a", workspaceId: wsA, userId: serviceA, role: "admin", seat: "staff", displayName: "Service" }),
    );
  });
  return t;
}

function asUser(t: Awaited<ReturnType<typeof seed>>, userId: string) {
  return t.withIdentity({ subject: userId });
}

describe("directory access", () => {
  it("denies a signed-out caller", async () => {
    const t = await seed();
    await expect(t.query(api.directory.listMembers, { workspaceId: wsA })).rejects.toThrow();
    await expect(t.query(api.directory.countMembers, { workspaceId: wsA })).rejects.toThrow();
    await expect(t.query(api.directory.searchMembers, { workspaceId: wsA, term: "North" })).rejects.toThrow();
    await expect(t.query(api.directory.exportMembers, { workspaceId: wsA })).rejects.toThrow();
  });

  it("keeps read, count, search, export, and the live query inside the workspace", async () => {
    const t = await seed();
    const north = asUser(t, ownerA);

    const listed = await north.query(api.directory.listMembers, { workspaceId: wsA });
    expect(listed.map((row) => row.displayName)).toContain("Owner North");
    expect(listed.map((row) => row.displayName)).not.toContain("Hidden South");
    await expect(north.query(api.directory.listMembers, { workspaceId: wsB })).rejects.toThrow();

    expect(await north.query(api.directory.countMembers, { workspaceId: wsA })).toEqual({ count: listed.length });
    await expect(north.query(api.directory.countMembers, { workspaceId: wsB })).rejects.toThrow();

    const found = await north.query(api.directory.searchMembers, { workspaceId: wsA, term: "North" });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((row) => row.workspaceId === wsA)).toBe(true);
    expect(await north.query(api.directory.searchMembers, { workspaceId: wsA, term: "Hidden" })).toEqual([]);
    await expect(north.query(api.directory.searchMembers, { workspaceId: wsB, term: "Hidden" })).rejects.toThrow();

    await expect(asUser(t, memberA).query(api.directory.exportMembers, { workspaceId: wsA })).rejects.toThrow();
    await expect(asUser(t, operatorA).query(api.directory.exportMembers, { workspaceId: wsA })).rejects.toThrow();
    const exported = await asUser(t, exporterA).query(api.directory.exportMembers, { workspaceId: wsA });
    expect(exported.every((row) => row.workspaceId === wsA)).toBe(true);
    expect(exported.map((row) => row.displayName)).not.toContain("Hidden South");

    await t.run(async (ctx) => {
      await ctx.db.insert(
        "members",
        member({ id: "m-new-b", workspaceId: wsB, userId: "user-new-b", role: "member", displayName: "Arrived South" }),
      );
      await ctx.db.insert(
        "members",
        member({ id: "m-new-a", workspaceId: wsA, userId: "user-new-a", role: "member", displayName: "Arrived North" }),
      );
    });
    const live = await north.query(api.directory.listMembers, { workspaceId: wsA });
    expect(live.map((row) => row.displayName)).toContain("Arrived North");
    expect(live.map((row) => row.displayName)).not.toContain("Arrived South");
    expect(live.map((row) => row.displayName)).not.toContain("Hidden South");
  });

  it("limits Service Team to assigned workspaces and platform records to Platform Admin", async () => {
    const t = await seed();
    const service = asUser(t, serviceA);
    expect((await service.query(api.directory.listMembers, { workspaceId: wsA })).length).toBeGreaterThan(0);
    await expect(service.query(api.directory.listMembers, { workspaceId: wsB })).rejects.toThrow();
    await expect(service.query(api.directory.countMembers, { workspaceId: wsB })).rejects.toThrow();
    await expect(service.query(api.directory.listPlatformStaff, {})).rejects.toThrow();

    const platform = asUser(t, admin);
    expect((await platform.query(api.directory.listMembers, { workspaceId: wsB })).map((row) => row.displayName)).toContain("Hidden South");
    expect((await platform.query(api.directory.listPlatformStaff, {})).map((row) => row.userId).sort()).toEqual([admin, serviceA].sort());
    await expect(asUser(t, ownerA).mutation(api.directory.assignStaff, { workspaceId: wsA, userId: serviceA })).rejects.toThrow();
  });

  it("denies the system import without its key", async () => {
    const t = await seed();
    await expect(
      t.mutation(api.importDirectory.importBatch, {
        key: "not-the-key",
        workspaces: [],
        members: [],
        assignments: [],
        invites: [],
        staff: [],
      }),
    ).rejects.toThrow();
  });

  it("does not treat a placed operator label as a workspace operator", async () => {
    const t = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert(
        "members",
        member({
          id: "m-placed",
          workspaceId: wsA,
          userId: "user-placed",
          role: "placed_operator",
          displayName: "Placed",
        }),
      );
    });
    await expect(asUser(t, "user-placed").query(api.directory.listMembers, { workspaceId: wsA })).rejects.toThrow();
  });
});
