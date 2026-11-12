/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { readBusinessContext } from "./lib/businessContext";
import { narrowScope, scopeOf } from "./lib/clients";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { currentFigures } from "./decisions";
import { saveTranscriptSourcesFor } from "./transcripts";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
type Tester = ReturnType<typeof convexTest>;
const newTest = () => convexTest(schema, modules);

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

/** Words that appear only in the hidden client's records, so a leak can be found anywhere in a result. */
const SECRET = "ZZHARBOR";
const TRANSCRIPT = `Nora: Thanks for joining. ${SECRET} wants more booked consultations.\nClient: We get about forty leads a month and close six of them.\nNora: Then the follow up is where we start.`;

/**
 * Northlight Growth, an agency, with two clients: Aster Coaching (which Milo the Member and Vera the
 * Viewer are assigned to) and Harbor Dental, marked with SECRET (which they are not). Each has a project,
 * a run, a report, sources, a call, results, a brand kit, an offer and a chat.
 */
async function agency(t: Tester) {
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
  const aster = await owner.mutation(api.clients.create, { workspaceId, type: "business", name: "Aster Coaching", business: { industry: "Executive coaching", offer: "Twelve week leadership program" } });
  const harbor = await admin.mutation(api.clients.create, { workspaceId, type: "business", name: `${SECRET} Dental`, business: { industry: `${SECRET} dentistry`, offer: "Implants" } });
  const people = await owner.query(api.settings.people, { workspaceId });
  const idOf = (name: string) => people.members.find((row) => row.name === name)!.id;
  for (const name of ["milo", "vera"]) await owner.mutation(api.clients.setAssigned, { workspaceId, clientId: aster, memberId: idOf(name), assigned: true });

  const records = async (clientId: Id<"clients"> | undefined, word: string) =>
    t.run(async (ctx) => {
      const now = Date.now();
      const forClient = clientId ? { clientId } : {};
      const projectId = await ctx.db.insert("researchProjects", { workspaceId, ...forClient, title: `${word} research`, objective: `${word} objective`, market: `${word} market`, geography: "US", competitors: [], platforms: ["web"], suppliedUrls: [], status: "ready", createdBy: "nora", createdAt: now, updatedAt: now });
      const runId = await ctx.db.insert("agentRuns", { workspaceId, ...forClient, agentSlug: "growth-architect", skillSlug: "market-intelligence", status: "completed", startedBy: "nora", inputRef: projectId, startedAt: now, finishedAt: now, costCents: 12, inputTokens: 1, outputTokens: 1 });
      await ctx.db.patch(projectId, { latestRunId: runId });
      await ctx.db.insert("runSteps", { workspaceId, runId, index: 0, idempotencyKey: `${runId}:0`, kind: "note", status: "completed", durationMs: 1, inputTokens: 0, outputTokens: 0, resultCode: `${word}-step` });
      // The asset names no client itself: it takes its run's.
      const assetId = await ctx.db.insert("assets", { workspaceId, kind: "researchReport", title: `${word} report`, status: "draft", currentVersion: 1, createdByRun: runId, createdAt: now });
      await ctx.db.insert("assetVersions", { workspaceId, assetId, version: 1, body: JSON.stringify({ summary: `${word} summary` }), createdBy: "agent" });
      const sourceRefId = await ctx.db.insert("sourceRefs", { workspaceId, projectId, runId, origin: "found", platform: "web", kind: "page", url: `https://example.com/${word}`, canonicalUrl: `https://example.com/${word}`, title: `${word} source`, observedAt: now, availability: "available", excerpt: `${word} excerpt` });
      const decisionId = await ctx.db.insert("decisions", { workspaceId, ...forClient, projectId, runId, assetId, opportunityIndex: 0, opportunity: `${word} opportunity`, proposedAction: `${word} action`, validationMethod: "bookings", checkInAt: now - 1, createdBy: "nora", createdAt: now, baseline: [] });
      const transcriptId = await ctx.db.insert("callTranscripts", { workspaceId, ...forClient, title: `${word} call`, tool: "Fathom", text: `${word} said the price was fine.`, words: 6, addedBy: "nora", createdAt: now, consentConfirmedAt: now });
      const uploadId = await ctx.db.insert("resultUploads", { workspaceId, ...forClient, fileName: `${word}.csv`, label: `${word} ads`, currency: "USD", uploadedBy: "nora", createdAt: now, status: "ready", summary: { rows: 3, dateStart: "2026-10-01", dateStop: "2026-10-31", metrics: ["spend"], totals: { spend: 900, conversions: 9 }, groupBy: null, groups: [], otherGroups: 0, ignoredColumns: [] } });
      const cardId = await ctx.db.insert("offerCards", { workspaceId, ...forClient, name: `${word} offer`, currentVersion: 1, createdBy: "nora", createdAt: now, updatedAt: now });
      await ctx.db.insert("offerCardVersions", { workspaceId, cardId, version: 1, name: `${word} offer`, price: "$900", included: [`${word} included`], guarantee: "", terms: "", targetCustomer: `${word} customers`, origin: "person", createdBy: "nora", createdAt: now });
      const intakeId = await ctx.db.insert("intakes", { workspaceId, ...forClient, agentSlug: "growth-architect", createdBy: "nora", status: "chatting", slots: { objective: `${word} chat` }, questionsAsked: 0, costCents: 0, capCents: 0, pendingRemember: [], createdAt: now, updatedAt: now });
      await ctx.db.insert("intakeMessages", { workspaceId, intakeId, role: "you", kind: "text", text: `${word} first message`, at: now });
      // Step 2's records: a proposed task with its approval and Briefing post, and a note to self about the client.
      const taskId = await ctx.db.insert("agentTasks", { workspaceId, ...forClient, title: `${word} task`, why: `${word} why`, proposedBy: { kind: "agent", agentSlug: "growth-architect", runId }, agentSlug: "growth-architect", work: { ask: `${word} ask`, skillSlug: "market-intelligence" }, status: "proposed", expectedReturn: { basis: "insufficient" }, creditCost: 900, evidence: [{ kind: "asset", refId: assetId, label: `${word} report` }, { kind: "sourceRef", refId: sourceRefId, label: `${word} source` }], createdAt: now, updatedAt: now });
      const approvalId = await ctx.db.insert("approvals", { workspaceId, ...forClient, kind: "task", subjectTable: "agentTasks", subjectId: taskId, summary: `${word} task`, credits: 900, status: "waiting", requestedBy: "agent", requestedAt: now });
      await ctx.db.patch(taskId, { approvalId });
      const briefingId = await ctx.db.insert("briefingItems", { workspaceId, ...forClient, kind: "approval", agentSlug: "growth-architect", title: `Proposed: ${word} task`, body: `${word} why`, refTable: "agentTasks", refId: taskId, approvalId, at: now });
      const noteId = await ctx.db.insert("personalNotes", { workspaceId, userId: "milo", ...forClient, body: `${word} note`, createdAt: now, updatedAt: now });
      return { projectId, runId, assetId, sourceRefId, decisionId, transcriptId, uploadId, cardId, intakeId, taskId, approvalId, briefingId, noteId };
    });
  return { owner, admin, member, viewer, workspaceId, aster, harbor, idOf, own: await records(undefined, "Northlight"), a: await records(aster, "Aster"), b: await records(harbor, SECRET) };
}

