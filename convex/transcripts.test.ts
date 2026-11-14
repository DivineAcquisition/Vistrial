/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { cleanTranscript } from "./lib/transcriptText";
import schema from "./schema";
import { saveTranscriptSourcesFor, transcriptsFor } from "./transcripts";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

// A discovery call between a marketing agency and a prospect.
const CALL = `Dana Ortiz: Thanks for making time. What made you book the call?
Prospect: We spend about four thousand a month on Meta and cannot tell which ads bring retainers.
Dana Ortiz: What have you tried so far?
Prospect: Two freelancers. Both sent reports full of impressions. Nobody told us what to change.`;

const VTT = `WEBVTT
Kind: captions

NOTE made by a note taker

1
00:00:01.000 --> 00:00:04.500
<v Dana Ortiz>Thanks for making time. What made you book the call?</v>

2
00:00:05.000 --> 00:00:11.000
<v Prospect>We spend about four thousand a month on Meta and cannot tell which ads bring retainers.</v>
`;

const SRT = `1
00:00:01,000 --> 00:00:04,500
Dana Ortiz: Thanks for making time. What made you book the call?

2
00:00:05,000 --> 00:00:11,000
Prospect: We spend about four thousand a month on Meta.
`;

async function setUp() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const otherWorkspace = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_viewer", role: "viewer", displayName: "Viewer", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_admin", role: "admin", displayName: "Admin", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_member", role: "member", displayName: "Member", active: true });
    const other = await ctx.db.insert("workspaces", { name: "Other agency", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    return other;
  });
  const as = (subject: string) => t.withIdentity(identity(subject));
  return { t, workspaceId, otherWorkspace, owner: as("user_owner"), admin: as("user_admin"), member: as("user_member"), viewer: as("user_viewer"), stranger: as("user_other") };
}

const input = (workspaceId: Id<"workspaces">, extra: Record<string, unknown> = {}) => ({
  workspaceId,
  title: "Discovery call, Harbor Dental group",
  tool: "Fathom",
  callDate: "2026-11-03",
  text: CALL,
  consentConfirmed: true,
  ...extra,
});

describe("transcript text", () => {
  it("keeps pasted text as it is, tidied", () => {
    const result = cleanTranscript(`${CALL}\r\n\r\n\r\n\r\n   `);
    expect(result).toMatchObject({ ok: true, text: CALL });
    expect(result.ok && result.words).toBeGreaterThan(40);
  });

  it("drops cue numbers, timestamps and notes from .vtt and .srt files, and keeps the speakers and the words", () => {
    const vtt = cleanTranscript(VTT);
    expect(vtt).toMatchObject({
      ok: true,
      text: "Dana Ortiz: Thanks for making time. What made you book the call?\nProspect: We spend about four thousand a month on Meta and cannot tell which ads bring retainers.",
    });
    const srt = cleanTranscript(SRT);
    expect(srt.ok && srt.text).toBe("Dana Ortiz: Thanks for making time. What made you book the call?\nProspect: We spend about four thousand a month on Meta.");
  });

  it("refuses audio or video sent as text, an empty paste, a stub and something far too long", () => {
    expect(cleanTranscript(`ID3\u0000\u0000\u0003${"\u0001\u0002".repeat(200)}`)).toEqual({ ok: false, code: "not_text" });
    expect(cleanTranscript("   \n ")).toEqual({ ok: false, code: "empty" });
    expect(cleanTranscript("hello there")).toEqual({ ok: false, code: "too_short" });
    expect(cleanTranscript("word ".repeat(200_000))).toEqual({ ok: false, code: "too_large" });
  });
});

