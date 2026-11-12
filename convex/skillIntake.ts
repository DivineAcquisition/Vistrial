/**
 * The chat box of the Offers and Diagnostics workspaces: the same intake conversation as research (the
 * `intakes` and `intakeMessages` tables, a plan with its budget, nothing runs until Start), scoped to one
 * skill. Each skill's checklist is short and held in code, filled from business memory first. No model
 * is called while gathering, so the conversation itself costs nothing.
 */

import { requireWork } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { dayKey } from "./lib/caps";
import { daySpend, loadCaps } from "./lib/capRows";
import { notFound, userError } from "./lib/errors";
import { liveFact, writeFact } from "./lib/facts";
import { assertCanSpend } from "./lib/billing";
import { currentGoal, readGoal, MAX_GOAL } from "./goals";
import { EMPTY_OFFER, cleanOffer, sameOffer, type OfferContent } from "./lib/offerCards";
import { versionFields } from "./offers";
import { startRunFor } from "./runs";

export const CHAT_SKILLS = ["offer-intelligence", "growth-diagnostics"] as const;
export type ChatSkill = (typeof CHAT_SKILLS)[number];

const MAX_ANSWER = 600;

type Question = { key: string; text: string; chips: string[] };

/** Each skill's checklist, in the order it asks. */
export const CHECKLIST: Record<ChatSkill, Question[]> = {
  "growth-diagnostics": [
    {
      key: "goal",
      text: "First, what's your goal for the next 90 days? Say it with a number if you can.",
      chips: ["10 more retained clients this quarter", "Lower our cost per booked call", "Keep clients past month three"],
    },
  ],
  "offer-intelligence": [
    { key: "offer", text: "Which offer is this about? Its name and price, for example \"Done-for-you lead generation retainer, $2,500/mo\".", chips: [] },
    {
      key: "included",
      text: "What's included, and what guarantee or terms do you give? Separate items with commas.",
      chips: ["No guarantee", "Results guarantee: 20 booked calls in 60 days or we work free"],
    },
    {
      key: "acquisitionChannels",
      text: "Where do most of your clients find you?",
      chips: ["Referrals", "Cold outreach", "Facebook or Instagram ads", "Google search"],
    },
  ],
};

/** What each skill does once started, in plain words for the plan. */
const PLAN_WORDS: Record<ChatSkill, { name: string; steps: string[]; reads: string }> = {
  "growth-diagnostics": {
    name: "Growth Diagnostics",
    steps: [
      "Read your own results: Meta ads and the results files you uploaded",
      "Work out every figure in code, compared only with your own past",
      "Find where growth stalls and write a 90-day roadmap: Fix, Build, Scale",
      "Check every number against your figures, then save it for you to approve",
    ],
    reads: "Only your own connected data. It changes nothing in your accounts.",
  },
  "offer-intelligence": {
    name: "Offer Intelligence",
    steps: [
      "Read your approved market reports and what you told it about your offer",
      "Set your offer beside what competitors lead with, from that research",
      "Suggest two or three changes to test, each with how to tell if it worked",
      "Check every claim against its sources, then save it for you to approve",
    ],
    reads: "Only approved research and your own words. It does not change your offer.",
  },
};

export function isChatSkill(slug: string): slug is ChatSkill {
  return (CHAT_SKILLS as readonly string[]).includes(slug);
}

function clean(text: string, max = MAX_ANSWER) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function assertEditor(role: string) {
  requireWork(role);
}

/**
 * Turns the owner's two offer answers into card content, in code: the name before the price, then
 * comma-separated items, with any guarantee or terms lifted out of the list.
 */