describe("clients", () => {
  it("lets Owners and Admins add, edit and archive a business or a person, and nobody else", async () => {
    const t = newTest();
    const { owner, admin, member, viewer, workspaceId, aster } = await agency(t);
    expect(await message(member.mutation(api.clients.create, { workspaceId, type: "person", name: "Dana Reyes" }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.clients.update, { workspaceId, clientId: aster, name: "Mine" }))).toBe(NOT_ALLOWED);
    expect(await message(owner.mutation(api.clients.create, { workspaceId, type: "business", name: " aster  coaching " }))).toContain("already have a client");
    expect(await message(owner.mutation(api.clients.create, { workspaceId, type: "business", name: "  " }))).toContain("Name the client");

    const dana = await admin.mutation(api.clients.create, { workspaceId, type: "person", name: "Dana Reyes", person: { goals: "Leave her job and coach full time by June", currentState: "Three paying clients" } });
    expect(await owner.query(api.clients.get, { workspaceId, clientId: dana })).toMatchObject({ type: "person", name: "Dana Reyes", business: null, person: { goals: "Leave her job and coach full time by June", currentState: "Three paying clients", notes: "" } });
    // A business keeps a company profile and a person their goals; one never holds the other's fields.
    await owner.mutation(api.clients.update, { workspaceId, clientId: aster, business: { website: "astercoaching.example", audience: "New directors" }, person: { goals: "ignored" } });
    expect(await owner.query(api.clients.get, { workspaceId, clientId: aster })).toMatchObject({ person: null, business: { website: "astercoaching.example", industry: "Executive coaching", offer: "Twelve week leadership program", audience: "New directors" } });

    await owner.mutation(api.clients.setArchived, { workspaceId, clientId: dana, archived: true });
    expect((await owner.query(api.clients.list, { workspaceId })).clients.map((row) => row.name)).toEqual(["Aster Coaching", `${SECRET} Dental`]);
    expect((await owner.query(api.clients.list, { workspaceId, archived: true })).clients.map((row) => row.name)).toEqual(["Dana Reyes"]);
    // Nothing new is made for an archived client; bringing it back allows it again.
    expect(await message(owner.mutation(api.transcripts.add, { workspaceId, title: "Call", tool: "Zoom", text: TRANSCRIPT, consentConfirmed: true, clientId: dana }))).toBe(NOT_FOUND);
    await owner.mutation(api.clients.setArchived, { workspaceId, clientId: dana, archived: false });
    await owner.mutation(api.transcripts.add, { workspaceId, title: "Call", tool: "Zoom", text: TRANSCRIPT, consentConfirmed: true, clientId: dana });
    const actions = await t.run(async (ctx) => (await ctx.db.query("auditLog").collect()).map((row) => row.action));
    expect(actions).toEqual(expect.arrayContaining(["client.created", "client.updated", "client.archived", "client.restored", "client.assigned"]));
  });

  it("refuses a client of another organization, by the same not-found as a missing one", async () => {
    const t = newTest();
    const { owner, workspaceId, aster } = await agency(t);
    const other = t.withIdentity(person("ben"));
    const otherWorkspace = await other.mutation(api.workspace.create, { name: "Beacon Coaching" });
    const theirs = await other.mutation(api.clients.create, { workspaceId: otherWorkspace, type: "person", name: "Sam Ito" });
    expect(await message(owner.query(api.clients.get, { workspaceId, clientId: theirs }))).toBe(NOT_FOUND);
    expect(await message(owner.mutation(api.clients.update, { workspaceId, clientId: theirs, name: "Taken" }))).toBe(NOT_FOUND);
    expect(await message(owner.mutation(api.research.createProject, { workspaceId, clientId: theirs, title: "x", objective: "What do coaches charge?", market: "Coaching", geography: "US", competitors: [], platforms: ["web"], suppliedUrls: [] }))).toBe(NOT_FOUND);
    expect(await message(other.query(api.clients.get, { workspaceId: otherWorkspace, clientId: aster }))).toBe(NOT_FOUND);
    expect(await message(other.query(api.clients.list, { workspaceId }))).toBe(NOT_FOUND);
  });
});

