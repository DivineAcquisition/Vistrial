/**
 * An agent's one chat (the Strategist's today; which agents have one is `lib/agentSurfaces.ts`). A first message is routed in code to the skill it is for: research goes
 * to Market Intelligence (the research intake), offer questions to Offer Intelligence, "why am I not
 * growing" to Growth Diagnostics (both on the skill intake). Each then asks its follow-up questions and
 * shows the plan and budget before anything runs. When the intent is unclear the chat asks which of the
 * three the person wants; it never picks one silently. A conversation is an `intakes` row, as before.
 */

import { CHAT_PAGES, isChatPage, type ContextKind } from "./lib/chatContext";
import { clientForNew, clientOfAsset, type ClientScope } from "./lib/clients";
import { requireWork } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DEFAULT_CHAT_AGENT, hasChat, isChatRouteOf } from "./lib/agentSurfaces";
import { beginResearch, replyResearch } from "./intake";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { ROUTE_CHOICES, ROUTE_QUESTION, UNDECIDED, isChatRoute, routeChoice, routeIntent, type ChatRoute } from "./lib/chatRouting";
import { notFound, userError } from "./lib/errors";
import { assertCanRun, choiceFor, skillNeeds } from "./lib/modelChoice";
import { markOf, parseChoice } from "./lib/models";
import { SKILL_TAB } from "./lib/workTabs";
import { beginSkill, isChatSkill, redrawPlan, replySkill, type ChatSkill } from "./skillIntake";

const OPEN_RUN = ["queued", "running", "waiting", "needsInput"];
const MAX_TEXT = 1000;

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/** The skill a conversation is on, or null while the chat is still asking. Old research intakes have no skill stored. */
export function routeOf(row: Pick<Doc<"intakes">, "skillSlug">): ChatRoute | null {
  if (!row.skillSlug) return "market-intelligence";
  return isChatRoute(row.skillSlug) ? row.skillSlug : null;
}

async function ownIntake(ctx: QueryCtx & { workspaceId: Id<"workspaces"> }, intakeId: Id<"intakes">) {
  const row = await ctx.db.get(intakeId);
  if (!row || row.workspaceId !== ctx.workspaceId) notFound();
  return row;
}

type Reader = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
const contextArg = v.object({ kind: v.union(v.literal("asset"), v.literal("offer"), v.literal("task"), v.literal("project")), id: v.string() });

/**
 * The record a person had open or attached, checked to be this organization's and one they may see, with
 * its title as it reads now. Anything else is "Not found.": a chat can never be pointed at another
 * organization's record, or at a client the person is not assigned to.
 */
async function readContext(ctx: Reader, input: { kind: ContextKind; id: string }): Promise<NonNullable<Doc<"intakes">["context"]>> {
  if (input.kind === "asset") {
    const id = ctx.db.normalizeId("assets", input.id);
    const asset = id ? await ctx.db.get(id) : null;
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(await clientOfAsset(ctx, asset));
    return { kind: "asset", id: asset._id as string, title: asset.title.slice(0, 160) };
  }
  if (input.kind === "task") {
    const id = ctx.db.normalizeId("agentTasks", input.id);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || task.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(task.clientId);
    return { kind: "task", id: task._id as string, title: task.title.slice(0, 160) };
  }
  if (input.kind === "project") {
    const id = ctx.db.normalizeId("researchProjects", input.id);
    const project = id ? await ctx.db.get(id) : null;
    if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(project.clientId);
    return { kind: "project", id: project._id as string, title: project.title.slice(0, 160) };
  }
  const id = ctx.db.normalizeId("offerCards", input.id);
  const card = id ? await ctx.db.get(id) : null;
  if (!card || card.workspaceId !== ctx.workspaceId) notFound();
  ctx.clients.require(card.clientId);
  return { kind: "offer", id: card._id as string, title: card.name.slice(0, 160) };
}

