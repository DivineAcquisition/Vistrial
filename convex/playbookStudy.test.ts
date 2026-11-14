/**
 * @vitest-environment edge-runtime
 *
 * Playbook study (Dealmaker): sources gathered in code, one model step, every item checked against its
 * source's own words, and what passes filed into the Playbook as an inference with its source.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ScriptedModel } from "./lib/toolRouter";
import { DOCTRINE_PROMPT } from "./skills/dealmaker/doctrine";
import { SYSTEM } from "./skills/playbookStudy";
import type { GatherRecord } from "./skills/playbookStudy/shapes";
import { checkExtracted } from "./skills/playbookStudy/tools";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

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

const SCRIPT = "Open: confirm the time and the goal of the call.\nOur Growth Sprint is $4,500 a month for twelve weeks.\nIf they say it's too expensive, tie the fee to one extra patient a month.";
const CALL = "Lead: Honestly it's more than we budgeted for this quarter.\nNora: What would one extra patient a month be worth to you?";

const gathered: GatherRecord = {
  sources: [
    { id: "s1", type: "text", ref: "s1", label: "Sales script", text: SCRIPT, cut: false },
    { id: "s2", type: "transcript", ref: "t1", label: "Call with Aster", text: CALL, cut: false },
  ],
  missing: [],
  existing: ["Growth Sprint"],
};

const item = (input: Partial<Record<string, string>>) => ({ folder: "offer", kind: "price", stage: "", tag: "", title: "Growth Sprint price", body: "$4,500 a month.", sourceId: "s1", quote: "$4,500 a month for twelve weeks", ...input });

describe("checking what the model proposed", () => {
  it("keeps an item that fits the Playbook and quotes its source; drops the rest with the reason", () => {
    const result = checkExtracted(
      [
        item({}),
        item({ title: "Invented guarantee", kind: "guarantee", quote: "results guaranteed or your money back" }),
        item({ title: "Wrong source", sourceId: "s9" }),
        item({ title: "No folder fit", folder: "closing" }),
        item({ title: "Growth Sprint", kind: "package", quote: "Our Growth Sprint is $4,500" }),
        item({ folder: "objections", kind: "objection", tag: "money", title: "More than we budgeted", body: "Budget timing.", sourceId: "s2", quote: "it’s   MORE than we budgeted" }),
        item({ folder: "prospect", kind: "scriptStep", stage: "", title: "Confirm the time", quote: "confirm the time and the goal" }),
      ],
      gathered,
    );
    expect(result.items.map((row) => [row.title, row.accepted, row.why])).toEqual([
      ["Growth Sprint price", true, ""],
      ["Invented guarantee", false, "Its quote is not in the source."],
      ["Wrong source", false, "It cites no source that was read."],
      ["No folder fit", false, "That kind of item does not belong in this folder."],
      ["Growth Sprint", false, "The Playbook already has it."],
      // Quotes match however the model spaced or curled them.
      ["More than we budgeted", true, ""],
      ["Confirm the time", false, "A script step needs its call stage."],
    ]);
    expect(result.accepted).toBe(2);
  });

  it("starts from the doctrine", () => {
    expect(SYSTEM.startsWith(DOCTRINE_PROMPT)).toBe(true);
  });
});

function script() {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    if (!input.startsWith("File what these sources teach")) throw new Error(`unscripted call: ${input.slice(0, 40)}`);
    // Calls are gathered first (s1), then pasted text (s2).
    return {
      text: JSON.stringify({
        items: [
          item({ sourceId: "s2" }),
          item({ folder: "objections", kind: "objection", tag: "money", title: "More than we budgeted", body: "Budget timing.", sourceId: "s1", quote: "more than we budgeted for this quarter" }),
          item({ title: "Made up", kind: "guarantee", sourceId: "s2", quote: "double your patients in 30 days" }),
        ],
      }),
    };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function setup(live = true) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  if (live) {
    await t.run(async (ctx) => {
      const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
      await ctx.db.patch(agent._id, { status: "live" });
      for (const workKind of ["classify", "research", "write"]) {
        const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
        const route = { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" };
        if (row) await ctx.db.patch(row._id, route);
        else await ctx.db.insert("modelRoutes", route);
      }
    });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  }
  const transcriptId = await t.run((ctx) =>
    ctx.db.insert("callTranscripts", { workspaceId, title: "Call with Aster", tool: "Fathom", text: CALL, words: 20, addedBy: "nora", createdAt: NOW, consentConfirmedAt: NOW, agents: [AGENT] }),
  );
  const strategistOnly = await t.run((ctx) =>
    ctx.db.insert("callTranscripts", { workspaceId, title: "Strategist call", tool: "Fathom", text: "Hello.", words: 1, addedBy: "nora", createdAt: NOW, consentConfirmedAt: NOW }),
  );
  return { t, owner, workspaceId, transcriptId, strategistOnly };
}

async function finish(s: Awaited<ReturnType<typeof setup>>, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  return status;
}

describe("a Playbook study, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("reads a call and pasted text, files only what quotes its source, as an inference with its source", async () => {
    const inputs = script();
    const s = await setup();
    const { runId } = await s.owner.mutation(api.playbook.study, { workspaceId: s.workspaceId, transcriptIds: [s.transcriptId], texts: [{ label: "Sales script", text: SCRIPT }] });
    expect(await finish(s, runId)).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED");

    const view = await s.owner.query(api.playbook.view, { workspaceId: s.workspaceId });
    const offer = view.folders.find((row) => row.id === "offer")!.items;
    const objections = view.folders.find((row) => row.id === "objections")!.items;
    expect(offer).toHaveLength(1);
    expect(offer[0]).toMatchObject({ title: "Growth Sprint price", basisLabel: "Inference", quote: "$4,500 a month for twelve weeks", source: { type: "upload", label: "Sales script" } });
    expect(objections[0]).toMatchObject({ tag: "money", basisLabel: "Inference", source: { type: "call", label: "Call with Aster", ref: s.transcriptId } });
    expect(view.studies[0]).toMatchObject({ status: "done", filed: 2, dropped: 1, sources: ["Call with Aster", "Sales script"] });
    expect(view.readable.transcripts.map((row) => row.title)).toEqual(["Call with Aster"]);
  });

  it("refuses a call not shared with Dealmaker, an empty request, and any study while Dealmaker is not live", async () => {
    const s = await setup();
    expect(await message(s.owner.mutation(api.playbook.study, { workspaceId: s.workspaceId, transcriptIds: [s.strategistOnly] }))).toBe("That call is not shared with Dealmaker.");
    expect(await message(s.owner.mutation(api.playbook.study, { workspaceId: s.workspaceId }))).toBe("Choose a call, paste some text, or include the offer analysis.");
    expect(await message(s.owner.mutation(api.playbook.study, { workspaceId: s.workspaceId, offerAnalysis: true }))).toBe("There is no approved offer analysis to read.");

    const planned = await setup(false);
    await expect(planned.owner.mutation(api.playbook.study, { workspaceId: planned.workspaceId, texts: [{ label: "Script", text: SCRIPT }] })).rejects.toThrow();
    const studies = await planned.t.run((ctx) => ctx.db.query("playbookStudies").collect());
    expect(studies).toHaveLength(0);
  });
});
