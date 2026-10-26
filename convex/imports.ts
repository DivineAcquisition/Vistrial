import { v } from "convex/values";
import Papa from "papaparse";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { attachOrCreatePerson } from "./leads";
import { firstOpenStage, defaultCountry } from "./lib/seedSpine";
import { normalizeEmail, toE164 } from "./lib/phones";
import { workspaceMutation, workspaceQuery } from "./lib/builders";

const rowValidator = v.object({
  row: v.number(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  displayName: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  activityAt: v.optional(v.number()),
});

type ImportRow = {
  row: number;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  sourceId?: string;
  activityAt?: number;
};

export const createUpload = workspaceMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const start = workspaceMutation({
  args: {
    fileStorageId: v.id("_storage"),
    mappingJson: v.string(),
    historic: v.boolean(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("importRuns", {
      workspaceId: ctx.workspaceId,
      source: "csv",
      startedBy: ctx.member._id,
      fileStorageId: args.fileStorageId,
      mappingJson: args.mappingJson,
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
      historic: args.historic,
      dryRun: args.dryRun,
    });
    await ctx.scheduler.runAfter(0, internal.imports.parseFile, { importRunId: runId });
    return runId;
  },
});

export const getRun = workspaceQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.importRunId);
    if (!run || run.workspaceId !== ctx.workspaceId) return null;
    return {
      id: run._id,
      status: run.status,
      historic: run.historic,
      dryRun: run.dryRun,
      createdCount: run.createdCount,
      updatedCount: run.updatedCount,
      skippedCount: run.skippedCount,
      reviewCount: run.reviewCount,
      phoneUnreadableCount: run.phoneUnreadableCount,
      missingContactCount: run.missingContactCount,
      missingActivityCount: run.missingActivityCount,
      similarNameCount: run.similarNameCount,
      similarNameKept: run.similarNameKept,
      fileStorageId: run.fileStorageId,
      issues: JSON.parse(run.issuesJson) as Array<{ row: number; code: string }>,
    };
  },
});

export const parseFile = internalAction({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.imports.loadRun, { importRunId: args.importRunId });
    if (!run) return;
    // Convex queries and mutations can mint a URL. Only an action can read the bytes.
    const blob = await ctx.storage.get(run.fileStorageId);
    if (!blob) {
      await ctx.runMutation(internal.imports.failRun, { importRunId: args.importRunId, errorKind: "file_missing" });
      return;
    }
    const text = await blob.text();
    let parsed: { data: Record<string, string>[]; errors: Array<{ code: string }> };
    try {
      parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    } catch {
      await ctx.runMutation(internal.imports.failRun, { importRunId: args.importRunId, errorKind: "parse_failed" });
      return;
    }
    if ((parsed.errors ?? []).length > 0) {
      await ctx.runMutation(internal.imports.failRun, { importRunId: args.importRunId, errorKind: "parse_failed" });
      return;
    }
    const mapping = JSON.parse(run.mappingJson) as Record<string, string>;
    const rows: ImportRow[] = parsed.data.map((record, index) => ({
      row: index + 2,
      email: cell(record, mapping.email),
      phone: cell(record, mapping.phone),
      firstName: cell(record, mapping.firstName),
      lastName: cell(record, mapping.lastName),
      displayName: cell(record, mapping.displayName),
      sourceId: cell(record, mapping.sourceId),
      activityAt: epoch(cell(record, mapping.activityAt)),
    }));
    const size = 40;
    for (let index = 0; index < rows.length; index += size) {
      await ctx.runMutation(internal.imports.applyBatch, {
        importRunId: args.importRunId,
        rows: rows.slice(index, index + size),
      });
    }
    await ctx.runMutation(internal.imports.finishRun, { importRunId: args.importRunId });
  },
});

function cell(record: Record<string, string>, column: string | undefined) {
  if (!column) return undefined;
  const value = record[column];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function epoch(value: string | undefined) {
  if (!value) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const loadRun = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.importRunId);
    if (!run) return null;
    return {
      fileStorageId: run.fileStorageId,
      mappingJson: run.mappingJson,
      workspaceId: run.workspaceId,
      historic: run.historic,
      dryRun: run.dryRun,
      startedBy: run.startedBy,
    };
  },
});

export const failRun = internalMutation({
  args: { importRunId: v.id("importRuns"), errorKind: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importRunId, { status: "failed", errorKind: args.errorKind, dryNameKeysJson: undefined });
  },
});

export const finishRun = internalMutation({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.importRunId);
    if (!run || run.status === "failed") return;
    await ctx.db.patch(args.importRunId, { status: "done", dryNameKeysJson: undefined });
  },
});