async function nextAt(ctx: QueryCtx, intakeId: Id<"intakes">) {
  const last = await ctx.db
    .query("intakeMessages")
    .withIndex("by_intake", (q) => q.eq("intakeId", intakeId))
    .order("desc")
    .first();
  return Math.max(Date.now(), (last?.at ?? 0) + 1);
}

/** The choices this agent's chat offers when it cannot tell, in the order it shows them. */
function choicesOf(agentSlug: string) {
  return ROUTE_CHOICES.filter((choice) => isChatRouteOf(agentSlug, choice.skill));
}

async function askWhich(ctx: MutationCtx, row: Pick<Doc<"intakes">, "_id" | "workspaceId" | "agentSlug">, again: boolean) {
  const choices = choicesOf(row.agentSlug);
  await ctx.db.insert("intakeMessages", {
    workspaceId: row.workspaceId,
    intakeId: row._id,
    role: "agent",
    kind: "route",
    text: again ? "I still can't tell which you mean, and I won't guess. Tap one of these." : ROUTE_QUESTION,
    chips: choices.map((choice) => choice.chip),
    data: { choices: choices.map((choice) => ({ skill: choice.skill, chip: choice.chip, name: choice.name, does: choice.does })) },
    at: await nextAt(ctx, row._id),
  });
}

async function firstText(ctx: QueryCtx, intakeId: Id<"intakes">) {
  const first = await ctx.db
    .query("intakeMessages")
    .withIndex("by_intake", (q) => q.eq("intakeId", intakeId))
    .first();
  return first?.role === "you" ? first.text : "";
}

type Access = MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } };

/**
 * Stores the model a person picked for a conversation, and remembers it as their choice for that kind of work. It must be able to run the skill the
 * conversation is on, or the message is refused with the reason; while the chat is still asking which skill,
 * it is checked when the skill is chosen. `picked` undefined leaves the conversation as it is.
 */
async function pickModel(ctx: MutationCtx & { identity: { subject: string } }, intakeId: Id<"intakes">, picked: string | undefined, route: ChatRoute | null) {
  const row = await ctx.db.get(intakeId);
  if (!row) return;
  const needs = route ? skillNeeds(route) : {};
  // Only the person who started a conversation chooses its model. Anyone else in the organization may read
  // and reply, but cannot change what its work runs on, and so can never change what is remembered for them.
  if (picked !== undefined && row.createdBy !== ctx.identity.subject) throw userError("Only the person who started this conversation can change its model.");
  if (picked === undefined) {
    // An earlier pick must still be able to run the skill the conversation has now reached.
    if (row.modelChoice !== undefined) assertCanRun(row.modelChoice, needs);
    return;
  }
  // Remembered for the caller, who is the conversation's own person (checked above).
  const choice = await choiceFor(ctx, { workspaceId: row.workspaceId, userId: ctx.identity.subject, picked, needs });
  if (choice !== row.modelChoice && row.status !== "started") {
    await ctx.db.patch(row._id, { modelChoice: choice });
    // A plan with its budget may already be on screen. It is drawn again for the new model.
    const fresh = await ctx.db.get(row._id);
    if (fresh?.skillSlug && isChatSkill(fresh.skillSlug)) await redrawPlan(ctx, fresh as Doc<"intakes"> & { skillSlug: ChatSkill });
  }
}
type Choices = { mode?: "thorough" | "fast"; platforms?: string[]; links?: string[] };

/** Hands a conversation to its skill. `row` is an undecided conversation being routed. */
async function begin(ctx: Access, route: ChatRoute, input: Choices & { text: string; row?: Doc<"intakes">; context?: Doc<"intakes">["context"]; clientId?: Id<"clients"> }) {
  if (route === "market-intelligence") return beginResearch(ctx, input);
  return beginSkill(ctx, { skill: route as ChatSkill, text: input.text, row: input.row, context: input.context, clientId: input.clientId });
}

/**
 * Starts a conversation with an agent: on the skill named, otherwise on the skill the text is clearly
 * about, otherwise it asks which. Shared by the chat box and by approving a task that asks an agent for
 * work, so both start work the same way. The caller has checked the client.
 */
