/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { PLAYBOOK_TEXT, basisFor, checkItem, needsFrom, playbookForSkill } from "./lib/playbook";
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

/** An agency with an Admin, a Member and a Viewer, and two clients; the Member and Viewer see only Aster. */
async function agency() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight Growth" });
  const join = async (subject: string, role: "admin" | "member" | "viewer") => {
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: `${subject}@example.com`, role });
    const joined = t.withIdentity(person(subject));
    await joined.mutation(api.workspace.acceptInvite, { token: invite.token });
    return joined;
  };
  const admin = await join("ada", "admin");
  const member = await join("milo", "member");
  const viewer = await join("vera", "viewer");
  const aster = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Aster Coaching", business: { industry: "Coaching", offer: "Leadership program" } });
  const harbor = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Harbor Dental", business: { industry: "Dentistry", offer: "Implants" } });
  const people = await owner.query(api.settings.people, { workspaceId });
  const idOf = (name: string) => people.members.find((row) => row.name === name)!.id;
  for (const name of ["milo", "vera"]) await owner.mutation(api.clients.setAssigned, { workspaceId, clientId: aster, memberId: idOf(name), assigned: true });
  const outsider = t.withIdentity(person("otto"));
  const otherWorkspace = await outsider.mutation(api.workspace.create, { name: "Elsewhere" });
  return { t, owner, admin, member, viewer, outsider, otherWorkspace, workspaceId, aster, harbor };
}

const pkg = { folder: "offer" as const, kind: "package" as const, title: "Growth Sprint", body: "Twelve weeks.\n\nWeekly calls." };

describe("the Playbook's rules", () => {
  it("files each kind in its own folder, a stage only on a script step, a tag only on an objection", () => {
    expect(checkItem(pkg)).toBeNull();
    expect(checkItem({ ...pkg, folder: "closing" })).toBe(PLAYBOOK_TEXT.wrongFolder);
    expect(checkItem({ folder: "prospect", kind: "scriptStep", stage: "discover", title: "Ask about goals", body: "" })).toBeNull();
    expect(checkItem({ folder: "prospect", kind: "scriptStep", stage: "pitch", title: "Pitch", body: "" })).toBe(PLAYBOOK_TEXT.wrongStage);
    expect(checkItem({ ...pkg, stage: "open" })).toBe(PLAYBOOK_TEXT.stageOnlyForScript);
    expect(checkItem({ ...pkg, tag: "money" })).toBe(PLAYBOOK_TEXT.tagOnlyForObjection);
    expect(checkItem({ ...pkg, title: "   " })).toBe(PLAYBOOK_TEXT.emptyTitle);
  });

  it("labels evidence from the source in code, and a reader may only lower it", () => {
    expect(basisFor("interview")).toBe("firstParty");
    expect(basisFor("video")).toBe("observed");
    expect(basisFor("starter")).toBe("hypothesis");
    expect(basisFor("video", "inferred")).toBe("inferred");
    // Raising is ignored.
    expect(basisFor("starter", "firstParty")).toBe("hypothesis");
    expect(basisFor("strategist", "observed")).toBe("inferred");
  });

  it("says what each skill still needs as a count, never a score", () => {
    const needs = needsFrom([{ kind: "package", stage: undefined }, { kind: "question", stage: undefined }], 2);
    const briefing = needs.find((row) => row.skill === "deal-briefing")!;
    expect(briefing.ready).toBe(false);
    expect(briefing.needs.map((row) => row.line)).toEqual(["Has packages in Offer: 1.", "Needs 3 discovery questions in Prospect; you have 1."]);
    const objections = needs.find((row) => row.skill === "objection-playbook")!;
    expect(objections.needs[0].line).toBe("Needs 5 call transcripts shared with Dealmaker; you have 2.");
    expect(JSON.stringify(needs)).not.toMatch(/score|%/i);
    const script = needsFrom(["open", "discover", "pitch", "close"].map((stage) => ({ kind: "scriptStep" as const, stage: stage as "open" })), 0);
    expect(script.find((row) => row.skill === "conversation-intelligence")!.ready).toBe(true);
  });
});