describe("call transcripts", () => {
  it("lets an owner or admin add one, stores the cleaned text for that workspace, and records the confirmation", async () => {
    const { t, workspaceId, admin, owner } = await setUp();
    const id = await admin.mutation(api.transcripts.add, input(workspaceId, { text: VTT, tool: "Zoom" }));
    const listed = await owner.query(api.transcripts.list, { workspaceId });
    expect(listed).toMatchObject({ canEdit: true, canGrant: true });
    expect(listed.transcripts).toHaveLength(1);
    expect(listed.transcripts[0]).toMatchObject({ id, title: "Discovery call, Harbor Dental group", tool: "Zoom", callDate: "2026-11-03", agents: ["growth-architect"] });
    expect(JSON.stringify(listed)).not.toContain("-->");
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.consentConfirmedAt).toBeGreaterThan(0);
    expect(row?.addedBy).toBe("user_admin");
    const full = await owner.query(api.transcripts.read, { workspaceId, transcriptId: id });
    expect(full.text.startsWith("Dana Ortiz: Thanks for making time.")).toBe(true);
    // The audit trail has the id, never the title or the words.
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const entry = audit.find((log) => log.action === "transcript.added");
    expect(entry?.subject).toBe(id);
    expect(JSON.stringify(audit)).not.toMatch(/Harbor Dental|four thousand/);
  });

  it("refuses to add one without the confirmation, a title, real text or a real date", async () => {
    const { workspaceId, owner } = await setUp();
    await expect(owner.mutation(api.transcripts.add, input(workspaceId, { consentConfirmed: false }))).rejects.toThrow(/recorded lawfully/);
    await expect(owner.mutation(api.transcripts.add, input(workspaceId, { title: "   " }))).rejects.toThrow(/title/);
    await expect(owner.mutation(api.transcripts.add, input(workspaceId, { text: "\u0000\u0001binary" }))).rejects.toThrow(/never audio or video/);
    await expect(owner.mutation(api.transcripts.add, input(workspaceId, { callDate: "last Tuesday" }))).rejects.toThrow(/date/);
    expect((await owner.query(api.transcripts.list, { workspaceId })).transcripts).toHaveLength(0);
  });

  it("keeps a viewer to the list, and another workspace out entirely", async () => {
    const { workspaceId, otherWorkspace, owner, viewer, stranger } = await setUp();
    const id = await owner.mutation(api.transcripts.add, input(workspaceId));
    await expect(viewer.mutation(api.transcripts.add, input(workspaceId))).rejects.toThrow();
    await expect(viewer.query(api.transcripts.read, { workspaceId, transcriptId: id })).rejects.toThrow();
    await expect(viewer.mutation(api.transcripts.remove, { workspaceId, transcriptId: id })).rejects.toThrow();
    expect((await viewer.query(api.transcripts.list, { workspaceId })).canEdit).toBe(false);

    await expect(stranger.query(api.transcripts.list, { workspaceId })).rejects.toThrow();
    await expect(stranger.mutation(api.transcripts.add, input(workspaceId))).rejects.toThrow();
    // Their own workspace cannot reach this one's transcript by its id.
    await expect(stranger.query(api.transcripts.read, { workspaceId: otherWorkspace, transcriptId: id })).rejects.toThrow();
    await expect(stranger.mutation(api.transcripts.remove, { workspaceId: otherWorkspace, transcriptId: id })).rejects.toThrow();
    await expect(stranger.mutation(api.transcripts.setAgentAccess, { workspaceId: otherWorkspace, transcriptId: id, agentSlug: "growth-architect", granted: false })).rejects.toThrow();
    expect((await stranger.query(api.transcripts.list, { workspaceId: otherWorkspace })).transcripts).toHaveLength(0);
  });

  it("deletes the text when an admin removes it", async () => {
    const { t, workspaceId, owner, admin } = await setUp();
    const id = await owner.mutation(api.transcripts.add, input(workspaceId));
    await admin.mutation(api.transcripts.remove, { workspaceId, transcriptId: id });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
    expect((await owner.query(api.transcripts.list, { workspaceId })).transcripts).toHaveLength(0);
  });

  it("becomes a Your data source only for an agent it is granted to, in its own workspace", async () => {
    const { t, workspaceId, otherWorkspace, owner, member } = await setUp();
    const id = await owner.mutation(api.transcripts.add, input(workspaceId));
    const save = (ws: Id<"workspaces">, agentSlug: string) =>
      t.run(async (ctx) => {
        const projectId = await ctx.db.insert("researchProjects", {
          workspaceId: ws,
          title: "Which offer is working",
          objective: "Find which offer is working",
          market: "Marketing agencies",
          geography: "United States",
          competitors: [],
          platforms: ["web"],
          suppliedUrls: [],
          status: "draft",
          createdBy: "user_owner",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const used = await saveTranscriptSourcesFor(ctx, { workspaceId: ws, projectId, agentSlug });
        const again = await saveTranscriptSourcesFor(ctx, { workspaceId: ws, projectId, agentSlug });
        const refs = await ctx.db.query("sourceRefs").withIndex("by_workspace_project", (q) => q.eq("workspaceId", ws).eq("projectId", projectId)).collect();
        return { used: used.length, again: again.length, refs };
      });

    const mine = await save(workspaceId, "growth-architect");
    expect(mine.used).toBe(1);
    // A second run refreshes the same source instead of adding another.
    expect(mine.refs).toHaveLength(1);
    expect(mine.refs[0]).toMatchObject({ platform: "customerData", origin: "supplied", publisher: "Your business", title: "Your call: Discovery call, Harbor Dental group (Fathom)" });
    expect(mine.refs[0].excerpt!.length).toBeLessThanOrEqual(300);
    expect(mine.refs[0].limitation).toContain("one call is not a pattern");

    expect((await save(workspaceId, "brand-studio")).used).toBe(0);
    expect((await save(otherWorkspace, "growth-architect")).used).toBe(0);

    await expect(member.mutation(api.transcripts.setAgentAccess, { workspaceId, transcriptId: id, agentSlug: "growth-architect", granted: false })).rejects.toThrow();
    await owner.mutation(api.transcripts.setAgentAccess, { workspaceId, transcriptId: id, agentSlug: "growth-architect", granted: false });
    expect((await save(workspaceId, "growth-architect")).used).toBe(0);
  });
});

describe("linking a call to a CRM lead", () => {
  const CALL_DAY = Date.parse("2026-11-03T15:00:00Z");

  async function withCrm() {
    const s = await setUp();
    await s.t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId: s.workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: CALL_DAY + 86_400_000,
        scopes: [],
        accountId: "loc1",
        accountName: "Harbor sub-account",
        currency: "USD",
        connectedBy: "user_owner",
        connectedAt: 0,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId: s.workspaceId, connectionId, seenAt: 0 };
      await ctx.db.insert("crmContacts", { ...base, externalId: "con1", name: "Priya Shah", email: "priya@example.com", source: "Facebook ads", tags: [] });
      await ctx.db.insert("crmContacts", { ...base, externalId: "con2", name: "Sam Ray", tags: [] });
      await ctx.db.insert("crmDeals", { ...base, externalId: "opp1", pipelineId: "p1", stageId: "s1", status: "open", value: 2400, contactId: "con1" });
      await ctx.db.insert("crmDeals", { ...base, externalId: "opp2", pipelineId: "p1", stageId: "s1", status: "open", value: 900, contactId: "con2" });
      await ctx.db.insert("crmActivities", { workspaceId: s.workspaceId, connectionId, externalId: "ev1", kind: "appointment", at: CALL_DAY, contactId: "con1", status: "showed" });
    });
    return s;
  }

  it("suggests the lead booked on the call's date, finds others by name, and links only when a person chooses", async () => {
    const { t, workspaceId, member } = await withCrm();
    const id = await member.mutation(api.transcripts.add, input(workspaceId));
    const choices = await member.query(api.transcripts.leadChoices, { workspaceId, transcriptId: id });
    expect(choices.crm).toBe("HighLevel");
    expect(choices.suggested).toEqual([{ contactRef: "con1", dealRef: "opp1", name: "Priya Shah", source: "Facebook ads" }]);
    expect(choices.matches).toEqual([]);
    expect((await member.query(api.transcripts.leadChoices, { workspaceId, transcriptId: id, q: "sam" })).matches.map((row) => row.name)).toEqual(["Sam Ray"]);
    // A suggestion links nothing.
    expect((await member.query(api.transcripts.list, { workspaceId })).transcripts[0].lead).toBeNull();

    await member.mutation(api.transcripts.linkLead, { workspaceId, transcriptId: id, contactRef: "con1", dealRef: "opp1" });
    expect((await member.query(api.transcripts.list, { workspaceId })).transcripts[0].lead).toEqual({ contactRef: "con1", dealRef: "opp1", name: "Priya Shah" });
    const forPriya = await t.run((ctx) => transcriptsFor(ctx, { workspaceId, agentSlug: "growth-architect", contactRef: "con1" }));
    expect(forPriya.map((row) => row._id)).toEqual([id]);

    await member.mutation(api.transcripts.linkLead, { workspaceId, transcriptId: id, contactRef: null });
    expect((await member.query(api.transcripts.list, { workspaceId })).transcripts[0].lead).toBeNull();
  });

  it("refuses a lead the CRM never had, another lead's deal, a Viewer, and a workspace with no CRM", async () => {
    const { workspaceId, member, viewer } = await withCrm();
    const id = await member.mutation(api.transcripts.add, input(workspaceId));
    await expect(member.mutation(api.transcripts.linkLead, { workspaceId, transcriptId: id, contactRef: "made-up" })).rejects.toThrow(/has not read that lead/);
    await expect(member.mutation(api.transcripts.linkLead, { workspaceId, transcriptId: id, contactRef: "con1", dealRef: "opp2" })).rejects.toThrow(/not this lead's/);
    await expect(viewer.mutation(api.transcripts.linkLead, { workspaceId, transcriptId: id, contactRef: "con1" })).rejects.toThrow();
    await expect(viewer.query(api.transcripts.leadChoices, { workspaceId, transcriptId: id })).rejects.toThrow();

    const bare = await setUp();
    const other = await bare.owner.mutation(api.transcripts.add, input(bare.workspaceId));
    expect(await bare.owner.query(api.transcripts.leadChoices, { workspaceId: bare.workspaceId, transcriptId: other })).toEqual({ crm: null, suggested: [], matches: [] });
    await expect(bare.owner.mutation(api.transcripts.linkLead, { workspaceId: bare.workspaceId, transcriptId: other, contactRef: "con1" })).rejects.toThrow(/Connect a CRM/);
  });

  it("gives an agent only the calls granted to it, for the same client", async () => {
    const { t, workspaceId, owner } = await withCrm();
    const id = await owner.mutation(api.transcripts.add, input(workspaceId));
    const read = (agentSlug: string) => t.run((ctx) => transcriptsFor(ctx, { workspaceId, agentSlug }));
    expect((await read("growth-architect")).map((row) => row._id)).toEqual([id]);
    expect(await read("sales-conversion")).toEqual([]);
    await owner.mutation(api.transcripts.setAgentAccess, { workspaceId, transcriptId: id, agentSlug: "sales-conversion", granted: true });
    expect((await read("sales-conversion")).map((row) => row._id)).toEqual([id]);
    // A call for the organization is never read into a client's work.
    const clientId = await t.run((ctx) => ctx.db.insert("clients", { workspaceId, type: "business", name: "Aster", normalizedName: "aster", status: "active", createdBy: "user_owner", createdAt: 0, updatedAt: 0 }));
    expect(await t.run((ctx) => transcriptsFor(ctx, { workspaceId, clientId, agentSlug: "sales-conversion" }))).toEqual([]);
  });
});
