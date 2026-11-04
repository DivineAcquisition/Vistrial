import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { writeAudit } from "./audit";
import type { FactSourceType } from "./factShapes";

export const MAX_FACT_VALUE = 500;
export const MAX_FACT_REFERENCE = 200;
const FACT_KEY = /^[a-z][A-Za-z0-9]{1,49}$/;

/** Plain words for a refused fact. */
export const FACT_TEXT = {
  badKey: "A fact key is one word in camelCase, such as monthlyAdBudget.",
  emptyValue: "Write the fact.",
  longValue: `Keep a fact to ${MAX_FACT_VALUE} characters.`,
  needsReference: "A fact from an agent, an upload or feedback needs a source reference.",
  notLive: "That fact has been replaced or removed. Change the current one.",
};

export function cleanFactKey(raw: string) {
  const key = raw.trim();
  if (!FACT_KEY.test(key)) throw new Error(FACT_TEXT.badKey);
  return key;
}

export function cleanFactValue(raw: string) {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) throw new Error(FACT_TEXT.emptyValue);
  if (value.length > MAX_FACT_VALUE) throw new Error(FACT_TEXT.longValue);
  return value;
}

/** A live fact has not been replaced and not been removed. */
export function isLive(row: Doc<"businessFacts">) {
  return row.status !== "superseded" && row.deletedAt === undefined;
}

/** The current fact for a key, or null. Newest first, so an older row left live by mistake never wins. */
export async function liveFact(ctx: QueryCtx, workspaceId: Id<"workspaces">, factKey: string) {
  const rows = await ctx.db
    .query("businessFacts")
    .withIndex("by_workspace_key", (q) => q.eq("workspaceId", workspaceId).eq("factKey", factKey))
    .order("desc")
    .take(50);
  return rows.find(isLive) ?? null;
}

export type FactWrite = {
  workspaceId: Id<"workspaces">;
  factKey: string;
  value: string;
  sourceType: FactSourceType;
  sourceReference?: string;
  recordedBy: string;
  runId?: Id<"agentRuns">;
  /** Set only when a person states or confirms the fact. */
  verifiedBy?: string;
};

/**
 * Writes a fact. Replacing inserts a new row and marks the old one superseded; nothing is edited into a
 * new value. A person's statement (`verifiedBy` set) is verified. Everything else is unverified.
 */
export async function writeFact(ctx: MutationCtx, input: FactWrite) {
  const factKey = cleanFactKey(input.factKey);
  const value = cleanFactValue(input.value);
  const reference = input.sourceReference?.trim().slice(0, MAX_FACT_REFERENCE) || undefined;
  if (!reference && input.sourceType !== "owner" && input.sourceType !== "assumption") throw new Error(FACT_TEXT.needsReference);
  const current = await liveFact(ctx, input.workspaceId, factKey);
  const now = Date.now();
  const id = await ctx.db.insert("businessFacts", {
    workspaceId: input.workspaceId,
    factKey,
    value,
    sourceType: input.sourceType,
    sourceReference: reference,
    recordedAt: now,
    recordedBy: input.recordedBy,
    runId: input.runId,
    status: input.verifiedBy ? "verified" : "unverified",
    verifiedAt: input.verifiedBy ? now : undefined,
    verifiedBy: input.verifiedBy,
    supersedesFactId: current?._id,
  });
  if (current) await ctx.db.patch(current._id, { status: "superseded" });
  await writeAudit(ctx, {
    workspaceId: input.workspaceId,
    actorType: input.verifiedBy ? "user" : "system",
    actorId: input.recordedBy,
    action: current ? "fact.replaced" : "fact.recorded",
    subject: id,
  });
  return id;
}

/**
 * An agent's fact. Always unverified: nothing an agent produces verifies itself. It never replaces a fact a
 * person verified; then nothing is written and the verified fact stays current.
 */
export async function writeAgentFact(
  ctx: MutationCtx,
  input: Omit<FactWrite, "verifiedBy" | "recordedBy" | "sourceType"> & { sourceType: "agent" | "assumption" | "upload" },
) {
  const current = await liveFact(ctx, input.workspaceId, cleanFactKey(input.factKey));
  if (current?.status === "verified") return { id: current._id, written: false };
  return { id: await writeFact(ctx, { ...input, recordedBy: "agent" }), written: true };
}

/** What a run may use: live facts with their status. Superseded and removed facts are never current. */
export async function factsForRun(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const out: Doc<"businessFacts">[] = [];
  for (const status of ["verified", "unverified", "disputed"] as const) {
    const rows = await ctx.db
      .query("businessFacts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .order("desc")
      .take(200);
    out.push(...rows.filter((row) => row.deletedAt === undefined));
  }
  return out;
}

export function factView(row: Doc<"businessFacts">) {
  return {
    id: row._id,
    factKey: row.factKey,
    value: row.value,
    sourceType: row.sourceType,
    sourceReference: row.sourceReference ?? null,
    recordedAt: row.recordedAt,
    status: row.status,
    verifiedAt: row.verifiedAt ?? null,
    removed: row.deletedAt !== undefined,
    supersedesFactId: row.supersedesFactId ?? null,
  };
}