describe("Playbook functions", () => {
  it("keeps one Playbook per organization and per client, labels a person's item as their own data, and archives instead of deleting", async () => {
    const { t, owner, workspaceId, aster } = await agency();
    const orgItem = await owner.mutation(api.playbook.addItem, { workspaceId, ...pkg });
    await owner.mutation(api.playbook.addItem, { workspaceId, clientId: aster, ...pkg, title: "Aster package" });

    const org = await owner.query(api.playbook.view, { workspaceId });
    expect(org.folders.map((row) => row.name)).toEqual(["Offer", "Prospect", "Objections", "Closing"]);
    const offer = org.folders[0].items;
    expect(offer.map((row) => row.title)).toEqual(["Growth Sprint"]);
    expect(offer[0]).toMatchObject({ basisLabel: "Your data", source: { words: "Added by a person" }, body: "Twelve weeks.\n\nWeekly calls." });
    const client = await owner.query(api.playbook.view, { workspaceId, clientId: aster });
    expect(client.folders[0].items.map((row) => row.title)).toEqual(["Aster package"]);

    await owner.mutation(api.playbook.archiveItem, { workspaceId, itemId: orgItem });
    expect((await owner.query(api.playbook.view, { workspaceId })).folders[0].items).toEqual([]);
    const kept = await t.run((ctx) => ctx.db.get(orgItem));
    expect(kept?.status).toBe("archived");
    expect(await message(owner.mutation(api.playbook.updateItem, { workspaceId, itemId: orgItem, ...pkg }))).toBe(NOT_FOUND);
  });

  it("an edited starter item becomes the business's own word", async () => {
    const { t, owner, workspaceId } = await agency();
    const itemId = await t.run((ctx) =>
      ctx.db.insert("playbookItems", { workspaceId, folder: "objections", kind: "objection", tag: "money", title: "Too expensive", body: "", source: { type: "starter" }, basis: basisFor("starter"), status: "active", createdBy: "agent", createdAt: 1, updatedAt: 1 }),
    );
    let view = await owner.query(api.playbook.view, { workspaceId });
    expect(view.folders[2].items[0]).toMatchObject({ basisLabel: "Untested hypothesis", source: { words: "Starter set: not yet heard on your calls" } });
    await owner.mutation(api.playbook.updateItem, { workspaceId, itemId, folder: "objections", kind: "objection", tag: "money", title: "Too expensive right now", body: "We hear this before budgets reset." });
    view = await owner.query(api.playbook.view, { workspaceId });
    expect(view.folders[2].items[0]).toMatchObject({ title: "Too expensive right now", basisLabel: "Your data", source: { type: "starter" } });
  });

  it("lets Owners, Admins and Members edit; refuses Viewers, other organizations and clients a member may not see", async () => {
    const { owner, admin, member, viewer, outsider, workspaceId, aster, harbor } = await agency();
    await admin.mutation(api.playbook.addItem, { workspaceId, clientId: harbor, ...pkg });
    const asterItem = await member.mutation(api.playbook.addItem, { workspaceId, clientId: aster, ...pkg });

    expect(await message(viewer.mutation(api.playbook.addItem, { workspaceId, clientId: aster, ...pkg }))).toBe(NOT_ALLOWED);
    expect((await viewer.query(api.playbook.view, { workspaceId, clientId: aster })).canEdit).toBe(false);
    // Harbor is not assigned to the Member: it answers like a record that does not exist.
    expect(await message(member.query(api.playbook.view, { workspaceId, clientId: harbor }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.playbook.addItem, { workspaceId, clientId: harbor, ...pkg }))).toBe(NOT_FOUND);
    // Another organization sees nothing, and cannot touch an item by its id.
    expect(await message(outsider.query(api.playbook.view, { workspaceId }))).toBe(NOT_FOUND);
    expect(await message(outsider.mutation(api.playbook.archiveItem, { workspaceId, itemId: asterItem }))).toBe(NOT_FOUND);
    expect((await owner.query(api.playbook.view, { workspaceId, clientId: harbor })).folders[0].items).toHaveLength(1);
  });

  it("guides drafts only with approved lessons; a person's own lesson is approved as written", async () => {
    const { t, owner, member, workspaceId } = await agency();
    const proposed = await t.run((ctx) =>
      ctx.db.insert("playbookLessons", { workspaceId, text: "Leads in dentistry answer texts faster than email.", source: "draftEdit", status: "proposed", proposedBy: "agent", proposedAt: 1, updatedAt: 1 }),
    );
    await member.mutation(api.playbook.addLesson, { workspaceId, text: "Never mention the guarantee before the price." });
    let skill = await t.run((ctx) => playbookForSkill(ctx, { workspaceId }));
    expect(skill.lessons.map((row) => row.text)).toEqual(["Never mention the guarantee before the price."]);

    const view = await owner.query(api.playbook.view, { workspaceId });
    expect(view.lessons.proposed).toMatchObject([{ byDealmaker: true, status: "proposed" }]);

    await owner.mutation(api.playbook.decideLesson, { workspaceId, lessonId: proposed, approve: true, text: "Dentistry leads answer texts faster than email." });
    skill = await t.run((ctx) => playbookForSkill(ctx, { workspaceId }));
    expect(skill.lessons.map((row) => row.text).sort()).toEqual(["Dentistry leads answer texts faster than email.", "Never mention the guarantee before the price."]);
    expect(await message(owner.mutation(api.playbook.decideLesson, { workspaceId, lessonId: proposed, approve: false }))).toBe(PLAYBOOK_TEXT.notProposed);

    await member.mutation(api.playbook.removeLesson, { workspaceId, lessonId: proposed });
    skill = await t.run((ctx) => playbookForSkill(ctx, { workspaceId }));
    expect(skill.lessons).toHaveLength(1);
  });

  it("counts only transcripts this Playbook's business shared with Dealmaker", async () => {
    const { t, owner, workspaceId, aster } = await agency();
    await t.run(async (ctx) => {
      const base = { workspaceId, tool: "Fathom", text: "Hello.", words: 1, addedBy: "nora", createdAt: 1, consentConfirmedAt: 1 };
      await ctx.db.insert("callTranscripts", { ...base, title: "shared", agents: ["sales-conversion"] });
      await ctx.db.insert("callTranscripts", { ...base, title: "strategist only" });
      await ctx.db.insert("callTranscripts", { ...base, clientId: aster as Id<"clients">, title: "client", agents: ["sales-conversion"] });
    });
    const view = await owner.query(api.playbook.view, { workspaceId });
    expect(view.needs.find((row) => row.skill === "objection-playbook")!.needs[0].have).toBe(1);
  });
});
