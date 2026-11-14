/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's guided interview: only the gaps are asked, answers become the business's own Playbook items or
 * settings, and no model is called.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { INTERVIEW_TEXT, openQuestions } from "./lib/interview";
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

async function setup(options: { crm?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "vera@example.com", role: "viewer" });
  const viewer = t.withIdentity(person("vera"));
  await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
  if (options.crm) {
    await t.run(async (ctx) => {
      const now = Date.now();
      const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: now + 86_400_000, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", connectedBy: "nora", connectedAt: now, lastSyncAt: now, callsOk: 0, callsFailed: 0 });
      await ctx.db.insert("crmPipelines", { workspaceId, connectionId, seenAt: now, externalId: "pipe1", name: "Sales calls", stages: [{ id: "stBooked", name: "Call booked", position: 1 }, { id: "stNew", name: "New lead", position: 0 }] });
    });
  }
  return { t, owner, viewer, workspaceId };
}

describe("which questions are open", () => {
  it("asks only for the gaps, and never for stages without a CRM", () => {
    const all = openQuestions({ items: [], settings: null, stages: null });
    expect(all).toEqual(["quietDays", "script", "packages", "proof", "voice", "consent"]);
    const some = openQuestions({
      items: [{ kind: "package", stage: undefined }, { kind: "price", stage: undefined }, { kind: "voice", stage: undefined }, ...(["open", "discover", "pitch", "close"] as const).map((stage) => ({ kind: "scriptStep" as const, stage }))],
      settings: { quietDays: 14, stageMeanings: [{ stageRef: "a", name: "A", meaning: "x" }], consentTags: [], channels: ["sms"] },
      stages: [{ ref: "a", name: "A" }],
    });
    expect(some).toEqual(["proof"]);
  });
});

describe("the interview", () => {
  it("reads the CRM's stages first, files answers as the business's own word, and closes each question it answered", async () => {
    const { owner, workspaceId } = await setup({ crm: true });
    let view = await owner.query(api.playbookInterview.view, { workspaceId });
    expect(view.questions.map((row) => row.id)).toEqual(["stages", "quietDays", "script", "packages", "proof", "voice", "consent"]);
    expect(view.stages.map((row) => row.name)).toEqual(["New lead", "Call booked"]);

    await owner.mutation(api.playbookInterview.answerStages, { workspaceId, meanings: [{ stageRef: "stNew", meaning: "Filled in the form." }, { stageRef: "stBooked", meaning: "Picked a time." }] });
    expect(await message(owner.mutation(api.playbookInterview.answerStages, { workspaceId, meanings: [{ stageRef: "nope", meaning: "x" }] }))).toBe(INTERVIEW_TEXT.unknownStage);
    await owner.mutation(api.playbookInterview.answerQuietDays, { workspaceId, days: 21 });
    expect(await message(owner.mutation(api.playbookInterview.answerQuietDays, { workspaceId, days: 9 }))).toBe(INTERVIEW_TEXT.badQuiet);
    await owner.mutation(api.playbookInterview.answerScript, { workspaceId, steps: [{ stage: "open", text: "Confirm the time. Ask what made them book." }, { stage: "pitch", text: "Walk through the Harbor case." }] });
    await owner.mutation(api.playbookInterview.answerPackage, { workspaceId, name: "Growth Sprint", includes: "Twelve weeks of ads.", price: "$4,500 a month" });
    await owner.mutation(api.playbookInterview.answerConsent, { workspaceId, tags: ["opted-in", "opted-in", " sms ok "], channels: ["sms", "email"] });

    view = await owner.query(api.playbookInterview.view, { workspaceId });
    expect(view.questions.map((row) => row.id)).toEqual(["script", "proof", "voice"]);
    expect(view.scriptStages.map((row) => row.id)).toEqual(["discover", "close"]);
    expect(view.quietDays.value).toBe(21);
    expect(view.consentTags).toEqual(["opted-in", "sms ok"]);

    const playbook = await owner.query(api.playbook.view, { workspaceId });
    const offer = playbook.folders.find((row) => row.id === "offer")!.items;
    expect(offer.map((row) => row.title).sort()).toEqual(["Growth Sprint", "Growth Sprint: $4,500 a month"]);
    expect(offer.every((row) => row.basisLabel === "Your data" && row.source.words === "From the interview")).toBe(true);
    const prospect = playbook.folders.find((row) => row.id === "prospect")!.items;
    expect(prospect).toMatchObject([{ kind: "scriptStep", stage: "open", title: "Confirm the time" }]);
  });

  it("lets a question be skipped, keeps Viewers out, and keeps each client's answers to that client", async () => {
    const { owner, viewer, workspaceId } = await setup();
    await owner.mutation(api.playbookInterview.skip, { workspaceId, question: "proof" });
    expect((await owner.query(api.playbookInterview.view, { workspaceId })).questions.map((row) => row.id)).not.toContain("proof");
    expect(await message(viewer.mutation(api.playbookInterview.answerQuietDays, { workspaceId, days: 14 }))).toBe(NOT_ALLOWED);
    expect((await viewer.query(api.playbookInterview.view, { workspaceId })).canEdit).toBe(false);

    const clientId = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Aster Coaching", business: { industry: "Coaching", offer: "Program" } });
    await owner.mutation(api.playbookInterview.answerQuietDays, { workspaceId, clientId, days: 7 });
    expect((await owner.query(api.playbookInterview.view, { workspaceId })).quietDays.value).toBeNull();
    expect((await owner.query(api.playbookInterview.view, { workspaceId, clientId })).quietDays.value).toBe(7);
    // The Viewer is not assigned to Aster.
    expect(await message(viewer.query(api.playbookInterview.view, { workspaceId, clientId }))).toBe(NOT_FOUND);
  });
});
