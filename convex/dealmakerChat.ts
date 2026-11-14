/**
 * Dealmaker's chat (build step 18b; docs/rebuild/dealmaker.md, 8.3). A message is routed in code: a simple
 * question about the pipeline is answered from the CRM with no model call; work for one of Dealmaker's
 * skills is planned and priced, asking which call or transcript first where the work needs one, and nothing
 * runs until the person presses Start, which uses that work's own start (and its own checks). Strategist's
 * chat is untouched.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { buildBoard } from "./lib/dealmaker/board";
import { showFigures, timeLabel } from "./lib/dealmaker/calendar";
import { DM_CHOICES, DM_QUESTION, NOTHING_RUNS, PLAN_WORDS, RESULT_TAB, dmRoute, isDmRoute, type DmRoute, type Question } from "./lib/dealmaker/chat";
import { dealScope, inScope, type TeamRow } from "./lib/dealmaker/roles";
import { notFound, userError } from "./lib/errors";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { requireWork } from "./lib/roles";
import { boardInputFor } from "./pipelineBoard";
import { settingsOf } from "./playbookInterview";
import { startRunFor } from "./runs";
import { money } from "./skills/pipelineForensics/compute";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };
type Access = MutationCtx & { workspaceId: Id<"workspaces">; clients: ClientScope; identity: { subject: string }; member: Doc<"members">; role: string };
type Message = Doc<"dealmakerChats">["messages"][number];

export const CHAT_LIMITS = { text: 1000, messages: 60, chats: 20, choices: 10 } as const;
export const CHAT_TEXT = {
  noCrm: "Connect your CRM in Connections and I can answer that from your own records.",
  noCalls: "No calls are booked in the next week. You can brief a lead by name in Calls.",
  noTranscripts: "No call is ready to review: add a transcript shared with Dealmaker, or save your notes after a call in Calls.",
  pickCall: "Which call?",
  pickTranscript: "Which call should I review?",
  started: "Started.",
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  nothingToStart: "There is nothing waiting to start here.",
} as const;

const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, CHAT_LIMITS.text);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function maxCreditsFor(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }, skill: DmRoute) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(skill) });
  const caps = await capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: skill, choice });
  return priceFor(caps.maxCostCentsPerRun);
}

async function homeOf(ctx: QueryCtx & { member: Doc<"members"> }, scope: Scope) {
  const settings = await settingsOf(ctx, scope);
  const row = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
  return dealScope(ctx.member.role, row);
}

/** A simple question, answered from the CRM in code: what it counted is in the words. */
async function answer(ctx: Access, scope: Scope, question: Question): Promise<string> {
  const crm = await crmFor(ctx, scope);
  if (!crm) return CHAT_TEXT.noCrm;
  const now = Date.now();
  const home = await homeOf(ctx, scope);
  const input = await boardInputFor(ctx, scope, crm, now);
  const board = buildBoard({ ...input, deals: inScope(home, input.deals) });
  const contactName = async (ref: string | null) => (ref ? ((await crm.contact(ref))?.name ?? "a lead") : "a lead");
  if (question === "openDeals") {
    const open = inScope(home, input.deals).filter((deal) => deal.status === "open");
    const value = open.reduce((total, deal) => total + (deal.value ?? 0), 0);
    return `${plural(open.length, "open deal")} worth ${money(value, crm.connection.currency)}: ${board.counts.active} active, ${board.counts.cooling} cooling, ${board.counts.quiet} quiet. ${home.why}`;
  }
  if (question === "moves") {
    if (!board.moves.length) return "No deal needs a move right now.";
    const dealOf = new Map(input.deals.map((deal) => [deal.ref, deal]));
    const top = await Promise.all(board.moves.slice(0, 5).map(async (move) => `${await contactName(dealOf.get(move.ref)?.contactRef ?? null)}: ${move.words}`));
    return `${plural(board.moves.length, "deal")} need${board.moves.length === 1 ? "s" : ""} a move. ${top.join(" ")}${board.moves.length > 5 ? " The rest are in Pipeline." : ""}`;
  }
  const deals = new Set(inScope(home, input.deals).flatMap((deal) => (deal.contactRef ? [deal.contactRef] : [])));
  const mine = (ref: string | null) => home.kind === "all" || (ref !== null && deals.has(ref));
  if (question === "showRate") {
    const figures = showFigures(
      input.appointments.filter((row) => mine(row.contactRef)),
      now,
    );
    return `Show rate: ${figures.showRate}. ${figures.basis}${figures.notMarked ? ` ${plural(figures.notMarked, "past call")} not marked either way.` : ""}`;
  }
  const week = input.appointments.filter((row) => row.startsAt > now && row.startsAt <= now + 7 * 86_400_000 && row.status !== "cancelled" && mine(row.contactRef));
  if (!week.length) return "No calls are booked in the next week.";
  const next = week[0];
  return `${plural(week.length, "call")} booked in the next week. Next: ${await contactName(next.contactRef)} at ${timeLabel(next.startsAt, crm.connection.timezone ?? null)}${crm.connection.timezone ? "" : " UTC"} on ${new Date(next.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: crm.connection.timezone ?? "UTC" })}.`;
}

