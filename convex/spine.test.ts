/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { NOT_FOUND } from "./lib/errors";
import schema from "./schema";

function asDoc<Table extends "leads" | "people" | "mergeRecords">(value: unknown) {
  return value as Doc<Table> | null;
}

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const page = { numItems: 10, cursor: null };

function person(subject: string, email: string) {
  return {
    subject,
    email,
    name: email,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

async function workspace() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const owner = t.withIdentity(person("owner", "owner@example.com"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  const inviteA = await owner.mutation(api.workspace.invite, { workspaceId, email: "a@example.com", role: "rep" });
  const inviteB = await owner.mutation(api.workspace.invite, { workspaceId, email: "b@example.com", role: "rep" });
  const inviteM = await owner.mutation(api.workspace.invite, { workspaceId, email: "m@example.com", role: "manager" });
  const repA = t.withIdentity(person("rep-a", "a@example.com"));
  const repB = t.withIdentity(person("rep-b", "b@example.com"));
  const manager = t.withIdentity(person("manager", "m@example.com"));
  await repA.mutation(api.workspace.acceptInvite, { token: inviteA.token });
  await repB.mutation(api.workspace.acceptInvite, { token: inviteB.token });
  await manager.mutation(api.workspace.acceptInvite, { token: inviteM.token });
  const members = await t.run(async (ctx) =>
    ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(10),
  );
  return {
    t,
    owner,
    manager,
    repA,
    repB,
    workspaceId,
    repAId: members.find((row) => row.userId === "rep-a")!._id,
    repBId: members.find((row) => row.userId === "rep-b")!._id,
    ownerId: members.find((row) => row.userId === "owner")!._id,
  };
}

describe("data spine", () => {
  it("imports the same rows twice without a second lead, and keeps one person for one email", async () => {
    const { t, workspaceId, ownerId } = await workspace();
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId: await ctx.storage.store(new Blob(["email,activity\n"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: false,
      }),
    );
    const rows = [{ row: 2, email: "ada@example.com", displayName: "Ada Lovelace", activityAt: 1_700_000_000_000, phone: "not-a-phone" }];
    await t.mutation(internal.imports.applyBatch, { importRunId, rows });
    await t.mutation(internal.imports.applyBatch, { importRunId, rows });
    const leads = await t.run(async (ctx) => ctx.db.query("leads").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(10));
    const people = await t.run(async (ctx) => ctx.db.query("people").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(10));
    const identities = await t.run(async (ctx) => ctx.db.query("identities").take(10));
    expect(leads).toHaveLength(1);
    expect(people).toHaveLength(1);
    expect(identities.filter((row) => row.kind === "email")).toHaveLength(1);
    const run = await t.run(async (ctx) => ctx.db.get(importRunId));
    expect(run?.phoneUnreadableCount).toBeGreaterThan(0);
    expect(JSON.parse(run?.issuesJson ?? "[]")).toEqual(expect.arrayContaining([{ row: 2, code: "phone_unreadable" }]));
    const timeline = await t.run(async (ctx) => ctx.db.query("leadTimeline").take(10));
    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").take(10));
    expect(timeline).toEqual([]);
    expect(tasks).toEqual([]);
    expect(leads[0]?.lastActivityAt).toBe(1_700_000_000_000);
  });

  it("holds a split, merges with stricter consent, restores it, and refuses a second undo", async () => {
    const { t, owner, workspaceId } = await workspace();
    const first = await owner.mutation(api.leads.create, {
      workspaceId,
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    const second = await owner.mutation(api.leads.create, {
      workspaceId,
      displayName: "Grace Hopper",
      email: "grace@example.com",
      phone: "+12025550123",
    });
    const ada = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(first)));
    const grace = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(second)));
    await owner.mutation(api.people.setConsent, {
      workspaceId,
      personId: grace!.personId!,
      channel: "email",
      next: "revoked",
      doNotContact: true,
    });
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: (await ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(1))[0]!._id,
        fileStorageId: await ctx.storage.store(new Blob(["x"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: false,
      }),
    );
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [{ row: 2, email: "ada@example.com", phone: "+12025550123", displayName: "Ada Grace", activityAt: 1_700_000_000_000 }],
    });
    const matches = await owner.query(api.merges.listMatches, { workspaceId });
    expect(matches.some((row: { reason: string }) => row.reason === "email_phone_split")).toBe(true);
    const leadCount = await t.run(async (ctx) =>
      (await ctx.db.query("leads").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(10)).length,
    );
    expect(leadCount).toBe(2);

    const mergeId = await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: ada!.personId!,
      mergedPersonId: grace!.personId!,
    });
    const stored = asDoc<"mergeRecords">(await t.run(async (ctx) => ctx.db.get(mergeId)));
    const snap = JSON.parse(stored!.snapshotJson) as { prior: { emailConsent: string; doNotContact: boolean } };
    expect(snap.prior.emailConsent).toBe("unknown");
    expect(snap.prior.doNotContact).toBe(false);
    const survivor = asDoc<"people">(await t.run(async (ctx) => ctx.db.get(ada!.personId!)));
    expect(survivor?.emailConsent).toBe("revoked");
    expect(survivor?.doNotContact).toBe(true);
    const replayed = await t.run(async (ctx) =>
      ctx.db.query("leads").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(10),
    );
    expect(replayed).toHaveLength(3);
    const held = await t.run(async (ctx) => ctx.db.query("sourceRecords").take(5));
    expect(held.every((row) => row.status === "applied")).toBe(true);
    const timelineAfter = await t.run(async (ctx) => ctx.db.query("leadTimeline").take(10));
    expect(timelineAfter.filter((row) => row.kind === "lead.created")).toHaveLength(2);
    const moved = await t.run(async (ctx) =>
      ctx.db.query("identities").withIndex("by_workspace_person", (q) => q.eq("workspaceId", workspaceId).eq("personId", ada!.personId!)).take(10),
    );
    expect(moved.length).toBeGreaterThan(1);

    await owner.mutation(api.merges.undo, { workspaceId, mergeId });
    const restored = asDoc<"people">(await t.run(async (ctx) => ctx.db.get(ada!.personId!)));
    const graceAgain = asDoc<"people">(await t.run(async (ctx) => ctx.db.get(grace!.personId!)));
    expect(restored?.emailConsent).toBe("unknown");
    expect(restored?.doNotContact).toBe(false);
    expect(graceAgain?.mergedIntoPersonId).toBeUndefined();
    const graceIds = await t.run(async (ctx) =>
      ctx.db.query("identities").withIndex("by_workspace_person", (q) => q.eq("workspaceId", workspaceId).eq("personId", grace!.personId!)).take(10),
    );
    expect(graceIds.length).toBeGreaterThan(0);

    const again = await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: ada!.personId!,
      mergedPersonId: grace!.personId!,
    });
    const third = await owner.mutation(api.leads.create, {
      workspaceId,
      displayName: "Third Person",
      email: "third@example.com",
    });
    const thirdLead = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(third)));
    const later = await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: thirdLead!.personId!,
      mergedPersonId: ada!.personId!,
    });
    await expect(owner.mutation(api.merges.undo, { workspaceId, mergeId: again })).rejects.toThrow("This merge cannot be undone.");
    expect(later).toBeTruthy();
  });

  it("keeps a Rep out of another Rep's records and out of clearing an opt-out", async () => {
    const { t, owner, manager, repA, repB, workspaceId, repBId } = await workspace();
    const leadId = await owner.mutation(api.leads.create, {
      workspaceId,
      displayName: "Owned by B",
      email: "b-lead@example.com",
      ownerMemberId: repBId,
    });
    const noteId = await owner.mutation(api.records.addNote, { workspaceId, leadId, body: "secret note text" });
    const taskId = await owner.mutation(api.records.addTask, { workspaceId, leadId, title: "Call back", purposeKey: "call" });
    const callId = await owner.mutation(api.records.addCall, { workspaceId, leadId, occurredAt: 1_700_000_000_000 });
    const bookingId = await owner.mutation(api.records.addBooking, {
      workspaceId,
      leadId,
      startsAt: 1_700_000_100_000,
      endsAt: 1_700_000_200_000,
    });
    const messageId = await owner.mutation(api.records.addMessage, {
      workspaceId,
      leadId,
      text: "secret message text",
      at: 1_700_000_300_000,
      direction: "in",
    });
    const conversationId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("conversations")
        .withIndex("by_workspace_lead", (q) => q.eq("workspaceId", workspaceId).eq("leadId", leadId))
        .take(1);
      return rows[0]!._id;
    });
    const owned = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(leadId)));
    const calls = [
      repA.query(api.leads.get, { workspaceId, leadId }),
      repA.query(api.records.timeline, { workspaceId, leadId }),
      repA.query(api.records.listNotes, { workspaceId, leadId }),
      repA.query(api.records.getNote, { workspaceId, noteId }),
      repA.mutation(api.records.addNote, { workspaceId, leadId, body: "nope" }),
      repA.query(api.records.listTasks, { workspaceId, leadId }),
      repA.query(api.records.getTask, { workspaceId, taskId }),
      repA.mutation(api.records.addTask, { workspaceId, leadId, title: "nope", purposeKey: "other" }),
      repA.query(api.records.listCalls, { workspaceId, leadId }),
      repA.query(api.records.getCall, { workspaceId, callId }),
      repA.mutation(api.records.addCall, { workspaceId, leadId, occurredAt: 1_700_000_600_000 }),
      repA.query(api.records.listBookings, { workspaceId, leadId }),
      repA.query(api.records.getBooking, { workspaceId, bookingId }),
      repA.mutation(api.records.addBooking, { workspaceId, leadId, startsAt: 1_700_000_700_000, endsAt: 1_700_000_800_000 }),
      repA.query(api.records.listMessages, { workspaceId, leadId }),
      repA.query(api.records.getMessage, { workspaceId, messageId }),
      repA.mutation(api.records.addMessage, { workspaceId, leadId, text: "nope", at: 1_700_000_900_000, direction: "out" }),
      repA.query(api.records.getConversation, { workspaceId, conversationId }),
      repA.query(api.people.readConsent, { workspaceId, personId: owned!.personId! }),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(NOT_FOUND);
    await expect(repA.query(api.merges.listMatches, { workspaceId })).rejects.toThrow("Not allowed.");
    await expect(repA.query(api.merges.listMerges, { workspaceId })).rejects.toThrow("Not allowed.");

    const booking = await owner.query(api.records.getBooking, { workspaceId, bookingId });
    expect(booking.status).toBe("booked");
    const shown = await owner.mutation(api.records.addBooking, {
      workspaceId,
      leadId,
      startsAt: 1_700_000_400_000,
      endsAt: 1_700_000_500_000,
      status: "noShow",
    });
    expect((await owner.query(api.records.getBooking, { workspaceId, bookingId: shown })).status).toBe("noShow");

    const lead = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(leadId)));
    await repB.mutation(api.people.setConsent, {
      workspaceId,
      personId: lead!.personId!,
      channel: "email",
      next: "revoked",
      doNotContact: true,
    });
    await expect(
      repB.mutation(api.people.setConsent, {
        workspaceId,
        personId: lead!.personId!,
        channel: "email",
        next: "granted",
        doNotContact: false,
        reason: "They asked to come back",
      }),
    ).rejects.toThrow("Not allowed.");
    await expect(
      manager.mutation(api.people.setConsent, {
        workspaceId,
        personId: lead!.personId!,
        channel: "email",
        next: "granted",
        doNotContact: false,
      }),
    ).rejects.toThrow("A reason is required.");
    await manager.mutation(api.people.setConsent, {
      workspaceId,
      personId: lead!.personId!,
      channel: "email",
      next: "granted",
      doNotContact: false,
      reason: "They asked to come back",
    });
    const audit = await t.run(async (ctx) => ctx.db.query("auditLog").take(30));
    const timeline = await t.run(async (ctx) => ctx.db.query("leadTimeline").take(20));
    const dumped = JSON.stringify({ audit, timeline });
    expect(dumped).not.toContain("secret note text");
    expect(dumped).not.toContain("secret message text");
    expect(dumped).not.toContain("They asked to come back");
  });

  it("dry run lists row issues and similar names without writing people or leads", async () => {
    const { t, owner, workspaceId, ownerId } = await workspace();
    await owner.mutation(api.leads.create, { workspaceId, displayName: "Ada Lovelace", email: "ada@example.com" });
    await owner.mutation(api.leads.create, {
      workspaceId,
      displayName: "Grace Hopper",
      email: "grace@example.com",
      phone: "+12025550123",
    });
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId: await ctx.storage.store(new Blob(["x"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: true,
      }),
    );
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [
        { row: 2, email: "other@example.com", displayName: "Ada Lovelace", activityAt: 1_700_000_000_000 },
        { row: 3, phone: "not-a-phone", activityAt: 1_700_000_000_000 },
        { row: 4, activityAt: 1_700_000_000_000 },
        { row: 5, email: "no-time@example.com" },
        { row: 6, email: "ada@example.com", phone: "+12025550123", displayName: "Ada Grace", activityAt: 1_700_000_000_000 },
      ],
    });
    const run = await t.run(async (ctx) => ctx.db.get(importRunId));
    expect(run?.createdCount).toBe(1);
    expect(run?.reviewCount).toBe(1);
    expect(run?.phoneUnreadableCount).toBe(1);
    expect(run?.missingContactCount).toBe(2);
    expect(run?.missingActivityCount).toBe(1);
    expect(run?.similarNameCount).toBe(1);
    expect(run?.similarNameKept).toBe(1);
    expect(JSON.parse(run?.issuesJson ?? "[]")).toEqual(
      expect.arrayContaining([
        { row: 3, code: "phone_unreadable" },
        { row: 3, code: "missing_contact" },
        { row: 4, code: "missing_contact" },
        { row: 5, code: "missing_activity_time" },
      ]),
    );
    const people = await t.run(async (ctx) => ctx.db.query("people").take(10));
    const leads = await t.run(async (ctx) => ctx.db.query("leads").take(10));
    const records = await t.run(async (ctx) => ctx.db.query("sourceRecords").take(10));
    const matches = await t.run(async (ctx) => ctx.db.query("possibleMatches").take(10));
    expect(people).toHaveLength(2);
    expect(leads).toHaveLength(2);
    expect(records).toEqual([]);
    expect(matches).toEqual([]);
    await t.mutation(internal.imports.finishRun, { importRunId });
    const finished = await t.run(async (ctx) => ctx.db.get(importRunId));
    expect(finished?.dryNameKeysJson).toBeUndefined();
    expect(finished?.status).toBe("done");
  });

  it("reuses one lead when the same source id is imported again and adds the new phone", async () => {
    const { t, workspaceId, ownerId } = await workspace();
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId: await ctx.storage.store(new Blob(["x"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: false,
      }),
    );
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [{ row: 2, email: "ada@example.com", sourceId: "crm-1", displayName: "Ada", activityAt: 1_700_000_000_000 }],
    });
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [
        {
          row: 2,
          email: "ada@example.com",
          phone: "+12025550123",
          sourceId: "crm-1",
          displayName: "Ada",
          activityAt: 1_800_000_000_000,
        },
      ],
    });
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [
        {
          row: 2,
          email: "ada@example.com",
          phone: "+12025550123",
          sourceId: "crm-1",
          displayName: "Ada",
          activityAt: 1_600_000_000_000,
        },
      ],
    });
    const leads = await t.run(async (ctx) => ctx.db.query("leads").take(10));
    const identities = await t.run(async (ctx) => ctx.db.query("identities").take(10));
    const records = await t.run(async (ctx) => ctx.db.query("sourceRecords").take(10));
    expect(leads).toHaveLength(1);
    expect(leads[0]?.lastActivityAt).toBe(1_800_000_000_000);
    expect(identities.map((row) => row.kind).sort()).toEqual(["email", "phone"]);
    expect(records).toHaveLength(1);
  });

  it("keeps at most 50 exact name matches in one run", async () => {
    const { t, workspaceId, ownerId } = await workspace();
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId: await ctx.storage.store(new Blob(["x"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: false,
      }),
    );
    const rows = Array.from({ length: 52 }, (_, index) => ({
      row: index + 2,
      email: `person${index}@example.com`,
      sourceId: `id-${index}`,
      displayName: "Same Name",
      activityAt: 1_700_000_000_000 + index,
    }));
    await t.mutation(internal.imports.applyBatch, { importRunId, rows });
    const run = await t.run(async (ctx) => ctx.db.get(importRunId));
    const matches = await t.run(async (ctx) => ctx.db.query("possibleMatches").take(60));
    expect(run?.similarNameKept).toBe(50);
    expect(run?.similarNameCount).toBe(51);
    expect(matches).toHaveLength(50);
    expect(matches.every((row) => row.reason === "similar_name")).toBe(true);
  });

  it("does not replay a held row after it is dismissed", async () => {
    const { t, owner, workspaceId, ownerId } = await workspace();
    const ada = await owner.mutation(api.leads.create, { workspaceId, displayName: "Ada", email: "ada@example.com" });
    await owner.mutation(api.leads.create, { workspaceId, displayName: "Grace", email: "grace@example.com", phone: "+12025550123" });
    const adaLead = asDoc<"leads">(await t.run(async (ctx) => ctx.db.get(ada)));
    const importRunId = await t.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId: await ctx.storage.store(new Blob(["x"])),
        mappingJson: "{}",
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: false,
        dryRun: false,
      }),
    );
    await t.mutation(internal.imports.applyBatch, {
      importRunId,
      rows: [{ row: 2, email: "ada@example.com", phone: "+12025550123", displayName: "Ada Grace", activityAt: 1_700_000_000_000 }],
    });
    const matches = await owner.query(api.merges.listMatches, { workspaceId });
    await owner.mutation(api.merges.dismiss, { workspaceId, matchId: matches[0]!.id });
    const grace = await t.run(async (ctx) =>
      ctx.db.query("people").withIndex("by_workspace_name", (q) => q.eq("workspaceId", workspaceId).eq("normalizedName", "grace")).unique(),
    );
    await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: adaLead!.personId!,
      mergedPersonId: grace!._id,
    });
    const leads = await t.run(async (ctx) => ctx.db.query("leads").take(10));
    const record = await t.run(async (ctx) => ctx.db.query("sourceRecords").take(5));
    expect(leads).toHaveLength(2);
    expect(record[0]?.status).toBe("skipped");
  });

  it("refuses undo when the survivor later absorbs someone else", async () => {
    const { owner, workspaceId } = await workspace();
    const first = await owner.mutation(api.leads.create, { workspaceId, displayName: "Ada", email: "ada@example.com" });
    const second = await owner.mutation(api.leads.create, { workspaceId, displayName: "Grace", email: "grace@example.com" });
    const third = await owner.mutation(api.leads.create, { workspaceId, displayName: "Third", email: "third@example.com" });
    const ada = await owner.query(api.leads.get, { workspaceId, leadId: first });
    const grace = await owner.query(api.leads.get, { workspaceId, leadId: second });
    const other = await owner.query(api.leads.get, { workspaceId, leadId: third });
    const mergeId = await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: ada.personId!,
      mergedPersonId: grace.personId!,
    });
    await owner.mutation(api.merges.merge, {
      workspaceId,
      survivorPersonId: ada.personId!,
      mergedPersonId: other.personId!,
    });
    await expect(owner.mutation(api.merges.undo, { workspaceId, mergeId })).rejects.toThrow("This merge cannot be undone.");
  });

  it("pages leads by activity and keeps every selected filter", async () => {
    const { t, owner, repA, workspaceId, repAId, repBId } = await workspace();
    const stages = await owner.query(api.leads.stages, { workspaceId });
    expect(stages.map((stage: { name: string }) => stage.name)).toEqual(["New", "Working", "Booked", "Won", "Lost"]);
    expect(await owner.query(api.leads.country, { workspaceId })).toBe("US");
    await owner.mutation(api.leads.setCountry, { workspaceId, country: "gb" });
    expect(await owner.query(api.leads.country, { workspaceId })).toBe("GB");
    const stageId = stages[0]!.id;
    await t.run(async (ctx) => {
      for (let index = 0; index < 25; index += 1) {
        await ctx.db.insert("leads", {
          workspaceId,
          ownerMemberId: index % 2 === 0 ? repAId : repBId,
          stageId,
          source: index % 2 === 0 ? "csv" : "manual",
          status: "open",
          historic: true,
          lastActivityAt: index + 1,
          createdAt: index + 1,
        });
      }
    });
    const first = await owner.query(api.leads.list, { workspaceId, paginationOpts: { numItems: 10, cursor: null } });
    expect(first.page).toHaveLength(10);
    expect(first.page[0].lastActivityAt).toBe(25);
    expect(first.page[9].lastActivityAt).toBe(16);
    const second = await owner.query(api.leads.list, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(10);
    expect(second.page[0].lastActivityAt).toBe(15);
    await t.run(async (ctx) => {
      await ctx.db.insert("leads", {
        workspaceId,
        ownerMemberId: repBId,
        stageId,
        source: "csv",
        status: "open",
        historic: true,
        lastActivityAt: 100,
        createdAt: 100,
      });
    });
    const csv = await owner.query(api.leads.list, {
      workspaceId,
      stageId,
      status: "open",
      source: "csv",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(csv.page.length).toBeGreaterThan(0);
    expect(csv.page.every((row: { source: string }) => row.source === "csv")).toBe(true);
    const own = await repA.query(api.leads.list, {
      workspaceId,
      source: "csv",
      ownerMemberId: repBId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(own.page.every((row: { ownerMemberId: string }) => row.ownerMemberId === repAId)).toBe(true);
    expect(own.page.some((row: { lastActivityAt: number }) => row.lastActivityAt === 100)).toBe(false);
  });

  it("reads the file from an action and stamps the source time", async () => {
    const { t, workspaceId, ownerId } = await workspace();
    const when = Date.parse("2024-01-02T00:00:00.000Z");
    const importRunId = await t.run(async (ctx) => {
      const fileStorageId = await ctx.storage.store(
        new Blob([
          "email,phone,name,source_id,activity_at\nada@example.com,,Ada File,file-1,2024-01-02T00:00:00.000Z\n,not-a-phone,Nope,file-2,2024-01-02T00:00:00.000Z\n",
        ]),
      );
      return ctx.db.insert("importRuns", {
        workspaceId,
        source: "csv",
        startedBy: ownerId,
        fileStorageId,
        mappingJson: JSON.stringify({
          email: "email",
          phone: "phone",
          displayName: "name",
          sourceId: "source_id",
          activityAt: "activity_at",
        }),
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        phoneUnreadableCount: 0,
        missingContactCount: 0,
        missingActivityCount: 0,
        similarNameCount: 0,
        similarNameKept: 0,
        issuesJson: "[]",
        status: "queued",
        historic: true,
        dryRun: false,
      });
    });
    await t.action(internal.imports.parseFile, { importRunId });
    const run = await t.run(async (ctx) => ctx.db.get(importRunId));
    const leads = await t.run(async (ctx) => ctx.db.query("leads").take(10));
    expect(run?.status).toBe("done");
    expect(leads).toHaveLength(1);
    expect(leads[0]?.lastActivityAt).toBe(when);
    expect(run?.phoneUnreadableCount).toBe(1);
    expect(run?.missingContactCount).toBe(1);
    expect(JSON.parse(run?.issuesJson ?? "[]")).toEqual(
      expect.arrayContaining([
        { row: 3, code: "phone_unreadable" },
        { row: 3, code: "missing_contact" },
      ]),
    );
    const timeline = await t.run(async (ctx) => ctx.db.query("leadTimeline").take(10));
    expect(timeline).toEqual([]);
  });
});