describe("a client the member is not assigned to", () => {
  it("is not there: not in lists, not by id, and nothing can be made for it", async () => {
    const t = newTest();
    const { member, viewer, owner, workspaceId, harbor, aster, a, b, own } = await agency(t);
    for (const who of [member, viewer]) {
      expect((await who.query(api.clients.list, { workspaceId })).clients.map((row) => row.name)).toEqual(["Aster Coaching"]);
      expect(await message(who.query(api.clients.get, { workspaceId, clientId: harbor }))).toBe(NOT_FOUND);
      expect(await message(who.query(api.research.getProject, { workspaceId, projectId: b.projectId }))).toBe(NOT_FOUND);
      expect(await message(who.query(api.assets.get, { workspaceId, assetId: b.assetId }))).toBe(NOT_FOUND);
      expect(await message(who.query(api.offers.get, { workspaceId, cardId: b.cardId }))).toBe(NOT_FOUND);
      expect(await message(who.query(api.agentChat.get, { workspaceId, intakeId: b.intakeId }))).toBe(NOT_FOUND);
      expect((await who.query(api.research.getProject, { workspaceId, projectId: a.projectId })).title).toBe("Aster research");
      expect((await who.query(api.research.getProject, { workspaceId, projectId: own.projectId })).title).toBe("Northlight research");
      const listed = await who.query(api.research.listProjects, { workspaceId, paginationOpts: { numItems: 20, cursor: null } });
      expect(listed.page.map((row) => row.title).sort()).toEqual(["Aster research", "Northlight research"]);
      expect((await who.query(api.offers.list, { workspaceId })).map((row) => row.current.name).sort()).toEqual(["Aster offer", "Northlight offer"]);
      expect((await who.query(api.resultUploads.list, { workspaceId })).map((row) => row.label).sort()).toEqual(["Aster ads", "Northlight ads"]);
      expect((await who.query(api.agentChat.list, { workspaceId })).map((row) => row.title).sort()).toEqual(["Aster first message", "Northlight first message"]);
    }
    expect(await message(member.query(api.transcripts.read, { workspaceId, transcriptId: b.transcriptId }))).toBe(NOT_FOUND);
    expect((await member.query(api.transcripts.list, { workspaceId })).transcripts.map((row) => row.title).sort()).toEqual(["Aster call", "Northlight call"]);

    // A Member works for the clients they have, and cannot make or change anything for one they do not.
    const project = { title: "Pricing", objective: "What do practices charge?", market: "Dental", geography: "US", competitors: [], platforms: ["web" as const], suppliedUrls: [] };
    expect(await message(member.mutation(api.research.createProject, { workspaceId, clientId: harbor, ...project }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.transcripts.add, { workspaceId, clientId: harbor, title: "Call", tool: "Zoom", text: TRANSCRIPT, consentConfirmed: true }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.transcripts.remove, { workspaceId, transcriptId: b.transcriptId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.resultUploads.remove, { workspaceId, uploadId: b.uploadId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.offers.archive, { workspaceId, cardId: b.cardId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.research.archiveProject, { workspaceId, projectId: b.projectId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "market-intelligence", projectId: b.projectId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.agentChat.send, { workspaceId, text: "Research dental pricing", clientId: harbor }))).toBe(NOT_FOUND);
    const made = await member.mutation(api.research.createProject, { workspaceId, clientId: aster, ...project });
    expect((await owner.query(api.research.getProject, { workspaceId, projectId: made })).clientId).toBe(aster);

    // Assigning opens it at once; taking it away closes it again.
    const milo = (await owner.query(api.clients.access, { workspaceId, clientId: harbor })).find((row) => row.name === "milo")!;
    expect(milo).toMatchObject({ role: "member", always: false, assigned: false });
    await owner.mutation(api.clients.setAssigned, { workspaceId, clientId: harbor, memberId: milo.memberId, assigned: true });
    expect((await member.query(api.research.getProject, { workspaceId, projectId: b.projectId })).title).toBe(`${SECRET} research`);
    await owner.mutation(api.clients.setAssigned, { workspaceId, clientId: harbor, memberId: milo.memberId, assigned: false });
    expect(await message(member.query(api.research.getProject, { workspaceId, projectId: b.projectId }))).toBe(NOT_FOUND);
    // Owners and Admins see every client; there is nothing to assign.
    const ada = (await owner.query(api.clients.access, { workspaceId, clientId: harbor })).find((row) => row.name === "ada")!;
    expect(ada).toMatchObject({ always: true, assigned: true });
    expect(await message(owner.mutation(api.clients.setAssigned, { workspaceId, clientId: harbor, memberId: ada.memberId, assigned: false }))).toContain("see every client");
    expect(await message(member.mutation(api.clients.setAssigned, { workspaceId, clientId: harbor, memberId: milo.memberId, assigned: true }))).toBe(NOT_ALLOWED);
  });

  it("can also be kept away from the organization's own work", async () => {
    const t = newTest();
    const { owner, member, workspaceId, idOf, a, own } = await agency(t);
    expect((await member.query(api.clients.list, { workspaceId })).ownWork).toBe(true);
    await owner.mutation(api.clients.setOwnWork, { workspaceId, memberId: idOf("milo"), ownWork: false });
    expect((await member.query(api.clients.list, { workspaceId })).ownWork).toBe(false);
    expect(await message(member.query(api.research.getProject, { workspaceId, projectId: own.projectId }))).toBe(NOT_FOUND);
    expect((await member.query(api.research.getProject, { workspaceId, projectId: a.projectId })).title).toBe("Aster research");
    expect((await member.query(api.offers.list, { workspaceId })).map((row) => row.current.name)).toEqual(["Aster offer"]);
    const project = { title: "Ours", objective: "What do agencies charge?", market: "Agencies", geography: "US", competitors: [], platforms: ["web" as const], suppliedUrls: [] };
    expect(await message(member.mutation(api.research.createProject, { workspaceId, ...project }))).toBe(NOT_FOUND);
    expect(await owner.query(api.clients.memberAccess, { workspaceId, memberId: idOf("milo") })).toMatchObject({ all: false, ownWork: false, clients: [{ name: "Aster Coaching", assigned: true }, { name: `${SECRET} Dental`, assigned: false }] });
  });

  type Registered = { isPublic?: boolean; isMutation?: boolean; isQuery?: boolean; exportArgs?: () => string; _handler?: (ctx: MutationCtx, args: unknown) => Promise<unknown> };
  type Validator = { type: string; tableName?: string; value?: unknown };

  async function publicFunctions(kind: "isMutation" | "isQuery") {
    const out: { name: string; fn: Registered; args: Record<string, { fieldType: Validator; optional: boolean }> }[] = [];
    for (const [path, load] of Object.entries(modules)) {
      if (path.includes("/_generated/")) continue;
      for (const [name, value] of Object.entries((await load()) as Record<string, unknown>)) {
        if (typeof value !== "function") continue;
        const fn = value as Registered;
        if (!fn.isPublic || !fn[kind] || !fn._handler) continue;
        const args = JSON.parse(fn.exportArgs?.() ?? "{}").value ?? {};
        if (args.workspaceId) out.push({ name: `${path.replace(/^\.\//, "").replace(/\.ts$/, "")}:${name}`, fn, args });
      }
    }
    return out;
  }

  /** Arguments for any function: the hidden client's own records wherever an id is asked for. */
  function argsFor(spec: Record<string, { fieldType: Validator; optional: boolean }>, ids: Record<string, string>, workspaceId: string) {
    const make = (validator: Validator, key: string): unknown => {
      switch (validator.type) {
        case "id":
          return validator.tableName === "workspaces" ? workspaceId : ids[validator.tableName ?? ""];
        case "string":
          return key === "cursor" ? null : "growth-architect";
        case "number":
        case "bigint":
          return 20;
        case "boolean":
          return true;
        case "null":
          return null;
        case "array":
          return [];
        case "literal":
          return validator.value;
        case "union": {
          const options = validator.value as Validator[];
          return make(options.find((option) => option.type === "null") ?? options.find((option) => option.type === "id" && ids[option.tableName ?? ""]) ?? options[0], key);
        }
        case "object": {
          const out: Record<string, unknown> = {};
          for (const [field, inner] of Object.entries(validator.value as Record<string, { fieldType: Validator; optional: boolean }>)) {
            const made = make(inner.fieldType, field);
            if (made !== undefined) out[field] = made;
          }
          return out;
        }
        default:
          return {};
      }
    };
    const out: Record<string, unknown> = {};
    for (const [field, inner] of Object.entries(spec)) {
      if (field === "scope") continue;
      const made = make(inner.fieldType, field);
      if (made !== undefined) out[field] = made;
    }
    return out;
  }

  it("never shows through any query, whatever ids are asked for", { timeout: 30_000 }, async () => {
    const t = newTest();
    const { workspaceId, harbor, b } = await agency(t);
    const ids: Record<string, string> = { clients: harbor, researchProjects: b.projectId, agentRuns: b.runId, assets: b.assetId, sourceRefs: b.sourceRefId, decisions: b.decisionId, callTranscripts: b.transcriptId, resultUploads: b.uploadId, offerCards: b.cardId, intakes: b.intakeId, agentTasks: b.taskId, approvals: b.approvalId, briefingItems: b.briefingId, personalNotes: b.noteId };
    const hiddenIds = Object.values(ids);
    const queries = await publicFunctions("isQuery");
    expect(queries.length).toBeGreaterThan(100);
    const leaks: string[] = [];
    let answered = 0;
    for (const who of ["milo", "vera"]) {
      await t.withIdentity(person(who)).run(async (ctx) => {
        for (const { name, fn, args } of queries) {
          let result: unknown;
          try {
            result = await fn._handler!(ctx as unknown as MutationCtx, argsFor(args, ids, workspaceId));
          } catch {
            continue; // Refused, or it wanted something this cannot supply: either way nothing was returned.
          }
          answered += 1;
          // A page's cursor is an opaque position, not a record: the test database spells it as the last row read.
          const text = JSON.stringify(result, (key, value) => (key === "continueCursor" ? undefined : value)) ?? "";
          if (text.includes(SECRET)) leaks.push(`${who} ${name}: the hidden client's words`);
          for (const id of hiddenIds) if (text.includes(id)) leaks.push(`${who} ${name}: a hidden id`);
        }
      });
    }
    expect([...new Set(leaks)].join(" | ")).toBe("");
    // Most queries did answer, so the absence of the secret is not just a wall of errors.
    expect(answered).toBeGreaterThan(60);

    // The same sweep as the Owner does see it, which proves the sweep can find it.
    let seen = 0;
    await t.withIdentity(person("nora")).run(async (ctx) => {
      for (const { fn, args } of queries) {
        try {
          if ((JSON.stringify(await fn._handler!(ctx as unknown as MutationCtx, argsFor(args, ids, workspaceId))) ?? "").includes(SECRET)) seen += 1;
        } catch {
          continue;
        }
      }
    });
    expect(seen).toBeGreaterThan(10);
  });

  it("cannot be changed through any mutation, whatever ids are given", { timeout: 30_000 }, async () => {
    const t = newTest();
    const { workspaceId, harbor, b } = await agency(t);
    const ids: Record<string, string> = { clients: harbor, researchProjects: b.projectId, agentRuns: b.runId, assets: b.assetId, sourceRefs: b.sourceRefId, decisions: b.decisionId, callTranscripts: b.transcriptId, resultUploads: b.uploadId, offerCards: b.cardId, intakes: b.intakeId, agentTasks: b.taskId, approvals: b.approvalId, briefingItems: b.briefingId, personalNotes: b.noteId };
    const snapshot = () =>
      t.run(async (ctx) => {
        const rows: unknown[] = [];
        for (const [table, id] of Object.entries(ids)) rows.push([table, await ctx.db.get(id as Id<"clients">)]);
        // Everything that hangs off the hidden client's records, and who is assigned to it.
        rows.push((await ctx.db.query("offerCardVersions").collect()).filter((row) => row.cardId === ids.offerCards));
        rows.push((await ctx.db.query("intakeMessages").collect()).filter((row) => row.intakeId === ids.intakes).length);
        rows.push((await ctx.db.query("assetVersions").collect()).filter((row) => row.assetId === ids.assets));
        rows.push((await ctx.db.query("sourceRefs").collect()).filter((row) => row.projectId === ids.researchProjects));
        for (const table of ["decisions", "researchProjects", "agentRuns", "callTranscripts", "resultUploads", "offerCards", "intakes", "brandKits", "teardownRequests", "creativeRequests", "clientAssignments", "agentTasks", "approvals", "briefingItems", "personalNotes"] as const) {
          rows.push((await ctx.db.query(table).collect()).filter((row) => row.clientId === harbor).length);
        }
        return JSON.stringify(rows);
      });
    const before = await snapshot();
    const mutations = await publicFunctions("isMutation");
    const changed: string[] = [];
    for (const { name, fn, args } of mutations) {
      try {
        await t.withIdentity(person("milo")).run((ctx) => fn._handler!(ctx as unknown as MutationCtx, argsFor(args, ids, workspaceId)));
      } catch {
        continue;
      }
      // Each mutation runs on its own, so the one that changed something is named.
      if ((await snapshot()) !== before) changed.push(name);
    }
    expect(changed).toEqual([]);
  });
});

describe("the client picker", () => {
  it("narrows any query to the organization itself or to one client, and never widens", { timeout: 30_000 }, async () => {
    const t = newTest();
    const { owner, member, workspaceId, aster, harbor } = await agency(t);
    const titles = async (who: typeof owner, scope?: "own" | Id<"clients">) =>
      (await who.query(api.research.listProjects, { workspaceId, scope, paginationOpts: { numItems: 20, cursor: null } })).page.map((row) => row.title).sort();
    expect(await titles(owner)).toEqual(["Aster research", "Northlight research", `${SECRET} research`]);
    expect(await titles(owner, "own")).toEqual(["Northlight research"]);
    expect(await titles(owner, aster)).toEqual(["Aster research"]);
    expect(await titles(owner, harbor)).toEqual([`${SECRET} research`]);
    expect((await owner.query(api.offers.list, { workspaceId, scope: aster })).map((row) => row.current.name)).toEqual(["Aster offer"]);
    expect((await owner.query(api.transcripts.list, { workspaceId, scope: "own" })).transcripts.map((row) => row.title)).toEqual(["Northlight call"]);
    expect((await owner.query(api.agentChat.list, { workspaceId, scope: harbor })).map((row) => row.title)).toEqual([`${SECRET} first message`]);
    // Asking for a client you may not see gives nothing.
    expect(await titles(member, harbor)).toEqual([]);
    expect(await titles(member, aster)).toEqual(["Aster research"]);
  });

  it("keeps the rule in one small function", () => {
    const a = "a" as Id<"clients">;
    const b = "b" as Id<"clients">;
    const mine = scopeOf(false, true, new Set([a]));
    expect([mine.sees(a), mine.sees(b), mine.sees(undefined)]).toEqual([true, false, true]);
    expect([narrowScope(mine, a).sees(a), narrowScope(mine, a).sees(undefined), narrowScope(mine, b).sees(b), narrowScope(mine, "own").sees(undefined), narrowScope(mine, "own").sees(a)]).toEqual([true, false, false, true, false]);
    const noOwn = scopeOf(false, false, new Set([a]));
    expect([noOwn.sees(undefined), narrowScope(noOwn, "own").sees(undefined)]).toEqual([false, false]);
    const all = scopeOf(true, true, new Set());
    expect([all.sees(b), narrowScope(all, a).sees(b), narrowScope(all, a).sees(a)]).toEqual([true, false, true]);
    expect(all.pick([{ clientId: a }, { clientId: b }, {}], "own")).toEqual([{}]);
  });
});

describe("work for a client stays about that client", () => {
  it("reads the client's own calls and results into its work, never another client's or the organization's", async () => {
    const t = newTest();
    const { workspaceId, aster, harbor, a, b, own } = await agency(t);
    const used = async (projectId: Id<"researchProjects">) =>
      t.run(async (ctx) => (await saveTranscriptSourcesFor(ctx, { workspaceId, projectId, agentSlug: "growth-architect" })).map((row) => row.transcript.title));
    expect(await used(a.projectId)).toEqual(["Aster call"]);
    expect(await used(b.projectId)).toEqual([`${SECRET} call`]);
    expect(await used(own.projectId)).toEqual(["Northlight call"]);
    const figures = (clientId?: Id<"clients">) => t.run(async (ctx) => (await currentFigures(ctx, workspaceId, clientId)).map((row) => row.label));
    expect(await figures()).toEqual(["Northlight ads"]);
    expect(await figures(aster)).toEqual(["Aster ads"]);
    expect(await figures(harbor)).toEqual([`${SECRET} ads`]);
  });

  it("gives the agent the client's profile instead of the organization's", async () => {
    const t = newTest();
    const { workspaceId, a, own } = await agency(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("profileVersions", { workspaceId, version: 1, offer: "Paid social retainers for coaches", priceNotes: "", audience: "Coaches", geography: "US", channels: "", brandVoice: "", competitors: [], confirmedBy: "nora", confirmedAt: 1, status: "confirmed" });
    });
    const known = (projectId: Id<"researchProjects">) =>
      t.run(async (ctx) => {
        const project = (await ctx.db.get(projectId))!;
        const run = (await ctx.db.get(project.latestRunId!))!;
        const context = await readBusinessContext(ctx, run, project);
        return { profile: context.profile?.offer ?? null, known: context.known.map((row) => `${row.label}: ${row.value}`), decisions: context.decisions.map((row) => row.opportunity) };
      });
    const forClient = await known(a.projectId);
    expect(forClient.profile).toBeNull();
    expect(forClient.known).toEqual(expect.arrayContaining(["Client: Aster Coaching", "Industry: Executive coaching", "Offer: Twelve week leadership program"]));
    expect(forClient.known.join(" ")).not.toContain("Paid social retainers");
    expect(forClient.known.join(" ")).not.toContain(SECRET);
    expect(forClient.decisions).toEqual(["Aster opportunity"]);
    const forOwn = await known(own.projectId);
    expect(forOwn.profile).toBe("Paid social retainers for coaches");
    expect(forOwn.decisions).toEqual(["Northlight opportunity"]);
    expect(forOwn.known.join(" ")).not.toContain("Aster");
  });

  it("starts a chat for a client without assuming or remembering anything about the organization", async () => {
    const t = newTest();
    const { owner, workspaceId, aster } = await agency(t);
    const { intakeId } = await owner.mutation(api.agentChat.send, { workspaceId, text: "Which do you think?", clientId: aster });
    expect((await t.run((ctx) => ctx.db.get(intakeId)))?.clientId).toBe(aster);
    expect((await owner.query(api.agentChat.list, { workspaceId, scope: aster })).map((row) => row.id)).toContain(intakeId);
    expect((await owner.query(api.agentChat.list, { workspaceId, scope: "own" })).map((row) => row.id)).not.toContain(intakeId);
  });
});

describe("brand kits and clients", () => {
  const kit = (name: string) => ({ name, website: `https://${name.toLowerCase().replace(/\s+/g, "")}.example`, industry: "Coaching", colors: [{ label: "Primary", hex: "#3344AA" }], headingFont: "Inter", bodyFont: "Inter", imageStyle: "Bright", tone: "Warm", useWords: [], avoidWords: [], examples: [], disclaimers: [], regulated: "none" as const, bannedTopics: [], placements: ["1:1"], logos: [], logosOwned: false });

  it("turns each kit that was made for a client into a real client, once, losing nothing", async () => {
    const t = newTest();
    const { owner, member, workspaceId } = await agency(t);
    // Two kits as they were stored before clients existed: a kind and a name, nothing else.
    const legacy = await t.run(async (ctx) => {
      const out: Id<"brandKits">[] = [];
      for (const name of ["Lumen Yoga", "aster coaching"]) {
        const id = await ctx.db.insert("brandKits", { workspaceId, kind: "client", name, currentVersion: 1, createdBy: "nora", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("brandKitVersions", { workspaceId, kitId: id, version: 1, ...kit(name), createdBy: "nora", createdAt: 1 });
        out.push(id);
      }
      const own = await ctx.db.insert("brandKits", { workspaceId, kind: "own", name: "Northlight Growth", currentVersion: 1, createdBy: "nora", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("brandKitVersions", { workspaceId, kitId: own, version: 1, ...kit("Northlight Growth"), createdBy: "nora", createdAt: 1 });
      out.push(own);
      return out;
    });
    expect(await t.query(internal.clientsMigration.remaining, {})).toEqual({ clientKitsWithoutClient: 2 });
    expect(await t.mutation(internal.clientsMigration.backfillIfNeeded, {})).toBe(true);
    await t.mutation(internal.clientsMigration.backfill, {});

    const after = await t.run(async (ctx) => ({
      kits: await Promise.all(legacy.map((id) => ctx.db.get(id))),
      clients: (await ctx.db.query("clients").collect()).map((row) => ({ name: row.name, website: row.business?.website ?? null })),
      versions: (await ctx.db.query("brandKitVersions").collect()).length,
      assignments: (await ctx.db.query("clientAssignments").collect()).length,
    }));
    // A new client for the kit nobody had made a client for; the existing client for the one with its name.
    expect(after.clients.map((row) => row.name).sort()).toEqual(["Aster Coaching", "Lumen Yoga", `${SECRET} Dental`]);
    expect(after.clients.find((row) => row.name === "Lumen Yoga")?.website).toBe("https://lumenyoga.example");
    expect(after.kits.map((row) => Boolean(row?.clientId))).toEqual([true, true, false]);
    expect(after.kits.map((row) => row?.kind)).toEqual(["client", "client", "own"]);
    expect(after.versions).toBe(3);
    // Milo and Vera could open that kit before, so they are assigned to the client it became.
    expect(after.assignments).toBe(4);
    expect((await member.query(api.brandKits.list, { workspaceId })).map((row) => row.name).sort()).toEqual(["Lumen Yoga", "Northlight Growth", "aster coaching"]);

    expect(await t.mutation(internal.clientsMigration.backfillIfNeeded, {})).toBe(false);
    await t.mutation(internal.clientsMigration.backfill, {});
    const again = await t.run(async (ctx) => ({ clients: (await ctx.db.query("clients").collect()).length, assignments: (await ctx.db.query("clientAssignments").collect()).length }));
    expect(again).toEqual({ clients: 3, assignments: 4 });
    expect((await owner.query(api.brandKits.list, { workspaceId, scope: "own" })).map((row) => row.name)).toEqual(["Northlight Growth"]);
  });

  it("makes a new client kit for a client: one each, and hidden with its client", async () => {
    const t = newTest();
    const { owner, member, workspaceId, aster, harbor } = await agency(t);
    const made = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", clientId: harbor, ...kit(`${SECRET} Dental`) });
    expect(await message(owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", clientId: harbor, ...kit("Another") }))).toContain("already has a brand kit");
    expect(await message(member.query(api.brandKits.get, { workspaceId, kitId: made.kitId }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.brandKits.saveVersion, { workspaceId, kitId: made.kitId, ...kit("Changed") }))).toBe(NOT_FOUND);
    expect(await message(member.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", clientId: harbor, ...kit("Planted") }))).toBe(NOT_FOUND);
    // A Member adds a kit for a client they have, but cannot conjure a new client by naming a brand.
    await member.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", clientId: aster, ...kit("Aster Coaching") });
    expect(await message(member.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", ...kit("Brand New Co") }))).toContain("Choose the client");
    // An Owner naming a brand with no client gets the client made, as adding a client kit always did.
    await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "client", ...kit("Brand New Co") });
    expect((await owner.query(api.clients.list, { workspaceId })).clients.map((row) => row.name)).toContain("Brand New Co");
    expect((await member.query(api.brandKits.list, { workspaceId })).map((row) => row.name)).toEqual(["Aster Coaching"]);
  });
});