/** The work's plan and budget, or the question it needs answered first (which call, which transcript). */
async function planFor(
  ctx: Access,
  scope: Scope,
  skill: DmRoute,
  target?: Message["plan"] extends infer P ? (P extends { target?: infer T } ? T : never) : never,
): Promise<Omit<Message, "role" | "at">> {
  const crm = await crmFor(ctx, scope);
  if ((skill === "pipeline-forensics" || skill === "follow-up-engine" || skill === "deal-briefing") && !crm) return { text: CHAT_TEXT.noCrm };
  if (skill === "deal-briefing" && !target) {
    const now = Date.now();
    const home = await homeOf(ctx, scope);
    const input = await boardInputFor(ctx, scope, crm!, now);
    const deals = new Set(inScope(home, input.deals).flatMap((deal) => (deal.contactRef ? [deal.contactRef] : [])));
    const calls = input.appointments.filter(
      (row) => row.startsAt > now && row.startsAt <= now + 7 * 86_400_000 && row.status !== "cancelled" && row.contactRef && (home.kind === "all" || deals.has(row.contactRef)),
    );
    if (!calls.length) return { text: CHAT_TEXT.noCalls };
    const choices = await Promise.all(
      calls
        .slice(0, CHAT_LIMITS.choices)
        .map(async (call) => ({
          label: `${(await crm!.contact(call.contactRef!))?.name ?? "A lead"}, ${new Date(call.startsAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: crm!.connection.timezone ?? "UTC" })}`,
          value: `call:${call.ref}`,
        })),
    );
    return { text: CHAT_TEXT.pickCall, choices };
  }
  if (skill === "conversation-intelligence" && !target) {
    const transcripts = (
      await ctx.db
        .query("callTranscripts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId))
        .order("desc")
        .take(200)
    ).filter((row) => row.clientId === scope.clientId && (row.agents ?? []).includes(SALES_CONVERSION));
    const notes = await ctx.db
      .query("callNotes")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(5);
    const choices = [
      ...transcripts.slice(0, 5).map((row) => ({ label: `Transcript: ${row.title.slice(0, 60)}`, value: `transcript:${row._id}` })),
      ...notes.map((row) => ({ label: `Notes: ${row.leadName}`, value: `note:${row._id}` })),
    ];
    if (!choices.length) return { text: CHAT_TEXT.noTranscripts };
    return { text: CHAT_TEXT.pickTranscript, choices };
  }
  const maxCredits = await maxCreditsFor(ctx, skill);
  const about = target ? ` (${target.label})` : "";
  return { text: `${PLAN_WORDS[skill]}${about ? ` For: ${target!.label}.` : ""} Up to ${maxCredits} credits. ${NOTHING_RUNS}`, plan: { skill, maxCredits, ...(target ? { target } : {}) } };
}

/** A tapped call or transcript, checked to be one this person may use here. */
async function targetOf(ctx: Access, scope: Scope, value: string): Promise<{ skill: DmRoute; target: NonNullable<NonNullable<Message["plan"]>["target"]> } | null> {
  const [kind, ref] = [value.slice(0, value.indexOf(":")), value.slice(value.indexOf(":") + 1)];
  if (kind === "call") {
    const crm = await crmFor(ctx, scope);
    if (!crm) return null;
    const now = Date.now();
    const call = (await crm.appointments({ from: now, to: now + 8 * 86_400_000 })).find((row) => row.ref === ref);
    if (!call?.contactRef) return null;
    const contact = await crm.contact(call.contactRef);
    return {
      skill: "deal-briefing",
      target: {
        kind: "call",
        ref,
        contactRef: call.contactRef,
        label: `${contact?.name ?? "A lead"}, ${new Date(call.startsAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: crm.connection.timezone ?? "UTC" })}`,
      },
    };
  }
  if (kind === "transcript") {
    const id = ctx.db.normalizeId("callTranscripts", ref);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.workspaceId !== scope.workspaceId || row.clientId !== scope.clientId || !(row.agents ?? []).includes(SALES_CONVERSION)) return null;
    return { skill: "conversation-intelligence", target: { kind: "transcript", ref, label: row.title.slice(0, 60) } };
  }
  if (kind === "note") {
    const id = ctx.db.normalizeId("callNotes", ref);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.workspaceId !== scope.workspaceId || row.clientId !== scope.clientId) return null;
    return { skill: "conversation-intelligence", target: { kind: "note", ref, label: `notes on ${row.leadName}` } };
  }
  return null;
}

async function ownChat(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string }; clients: ClientScope }, chatId: Id<"dealmakerChats">) {
  const row = await ctx.db.get(chatId);
  if (!row || row.workspaceId !== ctx.workspaceId || row.createdBy !== ctx.identity.subject) notFound();
  ctx.clients.require(row.clientId);
  return row;
}

