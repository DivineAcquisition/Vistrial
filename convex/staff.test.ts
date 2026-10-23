/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_FOUND } from "./lib/errors";
import * as staffFns from "./staff";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

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

describe("staff access", () => {
  it("refuses every staff function when the token has no secondFactor claim", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const owner = t.withIdentity(person("owner-a", "owner-a@example.com"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff-1", role: "platform_admin" });

    expect(Object.keys(staffFns).sort()).toEqual(["enter", "grant", "listMine"]);

    const bare = t.withIdentity(person("staff-1", "staff@example.com"));
    const stringClaim = t.withIdentity(person("staff-1", "staff@example.com", { secondFactor: "true" }));
    for (const caller of [bare, stringClaim]) {
      await expect(caller.mutation(api.staff.grant, { workspaceId, reason: "Helping the owner", hours: 4 })).rejects.toThrow(
        NOT_FOUND,
      );
      await expect(caller.mutation(api.staff.enter, { workspaceId })).rejects.toThrow(NOT_FOUND);
      await expect(caller.query(api.staff.listMine, {})).rejects.toThrow(NOT_FOUND);
    }

    const ready = t.withIdentity(person("staff-1", "staff@example.com", { secondFactor: true }));
    const missing = await t.run(async (ctx) => {
      const id = await ctx.db.insert("workspaces", {
        name: "Gone",
        slug: "gone-staff",
        timezone: "America/New_York",
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    await expect(ready.mutation(api.staff.enter, { workspaceId })).rejects.toThrow(NOT_FOUND);
    await expect(ready.mutation(api.staff.enter, { workspaceId: missing })).rejects.toThrow(NOT_FOUND);
    await expect(ready.mutation(api.staff.grant, { workspaceId: missing, reason: "Helping the owner", hours: 4 })).rejects.toThrow(
      NOT_FOUND,
    );

    await ready.mutation(api.staff.grant, { workspaceId, reason: "Helping the owner", hours: 4 });
    await expect(ready.mutation(api.staff.enter, { workspaceId })).resolves.toMatchObject({ name: "Alpha" });
    const listed = await ready.query(api.staff.listMine, {});
    expect(listed).toHaveLength(1);
    const openGrants = await t.run(async (ctx) => ctx.db.query("staffAccessGrants").take(5));
    await t.run(async (ctx) => {
      await ctx.db.patch(openGrants[0]!._id, { expiresAt: Date.now() - 1000 });
    });
    await expect(ready.mutation(api.staff.enter, { workspaceId })).rejects.toThrow(NOT_FOUND);
    await expect(ready.query(api.staff.listMine, {})).resolves.toEqual([]);

    const audit = await t.run(async (ctx) => ctx.db.query("auditLog").take(50));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["staff.enrolled", "staff.grant_created", "staff.entered"]));
    expect(audit.every((row) => row.count === undefined || typeof row.count === "number")).toBe(true);
  });

  it("enrolls, removes, and rotates a platform admin with an audit row each time", async () => {
    const t = convexTest(schema, modules);
    const enrolled = await t.mutation(internal.staffAdmin.enroll, { userId: "admin-1", role: "platform_admin" });
    expect(enrolled).toBeTruthy();
    await t.mutation(internal.staffAdmin.rotate, {
      fromUserId: "admin-1",
      toUserId: "admin-2",
      role: "platform_admin",
    });
    const rows = await t.run(async (ctx) => ctx.db.query("staff").take(10));
    expect(rows.map((row) => row.userId)).toEqual(["admin-2"]);
    await t.mutation(internal.staffAdmin.remove, { userId: "admin-2" });
    const after = await t.run(async (ctx) => ctx.db.query("staff").take(10));
    expect(after).toEqual([]);
    const audit = await t.run(async (ctx) => ctx.db.query("auditLog").take(20));
    const actions = audit.map((row) => row.action);
    expect(actions.filter((action) => action === "staff.enrolled")).toHaveLength(2);
    expect(actions.filter((action) => action === "staff.removed")).toHaveLength(2);
  });
});
