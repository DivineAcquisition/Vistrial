/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { assertDeclared, declaredTools, skillFor } from "./lib/skills";
import { testEcho } from "./skills/testEcho";
import type { StepRecord } from "./skills/types";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function done(index: number, toolSlug?: string): StepRecord {
  return { index, kind: toolSlug ? "tool" : "model", toolSlug, status: "completed", resultCode: "ok", resultId: undefined };
}

describe("skill modules", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("finds a dev-only skill only when dev skills are on, and nothing that is not built", () => {
    expect(skillFor("test-echo", true)?.name).toBe("Test echo");
    expect(skillFor("test-echo", false)).toBeNull();
    expect(skillFor("market-intelligence", true)).toBeNull();
    expect(declaredTools("test-echo", true)).toEqual(["profile.read", "test.echo", "asset.create"]);
    expect(declaredTools("test-echo", false)).toEqual([]);
    expect(() => assertDeclared("test-echo", "asset.addVersion", true)).toThrow("not declared");
  });

  it("names its steps from the steps already taken, then finishes", async () => {
    const context = { db: undefined as never, run: undefined as never };
    expect(await testEcho.nextStep({ ...context, steps: [] })).toEqual({ kind: "tool", toolSlug: "profile.read" });
    const model = await testEcho.nextStep({ ...context, steps: [done(0, "profile.read")] });
    expect(model).toMatchObject({ kind: "model", workKind: "write" });
    expect(model?.kind === "model" && model.input.startsWith("UNTRUSTED CONTENT")).toBe(true);
    expect(await testEcho.nextStep({ ...context, steps: [done(0, "profile.read"), done(1)] })).toEqual({
      kind: "tool",
      toolSlug: "asset.create",
    });
    expect(await testEcho.nextStep({ ...context, steps: [done(0, "profile.read"), done(1), done(2, "asset.create")] })).toBeNull();
    // Every tool it asks for is one it declared.
    expect(testEcho.tools).toEqual(expect.arrayContaining(["profile.read", "asset.create"]));
  });

  it("fails a run cleanly when its dev skill is switched off mid-run", async () => {
    vi.useFakeTimers();
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "owner",
      email: "owner@example.com",
      name: "owner",
      issuer: "https://clerk.vistrial.test",
      tokenIdentifier: "https://clerk.vistrial.test|owner",
    });
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    delete process.env.ALLOW_DEV_SKILLS;
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.status).toBe("failed");
    expect(run.steps.map((step) => step.resultCode)).toEqual(["skill_unavailable"]);
  });
});