export const applyBatch = internalMutation({
  args: { importRunId: v.id("importRuns"), rows: v.array(rowValidator) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.importRunId);
    if (!run) return;
    const country = await defaultCountry(ctx, run.workspaceId);
    const stage = await firstOpenStage(ctx, run.workspaceId);
    const budget = { kept: run.similarNameKept, seen: run.similarNameCount };
    const introduced = new Set<string>(run.dryNameKeysJson ? (JSON.parse(run.dryNameKeysJson) as string[]) : []);
    const issues = JSON.parse(run.issuesJson) as Array<{ row: number; code: string }>;
    let created = run.createdCount;
    let updated = run.updatedCount;
    let skipped = run.skippedCount;
    let review = run.reviewCount;
    let phones = run.phoneUnreadableCount;
    let missingContact = run.missingContactCount;
    let missingActivity = run.missingActivityCount;

    for (const row of args.rows) {
      const email = row.email ? normalizeEmail(row.email) : null;
      const phoneRaw = row.phone?.trim() ?? "";
      const phone = phoneRaw ? toE164(phoneRaw, country) : null;
      const phoneUnreadable = Boolean(phoneRaw && !phone);
      if (phoneUnreadable && pushIssue(issues, row.row, "phone_unreadable")) phones += 1;
      if (!email && !phone) {
        if (pushIssue(issues, row.row, "missing_contact")) {
          missingContact += 1;
          skipped += 1;
        }
        continue;
      }
      if (row.activityAt === undefined) {
        if (pushIssue(issues, row.row, "missing_activity_time")) {
          missingActivity += 1;
          skipped += 1;
        }
        continue;
      }
      const sourceId = row.sourceId?.trim() || email || phone || "";
      const displayName = row.displayName?.trim() || `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Unknown";
      const checksum = await digest(`${email ?? ""}|${phone ?? ""}|${displayName}|${row.activityAt}`);
      const existing = await ctx.db
        .query("sourceRecords")
        .withIndex("by_workspace_source_record", (q) =>
          q.eq("workspaceId", run.workspaceId).eq("source", "csv").eq("sourceId", sourceId).eq("kind", "lead"),
        )
        .unique();
      if (existing && existing.checksum === checksum) {
        skipped += 1;
        continue;
      }
      const emailPerson = email ? await personIdFor(ctx, run.workspaceId, "email", email) : null;
      const phonePerson = phone ? await personIdFor(ctx, run.workspaceId, "phone", phone) : null;
      if (emailPerson && phonePerson && emailPerson !== phonePerson) {
        review += 1;
        if (!run.dryRun) {
          await holdSplit(ctx, {
            workspaceId: run.workspaceId,
            importRunId: run._id,
            sourceId,
            historic: run.historic,
            checksum,
            email,
            phone,
            displayName,
            activityAt: row.activityAt,
            emailPerson,
            phonePerson,
            existing,
          });
        }
        continue;
      }
      if (run.dryRun) {
        if (existing) updated += 1;
        else created += 1;
        if (!emailPerson && !phonePerson) {
          await noteDryName(ctx, run.workspaceId, normalizeName(displayName), budget, introduced);
        }
        continue;
      }
      const personId = await attachOrCreatePerson(
        { ...ctx, workspaceId: run.workspaceId },
        {
          email,
          phone,
          displayName,
          firstName: row.firstName ?? "",
          lastName: row.lastName ?? "",
          source: "csv",
          at: row.activityAt,
          similarNameBudget: budget,
        },
      );
      if (personId === "split") {
        review += 1;
        const left = email ? await personIdFor(ctx, run.workspaceId, "email", email) : null;
        const right = phone ? await personIdFor(ctx, run.workspaceId, "phone", phone) : null;
        if (left && right && left !== right) {
          await holdSplit(ctx, {
            workspaceId: run.workspaceId,
            importRunId: run._id,
            sourceId,
            historic: run.historic,
            checksum,
            email,
            phone,
            displayName,
            activityAt: row.activityAt,
            emailPerson: left,
            phonePerson: right,
            existing,
          });
        }
        continue;
      }
      if (existing?.leadId) {
        const current = await ctx.db.get(existing.leadId);
        if (current) {
          await bumpActivity(ctx, current._id, row.activityAt);
          await ctx.db.patch(existing._id, {
            checksum,
            status: "applied",
            activityAt: row.activityAt,
            importRunId: run._id,
            normalizedEmail: email ?? undefined,
            normalizedPhone: phone ?? undefined,
            displayName,
          });
          updated += 1;
          continue;
        }
      }
      const leadId = await insertImportedLead(ctx, {
        workspaceId: run.workspaceId,
        personId,
        stageId: stage._id,
        ownerMemberId: run.startedBy,
        historic: run.historic,
        activityAt: row.activityAt,
      });
      if (existing) {
        await ctx.db.patch(existing._id, {
          checksum,
          status: "applied",
          activityAt: row.activityAt,
          importRunId: run._id,
          leadId,
          normalizedEmail: email ?? undefined,
          normalizedPhone: phone ?? undefined,
          displayName,
        });
      } else {
        await ctx.db.insert("sourceRecords", {
          workspaceId: run.workspaceId,
          source: "csv",
          sourceId,
          kind: "lead",
          importRunId: run._id,
          historic: run.historic,
          checksum,
          status: "applied",
          leadId,
          normalizedEmail: email ?? undefined,
          normalizedPhone: phone ?? undefined,
          displayName,
          activityAt: row.activityAt,
        });
      }
      created += 1;
    }

    await ctx.db.patch(run._id, {
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      reviewCount: review,
      phoneUnreadableCount: phones,
      missingContactCount: missingContact,
      missingActivityCount: missingActivity,
      similarNameCount: budget.seen,
      similarNameKept: budget.kept,
      issuesJson: JSON.stringify(issues.slice(0, 200)),
      dryNameKeysJson: run.dryRun ? JSON.stringify([...introduced].slice(0, 4000)) : undefined,
      status: "running",
    });
  },
});

const SIMILAR_CAP = 50;

function pushIssue(issues: Array<{ row: number; code: string }>, row: number, code: string) {
  if (issues.some((issue) => issue.row === row && issue.code === code)) return false;
  if (issues.length < 200) issues.push({ row, code });
  return true;
}

async function noteDryName(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  name: string,
  budget: { kept: number; seen: number },
  introduced: Set<string>,
) {
  if (!name) return;
  const rows = await ctx.db
    .query("people")
    .withIndex("by_workspace_name", (q) => q.eq("workspaceId", workspaceId).eq("normalizedName", name))
    .take(5);
  const exists = rows.some((person) => !person.mergedIntoPersonId) || introduced.has(name);
  if (!exists) {
    if (introduced.size < 4000) introduced.add(name);
    return;
  }
  budget.seen += 1;
  if (budget.kept < SIMILAR_CAP) budget.kept += 1;
}

async function bumpActivity(ctx: MutationCtx, id: Id<"leads">, at: number) {
  const lead = await ctx.db.get(id);
  if (!lead) return;
  if (lead.lastActivityAt === undefined || at > lead.lastActivityAt) {
    await ctx.db.patch(id, { lastActivityAt: at });
  }
}

async function insertImportedLead(
  ctx: MutationCtx,
  input: {
    workspaceId: Id<"workspaces">;
    personId: Id<"people">;
    stageId: Id<"pipelineStages">;
    ownerMemberId: Id<"members">;
    historic: boolean;
    activityAt: number;
  },
) {
  const leadId = await ctx.db.insert("leads", {
    workspaceId: input.workspaceId,
    personId: input.personId,
    stageId: input.stageId,
    source: "csv",
    ownerMemberId: input.ownerMemberId,
    status: "open",
    historic: input.historic,
    lastActivityAt: input.activityAt,
    createdAt: input.activityAt,
  });
  if (!input.historic) {
    await ctx.db.insert("leadTimeline", {
      workspaceId: input.workspaceId,
      leadId,
      kind: "lead.created",
      refTable: "leads",
      refId: leadId,
      at: input.activityAt,
      actorMemberId: input.ownerMemberId,
    });
  }
  return leadId;
}

async function holdSplit(
  ctx: MutationCtx,
  input: {
    workspaceId: Id<"workspaces">;
    importRunId: Id<"importRuns">;
    sourceId: string;
    historic: boolean;
    checksum: string;
    email: string | null;
    phone: string | null;
    displayName: string;
    activityAt: number;
    emailPerson: Id<"people">;
    phonePerson: Id<"people">;
    existing: { _id: Id<"sourceRecords"> } | null;
  },
) {
  const fields = {
    status: "needs_review",
    checksum: input.checksum,
    activityAt: input.activityAt,
    normalizedEmail: input.email ?? undefined,
    normalizedPhone: input.phone ?? undefined,
    displayName: input.displayName,
    historic: input.historic,
    importRunId: input.importRunId,
  };
  const recordId = input.existing
    ? input.existing._id
    : await ctx.db.insert("sourceRecords", {
        workspaceId: input.workspaceId,
        source: "csv",
        sourceId: input.sourceId,
        kind: "lead",
        ...fields,
      });
  if (input.existing) await ctx.db.patch(input.existing._id, fields);
  const pending = await ctx.db
    .query("possibleMatches")
    .withIndex("by_workspace_record", (q) => q.eq("workspaceId", input.workspaceId).eq("sourceRecordId", recordId))
    .take(5);
  if (pending.some((row) => row.status === "pending")) return;
  await ctx.db.insert("possibleMatches", {
    workspaceId: input.workspaceId,
    personAId: input.emailPerson,
    personBId: input.phonePerson,
    sourceRecordId: recordId,
    reason: "email_phone_split",
    status: "pending",
  });
}

function normalizeName(displayName?: string, firstName?: string, lastName?: string) {
  const value = (displayName?.trim() || `${firstName ?? ""} ${lastName ?? ""}`.trim()).toLowerCase().replace(/\s+/g, " ");
  return value;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function personIdFor(ctx: MutationCtx, workspaceId: Id<"workspaces">, kind: "email" | "phone", value: string) {
  const row = await ctx.db
    .query("identities")
    .withIndex("by_workspace_kind_value", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("value", value))
    .unique();
  if (!row) return null;
  const person = await ctx.db.get(row.personId);
  if (!person) return null;
  return person.mergedIntoPersonId ?? person._id;
}