/** Sends a message: answers it in code, plans the work it asks for, or asks which work. */
export const send = workspaceMutation({
  args: { chatId: v.optional(v.id("dealmakerChats")), clientId: v.optional(v.id("clients")), text: v.string() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const text = clean(args.text);
    if (!text) throw userError("Write a message.");
    const existing = args.chatId ? await ownChat(ctx, args.chatId) : null;
    const forClient = existing ? (existing.clientId ? { clientId: existing.clientId } : {}) : await clientForNew(ctx, args.clientId);
    const scope: Scope = { workspaceId: ctx.workspaceId, ...forClient };
    const now = Date.now();

    let reply: Omit<Message, "role" | "at">;
    let shown = text;
    const picked = existing?.messages.at(-1)?.choices?.find((choice) => choice.value === text || choice.label === text);
    if (picked && /^(call|transcript|note):/.test(picked.value)) {
      shown = picked.label;
      const found = await targetOf(ctx, scope, picked.value);
      reply = found ? await planFor(ctx, scope, found.skill, found.target) : { text: "That call is no longer available. Ask again." };
    } else {
      const route = dmRoute(picked?.label ?? text);
      if (route.kind === "question") reply = { text: await answer(ctx, scope, route.question) };
      else if (route.kind === "work") reply = await planFor(ctx, scope, route.skill);
      else reply = { text: DM_QUESTION, choices: DM_CHOICES.map((row) => ({ label: row.chip, value: row.chip })) };
    }

    const added: Message[] = [
      { role: "person", text: shown, at: now },
      { role: "dealmaker", ...reply, at: now },
    ];
    const messages = [...(existing?.messages ?? []), ...added].slice(-CHAT_LIMITS.messages);
    if (existing) {
      await ctx.db.patch(existing._id, { messages, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("dealmakerChats", { workspaceId: ctx.workspaceId, ...forClient, createdBy: ctx.identity.subject, title: text.slice(0, 80), messages, updatedAt: now });
  },
});

/** Starts a pipeline review: the project it saves to, then the run. The other work starts through its own mutation. */
export const startPipelineReview = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), confirmedCredits: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    if (args.confirmedCredits !== (await maxCreditsFor(ctx, "pipeline-forensics"))) throw userError(CHAT_TEXT.budgetMoved);
    if (!(await crmFor(ctx, { workspaceId: ctx.workspaceId, ...forClient }))) throw userError(CHAT_TEXT.noCrm);
    const now = Date.now();
    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      title: "Pipeline review",
      objective: "Where do deals stall, and what to do about it.",
      market: "",
      geography: "",
      competitors: [],
      platforms: ["customerData"],
      suppliedUrls: [],
      status: "draft",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    const runId = await startRunFor(ctx, {
      workspaceId: ctx.workspaceId,
      userId: ctx.identity.subject,
      role: ctx.member.role,
      agentSlug: SALES_CONVERSION,
      skillSlug: "pipeline-forensics",
      projectId,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.pipelineReview_requested", subject: runId });
    return { runId };
  },
});

/** Records that the plan was started, with where its result will appear. */
export const started = workspaceMutation({
  args: { chatId: v.id("dealmakerChats"), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const row = await ownChat(ctx, args.chatId);
    const plan = [...row.messages].reverse().find((message) => message.plan)?.plan;
    if (!plan || !isDmRoute(plan.skill)) throw userError(CHAT_TEXT.nothingToStart);
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId || run.skillSlug !== plan.skill) notFound();
    const now = Date.now();
    const kept: Message[] = row.messages.map((message) => (message.plan ? { ...message, plan: undefined } : message));
    const messages: Message[] = [...kept, { role: "dealmaker" as const, text: `${CHAT_TEXT.started} ${RESULT_TAB[plan.skill].words}`, at: now }].slice(-CHAT_LIMITS.messages);
    await ctx.db.patch(row._id, { runId: args.runId, messages, updatedAt: now });
    return null;
  },
});

/** This person's recent Dealmaker chats here. */
export const list = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.clientId) ctx.clients.require((await clientHere(ctx, ctx.workspaceId, args.clientId))._id);
    else ctx.clients.require(undefined);
    const rows = await ctx.db
      .query("dealmakerChats")
      .withIndex("by_workspace_creator", (q) => q.eq("workspaceId", ctx.workspaceId).eq("createdBy", ctx.identity.subject))
      .order("desc")
      .take(CHAT_LIMITS.chats * 3);
    return rows
      .filter((row) => row.clientId === args.clientId)
      .slice(0, CHAT_LIMITS.chats)
      .map((row) => ({ id: row._id, title: row.title, updatedAt: row.updatedAt }));
  },
});

/** One chat, with the plan waiting for Start (the last message's, if it has one). */
export const get = workspaceQuery({
  args: { chatId: v.id("dealmakerChats") },
  handler: async (ctx, args) => {
    const row = await ownChat(ctx, args.chatId);
    const last = row.messages.at(-1);
    return {
      id: row._id,
      title: row.title,
      messages: row.messages.map((message) => ({ role: message.role, text: message.text, at: message.at, choices: message === last ? (message.choices ?? []) : [] })),
      plan: last?.plan ? { ...last.plan, result: isDmRoute(last.plan.skill) ? RESULT_TAB[last.plan.skill] : null } : null,
      canStart: ctx.role !== "viewer",
    };
  },
});