export async function startConversation(
  ctx: Access,
  input: { agentSlug: string; text: string; skill?: ChatRoute; context?: Doc<"intakes">["context"]; choices?: Choices; forClient: { clientId?: Id<"clients"> } },
): Promise<{ intakeId: Id<"intakes">; route: ChatRoute | null }> {
  const { agentSlug, text, context, forClient } = input;
  if (!hasChat(agentSlug)) throw userError("This agent has no chat yet.");
  if (input.skill !== undefined && !isChatRouteOf(agentSlug, input.skill)) throw userError("That work has no chat yet.");
  const guessed = routeIntent(text);
  const route = input.skill ?? (guessed && isChatRouteOf(agentSlug, guessed) ? guessed : null);
  if (route) {
    const intakeId = await begin(ctx, route, { text, context, ...(input.choices ?? {}), ...forClient });
    return { intakeId, route };
  }
  const now = Date.now();
  const intakeId = await ctx.db.insert("intakes", {
    workspaceId: ctx.workspaceId,
    agentSlug,
    ...forClient,
    skillSlug: UNDECIDED,
    ...(context ? { context } : {}),
    createdBy: ctx.identity.subject,
    status: "chatting",
    slots: {},
    questionsAsked: 0,
    asking: "skill",
    costCents: 0,
    capCents: 0,
    pendingRemember: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("intakeMessages", { workspaceId: ctx.workspaceId, intakeId, role: "you", kind: "text", text, at: now });
  await askWhich(ctx, { _id: intakeId, workspaceId: ctx.workspaceId, agentSlug }, false);
  return { intakeId, route: null };
}

/**
 * One message in the agent chat. Without `intakeId` it starts a conversation: on the skill named by `skill`
 * (a preset such as "New research"), otherwise on the skill the text is clearly about, otherwise it asks
 * which. With `intakeId` it answers: the routing question, or the skill's own next question.
 * Owners, Admins and Members.
 */
export const send = workspaceMutation({
  args: {
    intakeId: v.optional(v.id("intakes")),
    text: v.string(),
    /** A preset from the screen ("New research", "Refine in chat"). The person chose it, so nothing is guessed. */
    skill: v.optional(v.string()),
    /** The record that was open or attached: a report or draft, an offer, a task, a research session. */
    context: v.optional(contextArg),
    /** The screen a new conversation was started from (a key of CHAT_PAGES). An unknown one is ignored. */
    page: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))),
    platforms: v.optional(v.array(v.string())),
    links: v.optional(v.array(v.string())),
    /** The client a new conversation is about. Fixed when it starts; missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    /** The model family picked for this conversation and the work it starts: claude, gpt or gemini. */
    model: v.optional(v.string()),
    /** The agent a new conversation is with. Missing means the Strategist, as before agents had their own chats. */
    agentSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ intakeId: Id<"intakes">; route: ChatRoute | null }> => {
    requireWork(ctx.member.role);
    const text = clean(args.text);
    if (!text) throw userError("Type what you want to work on.");
    const choices = { mode: args.mode, platforms: args.platforms, links: args.links };

    if (args.intakeId) {
      const row = await ownIntake(ctx, args.intakeId);
      if (row.status === "abandoned") throw userError("This conversation has ended. Start a new one.");
      const current = routeOf(row);
      // Before the reply is read: the model picked now is the one that reads it.
      if (current) await pickModel(ctx, row._id, args.model, current);
      if (current === "market-intelligence") {
        await replyResearch(ctx, row, { text, ...choices });
        return { intakeId: row._id, route: current };
      }
      if (current) {
        await replySkill(ctx, row as Doc<"intakes"> & { skillSlug: ChatSkill }, { text });
        return { intakeId: row._id, route: current };
      }
      // Still undecided: this message answers "which do you want?".
      const tapped = choicesOf(row.agentSlug).some((choice) => choice.chip.toLowerCase() === text.toLowerCase());
      const chosen = routeChoice(text);
      const route = chosen && isChatRouteOf(row.agentSlug, chosen) ? chosen : null;
      await ctx.db.insert("intakeMessages", { workspaceId: ctx.workspaceId, intakeId: row._id, role: "you", kind: tapped ? "choice" : "text", text, at: await nextAt(ctx, row._id) });
      if (!route) {
        await pickModel(ctx, row._id, args.model, null);
        await askWhich(ctx, row, true);
        await ctx.db.patch(row._id, { updatedAt: Date.now() });
        return { intakeId: row._id, route: null };
      }
      // The skill reads the question the person first asked, not the choice they tapped.
      const asked = tapped ? (await firstText(ctx, row._id)) || text : text;
      // The skill is known now, so the model picked earlier is checked against it before anything begins.
      await pickModel(ctx, row._id, args.model, route);
      await begin(ctx, route, { text: asked, row, ...choices });
      return { intakeId: row._id, route };
    }

    const agentSlug = args.agentSlug ?? DEFAULT_CHAT_AGENT;
    if (args.skill !== undefined && !isChatRouteOf(agentSlug, args.skill)) throw userError("That work has no chat yet.");
    const context = args.context ? await readContext(ctx, args.context) : undefined;
    const forClient = await clientForNew(ctx, args.clientId);
    const started = await startConversation(ctx, { agentSlug, text, skill: args.skill as ChatRoute | undefined, context, choices, forClient });
    await pickModel(ctx, started.intakeId, args.model, started.route);
    if (isChatPage(args.page)) await ctx.db.patch(started.intakeId, { page: args.page });
    return started;
  },
});

