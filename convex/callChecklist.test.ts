/**
 * @vitest-environment edge-runtime
 *
 * The live call checklist (build step 12c): the script's steps in call order, this lead's points from their
 * brief, the most-heard objections, ticks kept per call, and only for calls the person's home shows.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { CHECKLIST_TEXT, buildChecklist, itemIds } from "./lib/dealmaker/checklist";
import type { BriefView } from "./lib/dealmaker/briefView";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 15);

const view = (over: Partial<BriefView> = {}): BriefView => ({
  summary: "",
  codeOnly: false,
  checksPassed: true,
  firstCall: true,
  facts: [],
  readiness: [
    { field: "budget", label: "Budget", established: false, finding: "", quote: "" },
    { field: "need", label: "Need", established: true, finding: "Wants more calls", quote: "" },
  ],
  commitments: [{ owner: "the rep", what: "send the case study", due: "", quote: "" }],
  disagreements: [],
  cover: [{ point: "Their busy season starts in March", label: "Your data" }],
  objections: [{ text: "Price", where: "on the first call", label: "Your data" }],
  openingQuestion: "What made you book now?",
  missing: [],
  ...over,
});

describe("checklist rules", () => {
  it("puts the script in call order, then the lead's points, then the most-heard objections", () => {
    const list = buildChecklist({
      steps: [
        { id: "s2", stage: "close", title: "Ask for the decision" },
        { id: "s3", stage: null, title: "Book the next step" },
        { id: "s1", stage: "discover", title: "Ask what it is worth" },
      ],
      brief: view(),
      briefState: "ready",
      objections: [
        { title: "Too expensive", heard: 5, track: "Compare it to the cost of waiting." },
        { title: "Need to think", heard: 2, track: null },
        { title: "Never heard", heard: 0, track: null },
        { title: "Spouse", heard: 1, track: null },
        { title: "Timing", heard: 3, track: null },
      ],
    });
    expect(list.script.map((group) => group.items.map((row) => row.id))).toEqual([["script:s1"], ["script:s2"], ["script:s3"]]);
    expect(list.script.at(-1)!.stage).toBe("Other steps");
    expect(list.lead.map((row) => row.text)).toEqual([
      "What made you book now?",
      "Their busy season starts in March",
      "Find out: budget",
      "Be ready for: Price",
      "Follow through: send the case study",
    ]);
    expect(list.objections.map((row) => row.title)).toEqual(["Too expensive", "Timing", "Need to think"]);
    expect(list.objections[0]).toMatchObject({ heardWords: "Heard on 5 calls", track: "Compare it to the cost of waiting." });
    expect(list.leadMissing).toBeNull();
    expect(list.scriptMissing).toBeNull();
    // Ids are stable when the list is drawn again.
    expect([...itemIds(list)]).toEqual([
      ...itemIds(
        buildChecklist({
          steps: [
            { id: "s1", stage: "discover", title: "Ask what it is worth" },
            { id: "s2", stage: "close", title: "Ask for the decision" },
            { id: "s3", stage: null, title: "Book the next step" },
          ],
          brief: view(),
          briefState: "ready",
          objections: [],
        }),
      ),
    ]);
  });

  it("says why a part is empty, and ignores a brief that is not ready", () => {
    expect(buildChecklist({ steps: [], brief: null, briefState: "none", objections: [] })).toMatchObject({ lead: [], leadMissing: CHECKLIST_TEXT.noBrief, scriptMissing: CHECKLIST_TEXT.noScript });
    expect(buildChecklist({ steps: [], brief: view(), briefState: "running", objections: [] })).toMatchObject({ lead: [], leadMissing: CHECKLIST_TEXT.briefNotReady });
  });
});

describe("the checklist for a call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds the list for a booked call, keeps ticks, and shows a closer only their own deals' calls", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });

    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: NOW + DAY,
        scopes: [],
        accountId: "loc1",
        accountName: "Northlight",
        currency: "USD",
        timezone: "America/New_York",
        connectedBy: "nora",
        connectedAt: NOW - 60 * DAY,
        lastSyncAt: NOW,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Call booked", position: 0 }] });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d1", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "c1", assignedTo: "crm-milo" });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d2", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "c2", assignedTo: "crm-ada" });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [], addedAt: NOW - 10 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c2", name: "Sam Ray", tags: [], addedAt: NOW - 10 * DAY });
      await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a1", kind: "appointment", at: NOW + 4 * HOUR, contactId: "c1", status: "confirmed" });
      await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a2", kind: "appointment", at: NOW + 6 * HOUR, contactId: "c2", status: "booked" });
      await ctx.db.insert("playbookItems", {
        workspaceId,
        folder: "prospect",
        kind: "scriptStep",
        stage: "discover",
        title: "Ask what it is worth to them",
        body: "",
        source: { type: "person" },
        basis: "firstParty",
        status: "active",
        createdBy: "nora",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("playbookItems", {
        workspaceId,
        folder: "closing",
        kind: "scriptStep",
        stage: "close",
        title: "Ask for the decision",
        body: "",
        source: { type: "person" },
        basis: "firstParty",
        status: "active",
        createdBy: "nora",
        createdAt: 1,
        updatedAt: 1,
      });
      const projectId = await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Pre-call brief: Jordan Lee",
        objective: "Brief.",
        market: "",
        geography: "",
        competitors: [],
        platforms: ["customerData"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "nora",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("dealBriefings", {
        workspaceId,
        projectId,
        leadName: "Jordan Lee",
        contactRef: "c1",
        appointmentRef: "a1",
        trigger: "request",
        status: "ready",
        view: view(),
        createdBy: "nora",
        createdAt: NOW - HOUR,
      } as never);
    });

    const list = await owner.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "a1" });
    expect(list.leadName).toBe("Jordan Lee");
    expect(list.script.map((group) => group.stage)).toHaveLength(2);
    expect(list.lead[0].text).toBe("What made you book now?");
    expect(list.ticked).toEqual([]);
    expect(list.canTick).toBe(true);

    // Ticks are kept per call; an id not on the list is refused.
    const first = list.script[0].items[0].id;
    await owner.mutation(api.callChecklist.tick, { workspaceId, appointmentRef: "a1", itemId: first, on: true });
    await owner.mutation(api.callChecklist.tick, { workspaceId, appointmentRef: "a1", itemId: list.lead[0].id, on: true });
    await owner.mutation(api.callChecklist.tick, { workspaceId, appointmentRef: "a1", itemId: list.lead[0].id, on: false });
    expect((await owner.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "a1" })).ticked).toEqual([first]);
    await expect(owner.mutation(api.callChecklist.tick, { workspaceId, appointmentRef: "a1", itemId: "bad id!", on: true })).rejects.toThrow();
    expect((await owner.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "a2" })).leadMissing).toBe(CHECKLIST_TEXT.noBrief);
    await expect(owner.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "nope" })).rejects.toThrow();

    // A closer linked to their CRM user opens only their own deals' calls.
    const people = await owner.query(api.settings.people, { workspaceId });
    await owner.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: people.members.find((row) => row.name === "milo")!.id as never, salesRole: "closer", crmUserRef: "crm-milo" });
    expect((await member.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "a1" })).ticked).toEqual([first]);
    await expect(member.query(api.callChecklist.forCall, { workspaceId, appointmentRef: "a2" })).rejects.toThrow();
    await expect(member.mutation(api.callChecklist.tick, { workspaceId, appointmentRef: "a2", itemId: first, on: true })).rejects.toThrow();
  });
});
