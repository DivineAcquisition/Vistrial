/**
 * Follow-up Engine's code-only tools: scan the board for deals that need one next message, check each draft
 * the model wrote, and file what passes as Dealmaker's own drafts in Comms.
 */

import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { fileAgentDraft } from "../../comms";
import { crmConnectionFor, crmFor } from "../../lib/crm/read";
import { hasPrice } from "../../lib/dealmaker/autonomy";
import { buildBoard } from "../../lib/dealmaker/board";
import { playbookForSkill } from "../../lib/playbook";
import { boardInputFor } from "../../pipelineBoard";
import { settingsOf } from "../../playbookInterview";
import { latestDone, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { MAX_DRAFTS, PHASE, TRIGGERS, readWritten, type Candidate, type CheckedDraft, type ScanRecord, type Trigger } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

export const LIMITS = { sms: 640, email: 5000, subject: 150 } as const;

/** Pressure the doctrine rules out (IV): invented urgency or scarcity. */
const PRESSURE = /\b(last chance|only \d+ (spots?|places?|left)|act now|expires? (today|tonight)|before it'?s too late|don'?t miss out|limited time|hurry)\b/i;

export async function scanOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.scan);
  return step ? ((await recordOf(db, run, step._id, "scan")) as ScanRecord | null) : null;
}

/** Observe: the board's next moves, one per deal, for leads with no message already open and a channel allowed. */
const scan: MutationTool = async (ctx, run) => {
  const scope = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}) };
  const crm = await crmFor(ctx, scope);
  const empty: ScanRecord = { candidates: [], voice: [], lessons: [], offer: [], proof: [], skipped: [] };
  if (!crm) return { resultCode: "no_crm", artifact: record("scan", { ...empty, skipped: ["No CRM is connected, so there are no deals to follow up."] }) };
  const now = Date.now();
  const input = await boardInputFor(ctx, scope, crm, now);
  const board = buildBoard(input);
  const settings = await settingsOf(ctx, scope);
  const channels = new Set(settings?.channels ?? ["sms", "email"]);
  const open = new Set<string>();
  for (const status of ["draft", "held", "proposed"] as const) {
    const rows = await ctx.db
      .query("dealmakerDrafts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", status))
      .take(500);
    for (const row of rows) if (row.clientId === run.clientId) open.add(row.contactRef);
  }
  const connection = await crmConnectionFor(ctx, scope);
  const contactOf = async (ref: string) =>
    connection
      ? await ctx.db
          .query("crmContacts")
          .withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", ref))
          .first()
      : null;
  const stageName = new Map((input.pipeline?.stages ?? []).map((stage) => [stage.ref, stage.name]));
  const dealOf = new Map(input.deals.map((deal) => [deal.ref, deal]));
  const cards = new Map(board.stages.flatMap((stage) => stage.cards).map((card) => [card.ref, card]));
  const candidates: Candidate[] = [];
  const skipped: string[] = [];
  for (const move of board.moves) {
    if (candidates.length >= MAX_DRAFTS) break;
    const deal = dealOf.get(move.ref);
    const card = cards.get(move.ref);
    if (!deal?.contactRef || !card) continue;
    if (open.has(deal.contactRef)) continue;
    const contact = await contactOf(deal.contactRef);
    const channel = channels.has("sms") && contact?.phone ? "sms" : channels.has("email") && contact?.email ? "email" : null;
    if (!channel) {
      skipped.push(`Deal ${deal.ref}: no allowed channel reaches this lead.`);
      continue;
    }
    candidates.push({
      id: `d${candidates.length + 1}`,
      dealRef: deal.ref,
      contactRef: deal.contactRef,
      firstName: contact?.name?.split(/\s+/)[0] ?? null,
      trigger: move.kind as Trigger,
      channel,
      stage: stageName.get(deal.stageRef) ?? "Unknown stage",
      context: [
        card.healthWhy,
        card.temperatureWhy,
        ...card.established.map((row) => `${row.label}: ${row.value} (${row.kind})`),
        ...(card.unresolved.length ? [`Unresolved: ${card.unresolved.map((row) => row.label).join(", ")}`] : []),
        ...card.commitments.map((row) => `Promised: ${row.text}`),
      ],
    });
  }
  const playbook = await playbookForSkill(ctx, scope);
  const of = (kind: string) => playbook.items.filter((row) => row.kind === kind);
  const value: ScanRecord = {
    candidates,
    voice: of("voice").map((row) => `${row.title}. ${row.body}`.trim()),
    lessons: playbook.lessons.map((row) => row.text),
    // Packages without prices: a draft never sets a price (doctrine IV and 0.2).
    offer: of("package").map((row) => row.title),
    proof: of("proof").map((row) => row.body || row.title),
    skipped,
  };
  return { resultCode: candidates.length ? "ok" : "nothing_due", resultId: String(candidates.length), artifact: record("scan", value) };
};