export function offerFromAnswers(answers: { offer?: string; included?: string }, targetCustomer = ""): OfferContent {
  const offer = clean(answers.offer ?? "", 300);
  const price = offer.match(/(?:[$£€]\s?\d[\d,.]*(?:\s?(?:\/|per|a)\s?\w+)?|\d[\d,.]*\s?(?:dollars|pounds|euros|usd|gbp|eur)\b(?:\s?(?:\/|per|a)\s?\w+)?)/i)?.[0] ?? "";
  const name = clean((price ? offer.replace(price, "") : offer).replace(/[,;:\-–—]+\s*$/g, "").replace(/\s+(for|at)\s*$/i, ""), 120).replace(/[,;:\-–—]\s*$/, "").trim();
  const parts = (answers.included ?? "").split(/[,;\n]+/).map((row) => clean(row, 160)).filter(Boolean);
  const guarantee = parts.filter((row) => /guarantee|refund|money back|come back free|warranty/i.test(row));
  const terms = parts.filter((row) => !guarantee.includes(row) && /\bterms?\b|contract|cancel|deposit|minimum|upfront|monthly plan|notice/i.test(row));
  const included = parts.filter((row) => !guarantee.includes(row) && !terms.includes(row));
  return cleanOffer({
    name,
    price: price.trim(),
    included,
    guarantee: guarantee.filter((row) => !/^no guarantee$/i.test(row)).join("; "),
    terms: terms.join("; "),
    targetCustomer,
  });
}

async function nextAt(ctx: QueryCtx, intakeId: Id<"intakes">) {
  const last = await ctx.db
    .query("intakeMessages")
    .withIndex("by_intake", (q) => q.eq("intakeId", intakeId))
    .order("desc")
    .first();
  return Math.max(Date.now(), (last?.at ?? 0) + 1);
}

/** What business memory already answers, so the chat never asks it. */
async function known(ctx: QueryCtx, workspaceId: Id<"workspaces">, skill: ChatSkill): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (skill === "growth-diagnostics") {
    const goal = await currentGoal(ctx, workspaceId);
    if (goal) out.goal = goal.text;
    return out;
  }
  const channels = (await liveFact(ctx, workspaceId, "acquisitionChannels"))?.value;
  if (channels) out.acquisitionChannels = channels;
  return out;
}

async function plan(ctx: MutationCtx, row: Doc<"intakes">, skill: ChatSkill) {
  const caps = await loadCaps(ctx, row.workspaceId, GROWTH_ARCHITECT, skill);
  const spent = await daySpend(ctx, row.workspaceId, GROWTH_ARCHITECT, skill, dayKey());
  return {
    skill,
    name: PLAN_WORDS[skill].name,
    steps: PLAN_WORDS[skill].steps,
    reads: PLAN_WORDS[skill].reads,
    capCents: caps.maxCostCentsPerRun,
    dayLeftCents: Math.max(0, caps.maxCostCentsPerDay - spent),
    answers: row.answers ?? {},
  };
}

/** Asks the next unanswered question, or shows the plan with its budget when nothing is left to ask. */
async function advance(ctx: MutationCtx, row: Doc<"intakes">, skill: ChatSkill) {
  const answers = row.answers ?? {};
  const next = CHECKLIST[skill].find((question) => !answers[question.key]);
  const at = await nextAt(ctx, row._id);
  if (next) {
    await ctx.db.insert("intakeMessages", { workspaceId: row.workspaceId, intakeId: row._id, role: "agent", kind: "question", text: next.text, chips: next.chips, at });
    await ctx.db.patch(row._id, { status: "chatting", asking: next.key, questionsAsked: row.questionsAsked + 1, updatedAt: Date.now() });
    return;
  }
  const fresh = (await ctx.db.get(row._id))!;
  await ctx.db.insert("intakeMessages", {
    workspaceId: row.workspaceId,
    intakeId: row._id,
    role: "agent",
    kind: "plan",
    text: "Here's the plan. Nothing runs or spends until you press Start.",
    data: await plan(ctx, fresh, skill),
    at,
  });
  await ctx.db.patch(row._id, { status: "ready", asking: undefined, updatedAt: Date.now() });
}

async function ownIntake(ctx: QueryCtx & { workspaceId: Id<"workspaces"> }, intakeId: Id<"intakes">) {
  const row = await ctx.db.get(intakeId);
  if (!row || row.workspaceId !== ctx.workspaceId || !row.skillSlug || !isChatSkill(row.skillSlug)) notFound();
  return row as Doc<"intakes"> & { skillSlug: ChatSkill };
}