/** Changes the model family of a conversation whose work has not started. Owners, Admins and Members. */
export const setModel = workspaceMutation({
  args: { intakeId: v.id("intakes"), model: v.string() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const row = await ownIntake(ctx, args.intakeId);
    if (row.status === "started") throw userError("This work has already started on the model it was given.");
    await pickModel(ctx, row._id, args.model, routeOf(row));
    return null;
  },
});

/** Sets a conversation aside. Work it already started keeps running. Owners, Admins and Members. */
export const close = workspaceMutation({
  args: { intakeId: v.id("intakes") },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const row = await ownIntake(ctx, args.intakeId);
    if (row.status !== "started") await ctx.db.patch(row._id, { status: "abandoned", updatedAt: Date.now() });
    return null;
  },
});

/**
 * Where a started conversation's work stands, and the link to its result in the tab it belongs to: the
 * session under Research or Diagnostics, the analysis under Offers. `path` is relative to the agent's page.
 */
async function resultOf(ctx: QueryCtx & { workspaceId: Id<"workspaces"> }, row: Doc<"intakes">, route: ChatRoute | null) {
  if (row.status !== "started" || !route) return null;
  const project = row.projectId ? await ctx.db.get(row.projectId) : null;
  const runId = row.runId ?? (project && project.workspaceId === ctx.workspaceId ? project.latestRunId : undefined) ?? null;
  const run = runId ? await ctx.db.get(runId) : null;
  const tab = SKILL_TAB[route];
  const asset =
    run && run.workspaceId === ctx.workspaceId
      ? await ctx.db
          .query("assets")
          .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("createdByRun", run._id))
          .first()
      : null;
  const state = !run || run.workspaceId !== ctx.workspaceId ? "running" : run.status === "waiting" || run.status === "needsInput" ? "waiting" : OPEN_RUN.includes(run.status) ? "running" : run.status === "completed" && asset ? "done" : "stopped";
  const path = tab === "offers" ? (asset ? `/work/offers?analysis=${asset._id}` : "/work/offers") : row.projectId ? `/work/${tab}/${row.projectId}` : `/work/${tab}`;
  return { state: state as "running" | "waiting" | "done" | "stopped", tab, path, title: asset?.title ?? null, assetStatus: asset?.status ?? null, runId: run?._id ?? null };
}

function titleOf(row: Doc<"intakes">, first: string) {
  const slots = row.slots as { objective?: string } | undefined;
  return (first || slots?.objective || row.answers?.offer || row.answers?.goal || "New conversation").slice(0, 120);
}

