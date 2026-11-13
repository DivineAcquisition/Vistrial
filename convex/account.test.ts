/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

async function team() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const owner = t.withIdentity(identity("user_owner"));
  const admin = t.withIdentity(identity("user_admin"));
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "user_admin@example.com", role: "admin" });
  await admin.mutation(api.workspace.acceptInvite, { token: invite.token });
  const people = async () => (await owner.query(api.settings.people, { workspaceId })).members;
  return { t, workspaceId, owner, admin, people };
}

describe("leaving for good", () => {
  it("tells a member which organizations they would leave, and takes them out", async () => {
    const { t, workspaceId, admin, people } = await team();
    const before = await admin.query(api.account.closing, {});
    expect(before.blockedBy).toEqual([]);
    expect(before.leaves).toHaveLength(1);

    expect(await admin.mutation(api.account.leaveEverything, {})).toEqual({ left: 1 });
    expect((await people()).some((row) => row.role === "admin")).toBe(false);
    expect(await admin.query(api.workspace.mine, {})).toBeNull();
    expect(await admin.query(api.account.closing, {})).toEqual({ leaves: [], blockedBy: [] });

    const actions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).collect()).map((row) => row.action),
    );
    expect(actions).toContain("member.left");
  });

  it("is safe to run twice", async () => {
    const { admin } = await team();
    await admin.mutation(api.account.leaveEverything, {});
    expect(await admin.mutation(api.account.leaveEverything, {})).toEqual({ left: 0 });
  });

  it("never leaves an organization without an Owner", async () => {
    const { owner, people } = await team();
    const check = await owner.query(api.account.closing, {});
    expect(check.blockedBy).toHaveLength(1);
    await expect(owner.mutation(api.account.leaveEverything, {})).rejects.toThrow(/only Owner/);
    expect((await people()).some((row) => row.role === "owner")).toBe(true);
  });

  it("lets an Owner go once someone else is an Owner too", async () => {
    const { workspaceId, owner, admin, people } = await team();
    const adminRow = (await people()).find((row) => row.role === "admin")!;
    await owner.mutation(api.settings.setMemberRole, { workspaceId, memberId: adminRow.id, role: "owner" });
    expect((await owner.query(api.account.closing, {})).blockedBy).toEqual([]);
    await owner.mutation(api.account.leaveEverything, {});
    expect(await admin.query(api.workspace.mine, {})).not.toBeNull();
    expect(await owner.query(api.workspace.mine, {})).toBeNull();
  });

  it("needs a signed-in person", async () => {
    const { t } = await team();
    await expect(t.mutation(api.account.leaveEverything, {})).rejects.toThrow();
  });
});