/** A card's current version as the two offer answers, so a chat about a saved offer never asks for it again. */
async function answersFromCard(ctx: QueryCtx, workspaceId: Id<"workspaces">, cardId: string): Promise<Record<string, string>> {
  const id = ctx.db.normalizeId("offerCards", cardId);
  const card = id ? await ctx.db.get(id) : null;
  if (!card || card.workspaceId !== workspaceId) return {};
  const version = await ctx.db
    .query("offerCardVersions")
    .withIndex("by_workspace_card", (q) => q.eq("workspaceId", workspaceId).eq("cardId", card._id).eq("version", card.currentVersion))
    .unique();
  if (!version) return {};
  const included = [...version.included, version.guarantee, version.terms].map((row) => row.trim()).filter(Boolean).join(", ");
  return { offer: [version.name, version.price].filter(Boolean).join(", "), ...(included ? { included } : {}) };
}

/**
 * Starts a skill's conversation: a new one from the person's first message, or, given `row`, a conversation
 * the agent chat has just routed to this skill (its first message is already saved).
 */
export async function beginSkill(
  ctx: MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } },
  input: { skill: ChatSkill; text: string; row?: Doc<"intakes">; context?: Doc<"intakes">["context"]; clientId?: Id<"clients"> },
) {
  const { skill } = input;
  const text = clean(input.text, 1000);
  if (!text) throw userError("Say what you want to work on.");
  const now = Date.now();
  // What is on record is about the organization's own business, so nothing is pre-answered for a client.
  const clientId = input.row?.clientId ?? input.clientId;
  const answers = clientId ? {} : await known(ctx, ctx.workspaceId, skill);
  // A first message that states a goal with a number is the goal; it replaces the one on record.
  if (skill === "growth-diagnostics" && readGoal(text).target !== undefined) answers.goal = clean(text, MAX_GOAL);
  const context = input.context ?? input.row?.context;
  if (skill === "offer-intelligence" && context?.kind === "offer") Object.assign(answers, await answersFromCard(ctx, ctx.workspaceId, context.id));
  let intakeId: Id<"intakes">;
  if (input.row) {
    intakeId = input.row._id;
    await ctx.db.patch(intakeId, { skillSlug: skill, answers, status: "chatting", asking: undefined, updatedAt: now });
  } else {
    intakeId = await ctx.db.insert("intakes", {
      workspaceId: ctx.workspaceId,
      ...(clientId ? { clientId } : {}),
      agentSlug: GROWTH_ARCHITECT,
      skillSlug: skill,
      answers,
      ...(context ? { context } : {}),
      createdBy: ctx.identity.subject,
      status: "chatting",
      slots: {},
      questionsAsked: 0,
      costCents: 0,
      capCents: 0,
      pendingRemember: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("intakeMessages", { workspaceId: ctx.workspaceId, intakeId, role: "you", kind: "text", text, at: now });
  }
  const remembered = Object.keys(answers).filter((key) => (key !== "goal" || answers.goal !== text) && !(context?.kind === "offer" && (key === "offer" || key === "included")));
  if (remembered.length) {
    await ctx.db.insert("intakeMessages", {
      workspaceId: ctx.workspaceId,
      intakeId,
      role: "agent",
      kind: "known",
      text: "From what you told Vistrial before:",
      data: remembered.map((key) => ({ key, value: answers[key] })),
      at: await nextAt(ctx, intakeId),
    });
  }
  await advance(ctx, (await ctx.db.get(intakeId))!, skill);
  return intakeId;
}

/** Starts a conversation for one skill from the person's first message. Owners, Admins and Members. */
export const create = workspaceMutation({
  args: { skillSlug: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    if (!isChatSkill(args.skillSlug)) throw userError("This skill does not have a chat yet.");
    return beginSkill(ctx, { skill: args.skillSlug, text: args.text });
  },
});

/** An answer to the question being asked, or, once the plan shows, a change to an answer. */
export async function replySkill(ctx: MutationCtx & { workspaceId: Id<"workspaces"> }, row: Doc<"intakes"> & { skillSlug: ChatSkill }, input: { text: string; key?: string }) {
  if (row.status === "started") throw userError("This work has already started.");
  if (row.status === "abandoned") throw userError("This conversation has ended. Start a new one.");
  const text = clean(input.text);
  if (!text) throw userError("Type an answer, or tap a choice.");
  const keys = CHECKLIST[row.skillSlug].map((question) => question.key);
  const key = input.key && keys.includes(input.key) ? input.key : (row.asking ?? keys[0]);
  await ctx.db.insert("intakeMessages", { workspaceId: ctx.workspaceId, intakeId: row._id, role: "you", kind: "text", text, at: await nextAt(ctx, row._id) });
  await ctx.db.patch(row._id, { answers: { ...(row.answers ?? {}), [key]: key === "goal" ? clean(text, MAX_GOAL) : text }, updatedAt: Date.now() });
  await advance(ctx, (await ctx.db.get(row._id))!, row.skillSlug);
  return null;
}

export const reply = workspaceMutation({
  args: { intakeId: v.id("intakes"), text: v.string(), key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    return replySkill(ctx, await ownIntake(ctx, args.intakeId), args);
  },
});

/**
 * Start: saves what the person said (the goal, or the offer card version and the offer facts), then starts
 * the skill's run on the existing run path, with its caps and credit check. Owners, Admins and Members.
 */
export const start = workspaceMutation({
  args: { intakeId: v.id("intakes") },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const row = await ownIntake(ctx, args.intakeId);
    if (row.status === "started" && row.runId) return { runId: row.runId, projectId: row.projectId ?? null };
    if (row.status !== "ready") throw userError("Answer the questions first.");
    await assertCanSpend(ctx, ctx.workspaceId);
    const answers = row.answers ?? {};
    const skill = row.skillSlug;
    const forClient = row.clientId ? { clientId: row.clientId } : {};
    const base = { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: GROWTH_ARCHITECT, skillSlug: skill, ...forClient };
    let projectId: Id<"researchProjects"> | undefined;
    if (skill === "growth-diagnostics") {
      const goal = clean(answers.goal ?? "", MAX_GOAL);
      const current = await currentGoal(ctx, ctx.workspaceId);
      // The organization's goal on record is its own; a client's goal stays with the client's work.
      if (!row.clientId && goal && current?.text !== goal) {
        await ctx.db.insert("growthGoals", { workspaceId: ctx.workspaceId, text: goal, ...readGoal(goal), setBy: ctx.identity.subject, setAt: Date.now() });
      }
      const now = Date.now();
      projectId = await ctx.db.insert("researchProjects", {
        workspaceId: ctx.workspaceId,
        ...forClient,
        title: `Growth diagnosis, ${new Date(now).toISOString().slice(0, 10)}`,
        objective: goal ? `Where does growth stall, and how do we reach: ${goal}?` : "Where does growth stall, from our own data?",
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
    } else if (row.clientId) {
      // A client's offer is not a fact about the organization, and does not become one of its offer cards here.
    } else {
      const person = { workspaceId: ctx.workspaceId, sourceType: "owner" as const, recordedBy: ctx.identity.subject, verifiedBy: ctx.identity.subject };
      const details = [answers.offer, answers.included].filter(Boolean).join(". ");
      if (details) await writeFact(ctx, { ...person, factKey: "offerDetails", value: details });
      if (answers.acquisitionChannels) {
        const current = (await liveFact(ctx, ctx.workspaceId, "acquisitionChannels"))?.value;
        if (current !== answers.acquisitionChannels) await writeFact(ctx, { ...person, factKey: "acquisitionChannels", value: answers.acquisitionChannels });
      }
      await saveCardFromChat(ctx, answers);
    }
    const runId = await startRunFor(ctx, { ...base, ...(projectId ? { projectId } : {}) });
    await ctx.db.patch(row._id, { status: "started", runId, ...(projectId ? { projectId } : {}), updatedAt: Date.now() });
    return { runId, projectId: projectId ?? null };
  },
});

/** The chat's offer answers as a card version: on the card with the same name, or a new card. */
async function saveCardFromChat(ctx: MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }, answers: Record<string, string>) {
  if (!answers.offer) return;
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  const content = offerFromAnswers(answers, profile?.audience ?? "");
  if (!content.name) return;
  const cards = await ctx.db
    .query("offerCards")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .take(50);
  const card = cards.find((row) => !row.archived && row.name.toLowerCase() === content.name.toLowerCase());
  const now = Date.now();
  if (!card) {
    const cardId = await ctx.db.insert("offerCards", { workspaceId: ctx.workspaceId, name: content.name, currentVersion: 1, createdBy: ctx.identity.subject, createdAt: now, updatedAt: now });
    await ctx.db.insert("offerCardVersions", { workspaceId: ctx.workspaceId, cardId, version: 1, ...versionFields(content), origin: "chat", createdBy: ctx.identity.subject, createdAt: now });
    return;
  }
  const versions = await ctx.db
    .query("offerCardVersions")
    .withIndex("by_workspace_card", (q) => q.eq("workspaceId", ctx.workspaceId).eq("cardId", card._id))
    .take(100);
  const current = versions.find((row) => row.version === card.currentVersion);
  // Keeps what the chat did not mention, the builder's fields included.
  const kept = current ? cleanOffer({ ...EMPTY_OFFER, ...current, items: current.items ?? [] }) : null;
  const merged: OfferContent = kept
    ? cleanOffer({
        ...kept,
        name: content.name,
        price: content.price || kept.price,
        pricing: content.price && content.price !== kept.price ? null : kept.pricing,
        included: content.included.length ? content.included : kept.included,
        items: content.included.length ? content.included.map((text) => kept.items.find((row) => row.text.toLowerCase() === text.toLowerCase()) ?? { text, value: "" }) : kept.items,
        guarantee: content.guarantee || kept.guarantee,
        terms: content.terms || kept.terms,
        targetCustomer: content.targetCustomer || kept.targetCustomer,
      })
    : content;
  if (kept && sameOffer(kept, merged)) return;
  const version = Math.max(0, ...versions.map((row) => row.version)) + 1;
  await ctx.db.insert("offerCardVersions", { workspaceId: ctx.workspaceId, cardId: card._id, version, ...versionFields(merged), origin: "chat", createdBy: ctx.identity.subject, createdAt: now });
  await ctx.db.patch(card._id, { currentVersion: version, updatedAt: now });
}

function view(row: Doc<"intakes">) {
  return {
    id: row._id,
    skillSlug: row.skillSlug ?? null,
    status: row.status,
    asking: row.asking ?? null,
    answers: row.answers ?? {},
    runId: row.runId ?? null,
    projectId: row.projectId ?? null,
    questions: row.skillSlug && isChatSkill(row.skillSlug) ? CHECKLIST[row.skillSlug].map(({ key, text }) => ({ key, text })) : [],
  };
}

async function messages(ctx: QueryCtx, intakeId: Id<"intakes">) {
  const rows = await ctx.db
    .query("intakeMessages")
    .withIndex("by_intake", (q) => q.eq("intakeId", intakeId))
    .take(100);
  return rows.map((row) => ({ id: row._id, role: row.role, kind: row.kind, text: row.text, chips: row.chips ?? [], data: row.data ?? null, at: row.at }));
}

export const get = workspaceQuery({
  args: { intakeId: v.id("intakes") },
  handler: async (ctx, args) => {
    const row = await ownIntake(ctx, args.intakeId);
    return { intake: view(row), messages: await messages(ctx, row._id) };
  },
});

/** This person's newest conversation for a skill that has not started yet, so the tab picks up where they left off. */
export const open = workspaceQuery({
  args: { skillSlug: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("intakes")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const row = rows.find((item) => item.skillSlug === args.skillSlug && item.createdBy === ctx.identity.subject && item.status !== "started" && item.status !== "abandoned");
    return row ? { intake: view(row), messages: await messages(ctx, row._id) } : null;
  },
});

/** Sets a conversation aside so the tab starts fresh. */
export const abandon = workspaceMutation({
  args: { intakeId: v.id("intakes") },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const row = await ownIntake(ctx, args.intakeId);
    if (row.status !== "started") await ctx.db.patch(row._id, { status: "abandoned", updatedAt: Date.now() });
    return null;
  },
});
