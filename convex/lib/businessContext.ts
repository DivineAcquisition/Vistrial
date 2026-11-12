/**
 * What a skill knows about the business before it writes anything: the confirmed profile, the business
 * facts with their status, the business's own results (Meta ads and uploaded results files) and what it
 * tried before and what happened. Built in code, never by a model. Market Intelligence's `context.read`
 * and Offer Intelligence's `oi.context` both start here.
 */

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { decisionsForContext, describeDecision } from "../decisions";
import { describeUpload, saveUploadSourcesFor } from "../resultUploads";
import { describeTranscript, saveTranscriptSourcesFor } from "../transcripts";
import { saveFirstPartySources } from "../skills/marketIntelligence/firstParty";
import { factsForRun } from "./facts";

/** Doctrine 3.3: a missing ad budget does not block the work. */
export const NO_BUDGET_ASSUMPTION = "Budget not provided; recommendations do not depend on a budget figure.";

export type KnownItem = {
  key: string;
  label: string;
  value: string;
  origin: "project" | "profile" | "fact" | "connection" | "outcome";
  status: string;
  recordedAt: number;
};

export type BusinessContext = {
  profile: Doc<"profileVersions"> | null;
  facts: Doc<"businessFacts">[];
  decisions: Doc<"decisions">[];
  /** Profile fields, facts, the business's own results and past outcomes, in that order. */
  known: KnownItem[];
  missing: { key: string; blocking: boolean }[];
  assumptions: string[];
};

/** A client's profile as known items: a business's company details, or a person's goals and where they are now. */
export function clientKnown(client: Doc<"clients">): KnownItem[] {
  const fields: [string, string, string | undefined][] =
    client.type === "business"
      ? [
          ["name", "Client", client.name],
          ["website", "Website", client.business?.website],
          ["industry", "Industry", client.business?.industry],
          ["offer", "Offer", client.business?.offer],
          ["audience", "Audience", client.business?.audience],
          ["geography", "Where they sell", client.business?.geography],
          ["notes", "Notes", client.business?.notes],
        ]
      : [
          ["name", "Client", client.name],
          ["goals", "Their goals", client.person?.goals],
          ["currentState", "Where they are now", client.person?.currentState],
          ["notes", "Notes", client.person?.notes],
        ];
  return fields
    .filter(([, , value]) => (value ?? "").trim())
    .map(([key, label, value]) => ({ key: `client.${key}`, label, value: (value ?? "").trim(), origin: "profile" as const, status: "confirmed", recordedAt: client.updatedAt }));
}

/**
 * Reads the business context for a run. When `project` is given, the business's own results are saved on it
 * as `customerData` sources, so the asset can cite them as "Your data".
 */
export async function readBusinessContext(
  ctx: MutationCtx,
  run: Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "agentSlug"> & { clientId?: Doc<"agentRuns">["clientId"] },
  project: Doc<"researchProjects"> | null,
): Promise<BusinessContext> {
  // Work done for a client is about the client: its profile, its results, what was tried for it. The
  // organization's own profile and facts describe a different business and are left out.
  const clientId = project ? project.clientId : run.clientId;
  const client = clientId ? await ctx.db.get(clientId) : null;
  const forClient = client && client.workspaceId === run.workspaceId ? client : null;
  const profile = forClient
    ? null
    : await ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
        .order("desc")
        .first();
  const facts = forClient ? [] : await factsForRun(ctx, run.workspaceId);
  const known: KnownItem[] = [];
  if (forClient) known.push(...clientKnown(forClient));
  if (profile) {
    const fields = [
      ["offer", "Offer", profile.offer],
      ["priceNotes", "Price notes", profile.priceNotes],
      ["audience", "Audience", profile.audience],
      ["channels", "Channels", profile.channels],
      ["brandVoice", "Brand voice", profile.brandVoice],
    ] as const;
    for (const [key, label, value] of fields) {
      if (value.trim()) known.push({ key: `profile.${key}`, label, value, origin: "profile", status: "confirmed", recordedAt: profile.confirmedAt ?? profile._creationTime });
    }
  }
  for (const fact of facts) known.push({ key: `fact:${fact._id}`, label: fact.factKey, value: fact.value, origin: "fact", status: fact.status, recordedAt: fact.recordedAt });
  if (project) {
    // The business's own ad results, when its Meta connection is granted to this agent.
    const firstParty = forClient ? null : await saveFirstPartySources(ctx, run.workspaceId, project, run._id);
    if (firstParty) known.push({ key: "connection:meta", label: firstParty.label, value: firstParty.value, origin: "connection", status: "verified", recordedAt: firstParty.recordedAt });
    // Results files the business uploaded and granted to this agent: totals only.
    const uploads = await saveUploadSourcesFor(ctx, { workspaceId: run.workspaceId, projectId: project._id, runId: run._id, agentSlug: run.agentSlug });
    for (const { upload } of uploads) {
      known.push({ key: `upload:${upload._id}`, label: `Your results: ${upload.label}`, value: describeUpload(upload), origin: "connection", status: "verified", recordedAt: upload.createdAt });
    }
    // Call transcripts the business provided and granted to this agent.
    const transcripts = await saveTranscriptSourcesFor(ctx, { workspaceId: run.workspaceId, projectId: project._id, runId: run._id, agentSlug: run.agentSlug });
    for (const { transcript } of transcripts) {
      known.push({ key: `transcript:${transcript._id}`, label: `Your call: ${transcript.title}`, value: describeTranscript(transcript), origin: "connection", status: "unverified", recordedAt: transcript.createdAt });
    }
  }
  // What the business tried before, and what happened: outcomes first, then open check-ins.
  const decisions = (await decisionsForContext(ctx, run.workspaceId)).filter((row) => row.clientId === forClient?._id);
  for (const decision of decisions) {
    known.push({
      key: `decision:${decision._id}`,
      label: decision.outcome ? "Tried before" : "Being tried",
      value: describeDecision(decision),
      origin: "outcome",
      status: decision.outcome ? "verified" : "unverified",
      recordedAt: decision.outcome?.recordedAt ?? decision.createdAt,
    });
  }

  const missing: BusinessContext["missing"] = [];
  const assumptions: string[] = [];
  if (!facts.some((row) => /budget/i.test(row.factKey))) {
    missing.push({ key: "adBudget", blocking: false });
    assumptions.push(NO_BUDGET_ASSUMPTION);
  }
  if (forClient && !known.some((row) => row.origin === "profile")) {
    missing.push({ key: "clientProfile", blocking: false });
    assumptions.push("This client's profile is empty, so relevance is judged from the assignment alone.");
  } else if (!profile && !forClient) {
    missing.push({ key: "businessProfile", blocking: false });
    assumptions.push("No confirmed business profile, so relevance is judged from the assignment alone.");
  }
  return { profile, facts, decisions, known, missing, assumptions };
}

