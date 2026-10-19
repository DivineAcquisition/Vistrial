/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const workspace = {
      name: "North",
      slug: "north",
      timezone: "America/New_York",
      status: "active",
      product: "core",
      isPlatformWorkspace: false,
      row: {},
    };
    await ctx.db.insert("workspaces", { ...workspace, legacyId: "ws-a" });
    await ctx.db.insert("workspaces", { ...workspace, legacyId: "ws-b", name: "South", slug: "south" });
    const member = {
      role: "owner",
      seat: "customer",
      active: true,
      email: "a@example.com",
      displayName: "A",
      canExport: true,
      canApprove: true,
      row: {},
    };
    await ctx.db.insert("members", { ...member, legacyId: "m-a", workspaceId: "ws-a", userId: "user-a" });
    await ctx.db.insert("members", {
      ...member,
      legacyId: "m-op",
      workspaceId: "ws-a",
      userId: "user-op",
      role: "operator",
      canExport: false,
      canApprove: false,
      displayName: "Op",
    });
    await ctx.db.insert("members", { ...member, legacyId: "m-b", workspaceId: "ws-b", userId: "user-b", displayName: "B" });
    await ctx.db.insert("activityRuns", {
      legacyId: "run-a",
      workspaceId: "ws-a",
      agentId: "scribe",
      leadId: "lead-1",
      actorMemberId: "m-op",
      setterMemberId: "m-op",
      status: "working",
      subjectLabel: "North lead",
      row: { id: "run-a", org_id: "ws-a", subject_label: "North lead" },
    });
    await ctx.db.insert("activityRuns", {
      legacyId: "run-other",
      workspaceId: "ws-a",
      agentId: "scribe",
      leadId: "lead-2",
      setterMemberId: "someone-else",
      status: "working",
      subjectLabel: "Not theirs",
      row: { id: "run-other", subject_label: "Not theirs" },
    });
    await ctx.db.insert("activityRuns", {
      legacyId: "run-b",
      workspaceId: "ws-b",
      agentId: "scribe",
      status: "working",
      subjectLabel: "South lead",
      row: { id: "run-b", subject_label: "South lead" },
    });
    await ctx.db.insert("approvalItems", {
      legacyId: "ap-a",
      workspaceId: "ws-a",
      status: "pending",
      assignedMemberId: "m-op",
      title: "North approval",
      row: { id: "ap-a", title: "North approval" },
    });
    await ctx.db.insert("approvalItems", {
      legacyId: "ap-b",
      workspaceId: "ws-b",
      status: "pending",
      title: "South approval",
      row: { id: "ap-b", title: "South approval" },
    });
  });
  return t;
}

describe("live feed access", () => {
  it("hides another workspace and another operator's lead", async () => {
    const t = await seed();
    await expect(t.query(api.live.feed, { workspaceId: "ws-a" })).rejects.toThrow();
    const owner = await t.withIdentity({ subject: "user-a" }).query(api.live.feed, { workspaceId: "ws-a" });
    expect(owner.runs.map((row) => (row as { subject_label: string }).subject_label)).toEqual(
      expect.arrayContaining(["North lead", "Not theirs"]),
    );
    expect(owner.runs.map((row) => (row as { subject_label: string }).subject_label)).not.toContain("South lead");
    await expect(t.withIdentity({ subject: "user-a" }).query(api.live.feed, { workspaceId: "ws-b" })).rejects.toThrow();

    const operator = await t.withIdentity({ subject: "user-op" }).query(api.live.feed, { workspaceId: "ws-a" });
    expect(operator.runs.map((row) => (row as { subject_label: string }).subject_label)).toEqual(["North lead"]);
    expect(operator.approvals.map((row) => (row as { title: string }).title)).toEqual(["North approval"]);
  });
});
