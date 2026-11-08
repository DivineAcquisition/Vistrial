/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

describe("notify me when a planned agent is live", () => {
  it("records and clears each person's choice, only for planned agents", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
    const owner = t.withIdentity(identity("user_owner"));
    expect(await owner.query(api.agentWaitlist.mine, { workspaceId, agentSlug: "sales-conversion" })).toEqual({ joined: false });
    expect(await owner.mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "sales-conversion" })).toEqual({ joined: true });
    expect(await owner.query(api.agentWaitlist.mine, { workspaceId, agentSlug: "sales-conversion" })).toEqual({ joined: true });
    expect(await owner.mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "sales-conversion" })).toEqual({ joined: false });
    await expect(owner.mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "growth-architect" })).rejects.toThrow(/planned/);
    await expect(t.withIdentity(identity("user_stranger")).mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "retention" })).rejects.toThrow();
  });
});