/** This workspace's conversations with one agent (the Strategist when none is named), newest first. Everyone on the team can read them. */
export const list = workspaceQuery({
  args: { agentSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const agentSlug = args.agentSlug ?? DEFAULT_CHAT_AGENT;
    const rows = await ctx.db
      .query("intakes")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(40);
    const out = [];
    for (const row of ctx.clients.filter(rows)) {
      if (row.status === "abandoned" || row.agentSlug !== agentSlug) continue;
      const route = routeOf(row);
      out.push({
        id: row._id,
        route,
        title: titleOf(row, await firstText(ctx, row._id)),
        status: row.status,
        updatedAt: row.updatedAt,
        mine: row.createdBy === ctx.identity.subject,
        context: row.context ?? null,
        result: await resultOf(ctx, row, route),
      });
      if (out.length >= 30) break;
    }
    return out;
  },
});

const LIBRARY_READ = 400;
const LIBRARY_MAX = 100;

/**
 * Library > Chats and the side panel's list: every chat started in this organization that the person may
 * see, newest first, whatever screen it was started from. One store: a chat from Home, the panel or the
 * Chat tab is the same record and appears once. `mine` keeps only the person's own; `closed` adds the ones
 * set aside. The client picker narrows it through `scope`.
 */
export const library = workspaceQuery({
  args: { limit: v.optional(v.number()), mine: v.optional(v.boolean()), closed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 30), 1), LIBRARY_MAX);
    const rows = await ctx.db
      .query("intakes")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(LIBRARY_READ);
    const names = new Map<string, string>();
    const items = [];
    let more = false;
    for (const row of ctx.clients.filter(rows)) {
      if (!hasChat(row.agentSlug)) continue;
      if (row.status === "abandoned" && !args.closed) continue;
      const mine = row.createdBy === ctx.identity.subject;
      if (args.mine && !mine) continue;
      if (items.length >= limit) {
        more = true;
        break;
      }
      if (row.clientId && !names.has(row.clientId)) names.set(row.clientId, (await ctx.db.get(row.clientId))?.name ?? "A client");
      const route = routeOf(row);
      items.push({
        id: row._id,
        route,
        title: titleOf(row, await firstText(ctx, row._id)),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        mine,
        client: row.clientId ? names.get(row.clientId)! : null,
        /** Where it was started, in words: "Tasks". Null for chats from before the side panel. */
        page: isChatPage(row.page) ? CHAT_PAGES[row.page] : null,
        context: row.context ?? null,
        result: await resultOf(ctx, row, route),
      });
    }
    return { items, more: more || rows.length === LIBRARY_READ };
  },
});

/**
 * One conversation: which skill it is on (null while the chat is asking), what is attached, where its work
 * stands, and its messages. The research and skill conversations also read their own detail queries.
 */
export const get = workspaceQuery({
  args: { intakeId: v.id("intakes") },
  handler: async (ctx, args) => {
    const row = await ownIntake(ctx, args.intakeId);
    const route = routeOf(row);
    const messages = await ctx.db
      .query("intakeMessages")
      .withIndex("by_intake", (q) => q.eq("intakeId", row._id))
      .take(200);
    return {
      id: row._id,
      route,
      /** True for the two skills whose questions come from the skill checklist. */
      checklist: Boolean(row.skillSlug && isChatSkill(row.skillSlug)),
      title: titleOf(row, messages[0]?.role === "you" ? messages[0].text : ""),
      status: row.status,
      mine: row.createdBy === ctx.identity.subject,
      context: row.context ?? null,
      page: isChatPage(row.page) ? CHAT_PAGES[row.page] : null,
      result: await resultOf(ctx, row, route),
      /** The model family picked for this conversation, or null for the organization's default. */
      model: parseChoice(row.modelChoice)?.id ?? null,
      messages: messages.map((message) => ({ id: message._id, role: message.role, kind: message.kind, text: message.text, chips: message.chips ?? [], data: message.data ?? null, model: markOf(message.madeWith), at: message.at })),
    };
  },
});