/** Each draft against its candidate: it exists, fits the channel, names no price and adds no pressure. */
export function checkWritten(written: ReturnType<typeof readWritten>, scanned: ScanRecord): CheckedDraft[] {
  const byId = new Map(scanned.candidates.map((row) => [row.id, row]));
  const seen = new Set<string>();
  return written.map((draft) => {
    const candidate = byId.get(draft.id);
    let why = "";
    if (!candidate) why = "It is for no deal that was found.";
    else if (seen.has(draft.id)) why = "A second draft for the same deal.";
    else if (!draft.body) why = "It is empty.";
    else if (draft.body.length > (candidate.channel === "sms" ? LIMITS.sms : LIMITS.email)) why = "It is too long for the channel.";
    else if (candidate.channel === "email" && !draft.subject) why = "An email needs a subject.";
    else if (hasPrice(`${draft.subject} ${draft.body}`)) why = "It names a price; Dealmaker never sets one.";
    else if (PRESSURE.test(`${draft.subject} ${draft.body}`)) why = "It invents urgency.";
    if (!why) seen.add(draft.id);
    return { ...draft, passed: !why, why };
  });
}

const check: MutationTool = async (ctx, run, steps) => {
  const scanned = await scanOf(ctx.db, run, steps);
  if (!scanned) return { failCode: "no_scan" };
  const step = latestDone(steps, PHASE.write);
  const checked = checkWritten(readWritten(step ? await recordOf(ctx.db, run, step._id, "model") : null), scanned);
  return { resultCode: checked.some((row) => row.passed) ? "passed" : "nothing_passed", resultId: String(checked.filter((row) => row.passed).length), artifact: record("checks", checked) };
};

/** Files what passed as Dealmaker's own drafts, each with the kind its trigger set and why it is due. */
const save: MutationTool = async (ctx, run, steps) => {
  const scanned = await scanOf(ctx.db, run, steps);
  const step = latestDone(steps, PHASE.check);
  const checked = (step ? ((await recordOf(ctx.db, run, step._id, "checks")) as CheckedDraft[] | null) : null) ?? [];
  const byId = new Map((scanned?.candidates ?? []).map((row) => [row.id, row]));
  let filed = 0;
  for (const draft of checked.filter((row) => row.passed)) {
    const candidate = byId.get(draft.id);
    if (!candidate) continue;
    const trigger = TRIGGERS[candidate.trigger];
    await fileAgentDraft(ctx, {
      workspaceId: run.workspaceId,
      ...(run.clientId ? { clientId: run.clientId } : {}),
      contactRef: candidate.contactRef,
      dealRef: candidate.dealRef,
      kind: trigger.kind,
      channel: candidate.channel,
      ...(candidate.channel === "email" ? { title: draft.subject.slice(0, LIMITS.subject) } : {}),
      body: draft.body,
      why: trigger.why,
      trigger: candidate.trigger,
    });
    filed += 1;
  }
  return { resultCode: filed ? "ok" : "nothing_filed", resultId: String(filed), artifact: record("filed", { filed, dropped: checked.filter((row) => !row.passed).map((row) => row.why) }) };
};

export const FU_MUTATION_TOOLS: Record<string, MutationTool> = {
  "fu.scan": scan,
  "fu.check": check,
  "fu.save": save,
};
