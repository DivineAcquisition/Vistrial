/**
 * The usage page: where every credit went. Reads the `usageItems` rollup (lib/usage.ts), never the ledger,
 * and returns credits only: no cost, no markup. Who sees what is decided here (docs/rebuild/usage-page.md,
 * section 4): an Owner the whole account, an Admin their organization, a Member their own work, a Viewer a
 * summary.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { CATALOG } from "./catalog";
import { workLabel } from "./lib/workWords";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { AUTO_REFILL, EXTRA_ORG, PLAN, accountFor, billingOn, billingOwner, planActive, priceFor } from "./lib/billing";
import { workspaceQuery } from "./lib/builders";
import { loadCaps } from "./lib/capRows";
import { INTAKE_CAP_CENTS } from "./lib/intake";
import { MODEL_NAMES } from "./lib/models";
import { organizationsOf } from "./lib/organizations";
import { isAdmin, isOwner, roleOf } from "./lib/roles";
import { spendLimit } from "./lib/approvals";
import { addToUsage, attributionFor } from "./lib/usage";
import {
  DIMENSIONS,
  NONE,
  PERIODS,
  TYPICAL_MIN,
  breakdown,
  daily,
  dayOf,
  forecast,
  matches,
  periodDays,
  typicalUse,
  workItems,
  type Dimension,
  type Filters,
  type Period,
  type UsageRow,
} from "./lib/usageReport";

/** The most rollup rows one read takes. Past it the page says the breakdown is partial. */
export const ROW_LIMIT = 8000;
const DAY_MS = 86_400_000;
/** The window every read covers: the longest period, so typical use is measured over the same 90 days. */
const WINDOW_DAYS = 90;

const periodValidator = v.union(...PERIODS.map((period) => v.literal(period)));
const filterArgs = {
  period: periodValidator,
  organizationId: v.optional(v.string()),
  clientId: v.optional(v.string()),
  agentSlug: v.optional(v.string()),
  skillSlug: v.optional(v.string()),
  person: v.optional(v.string()),
  model: v.optional(v.string()),
};

type Access = "account" | "organization" | "own" | "summary";
type FilterArgs = { period: Period; organizationId?: string; clientId?: string; agentSlug?: string; skillSlug?: string; person?: string; model?: string };
type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; member: Doc<"members">; identity: { subject: string }; clients: { all: boolean; sees: (id: Id<"clients"> | undefined | null) => boolean } };

function accessOf(role: string): Access {
  if (isOwner(role)) return "account";
  if (isAdmin(role)) return "organization";
  return roleOf(role) === "viewer" ? "summary" : "own";
}

/** The day the current plan month began: a month before the next reset, else the first of this month. */
function monthStartOf(resetAt: number | null | undefined, now: number) {
  if (resetAt) {
    const reset = new Date(resetAt);
    const start = Date.UTC(reset.getUTCFullYear(), reset.getUTCMonth() - 1, reset.getUTCDate(), reset.getUTCHours(), reset.getUTCMinutes());
    if (start <= now) return start;
  }
  const today = new Date(now);
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
}

async function readRows(ctx: QueryCtx, workspaceIds: Id<"workspaces">[], fromDay: string, person?: string) {
  const rows: Doc<"usageItems">[] = [];
  let truncated = false;
  for (const workspaceId of workspaceIds) {
    const room = ROW_LIMIT - rows.length;
    if (room <= 0) {
      truncated = true;
      break;
    }
    const batch = person
      ? await ctx.db
          .query("usageItems")
          .withIndex("by_workspace_person_day", (q) => q.eq("workspaceId", workspaceId).eq("startedBy", person).gte("day", fromDay))
          .order("desc")
          .take(room + 1)
      : await ctx.db
          .query("usageItems")
          .withIndex("by_workspace_day", (q) => q.eq("workspaceId", workspaceId).gte("day", fromDay))
          .order("desc")
          .take(room + 1);
    if (batch.length > room) {
      truncated = true;
      batch.length = room;
    }
    rows.push(...batch);
  }
  return { rows, truncated };
}

function toRow(row: Doc<"usageItems">): UsageRow {
  return {
    workspaceId: row.workspaceId,
    source: row.source,
    ref: row.ref,
    day: row.day,
    model: row.model,
    priceCents: row.priceCents,
    firstAt: row.firstAt,
    lastAt: row.lastAt,
    startedBy: row.startedBy,
    agentSlug: row.agentSlug,
    skillSlug: row.skillSlug,
    clientId: row.clientId,
    title: row.title,
  };
}

/** Everything one person may read, before the filters: the organizations, the rows and whether the read was cut short. */
async function scoped(ctx: Ctx, args: FilterArgs, now: number) {
  const access = accessOf(ctx.member.role);
  const owner = await billingOwner(ctx, ctx.workspaceId);
  const all = owner.account ? await organizationsOf(ctx, owner.account._id) : [];
  const here = await ctx.db.get(ctx.workspaceId);
  const organizations = access === "account" && all.length > 0 ? all : here ? [here] : [];
  const fromDay = dayOf(now - (WINDOW_DAYS - 1) * DAY_MS);
  if (access === "summary") return { access, owner, organizations, rows: [] as UsageRow[], truncated: false };
  const wanted = access === "account" && args.organizationId ? organizations.filter((row) => row._id === args.organizationId) : organizations;
  const person = access === "own" ? ctx.identity.subject : undefined;
  const read = await readRows(ctx, wanted.map((row) => row._id), fromDay, person);
  // A Member sees only what they started, and only for clients they may see.
  const rows = read.rows.filter((row) => ctx.clients.all || ctx.clients.sees(row.clientId)).map(toRow);
  return { access, owner, organizations, rows, truncated: read.truncated };
}

function filtersOf(args: FilterArgs, access: Access): Filters {
  return {
    ...(args.skillSlug ? { skill: args.skillSlug } : {}),
    ...(args.agentSlug ? { agent: args.agentSlug } : {}),
    ...(args.clientId ? { client: args.clientId } : {}),
    ...(args.model ? { model: args.model } : {}),
    // A Member's person filter is always themselves: the rows are theirs already.
    ...(args.person && access !== "own" ? { person: args.person } : {}),
  };
}

/** Names for every key the rows use. A client the person may not see is never named. */
async function namesFor(ctx: Ctx, rows: UsageRow[], organizations: Doc<"workspaces">[]) {
  const agentSlugs = new Set(rows.map((row) => row.agentSlug).filter(Boolean) as string[]);
  const skillSlugs = new Set(rows.map((row) => row.skillSlug).filter(Boolean) as string[]);
  const clientIds = new Set(rows.map((row) => row.clientId).filter(Boolean) as string[]);
  const people = new Set(rows.map((row) => row.startedBy).filter(Boolean) as string[]);
  const models = new Set(rows.map((row) => row.model).filter(Boolean));

  // Agents and skills are named as the catalog names them today, so a renamed agent shows its new name on old work.
  const agent: Record<string, string> = {};
  for (const slug of agentSlugs) {
    const known = CATALOG_AGENT_NAMES[slug];
    const row = known ? null : await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    agent[slug] = known ?? row?.name ?? pretty(slug);
  }
  const skill: Record<string, string> = {};
  for (const slug of skillSlugs) {
    const known = CATALOG_SKILL_NAMES[slug];
    const row = known ? null : await ctx.db.query("skills").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    skill[slug] = known ?? row?.name ?? pretty(slug);
  }
  const client: Record<string, string> = {};
  for (const id of clientIds) {
    const clientId = ctx.db.normalizeId("clients", id);
    const row = clientId && ctx.clients.sees(clientId) ? await ctx.db.get(clientId) : null;
    client[id] = row?.name ?? "A client";
  }
  const person: Record<string, string> = {};
  for (const userId of people) {
    let name: string | null = null;
    for (const organization of organizations) {
      const row = await ctx.db
        .query("members")
        .withIndex("by_workspace_user", (q) => q.eq("workspaceId", organization._id).eq("userId", userId))
        .first();
      if (row) {
        name = row.displayName + (row.active ? "" : " (left)");
        break;
      }
    }
    person[userId] = userId === ctx.identity.subject ? `${name ?? "You"} (you)` : (name ?? "Someone who left");
  }
  const model: Record<string, string> = {};
  for (const id of models) model[id] = MODEL_NAMES[id] ?? pretty(id.split("/").pop() ?? id);
  const organization: Record<string, string> = Object.fromEntries(organizations.map((row) => [row._id, row.name]));
  return { agent, skill, client, person, model, organization };
}

const CATALOG_AGENT_NAMES: Record<string, string> = Object.fromEntries(CATALOG.map((row) => [row.slug, row.name]));
/** A skill is named by its work ("Research"), never by its own name: lib/workWords.ts. */
const CATALOG_SKILL_NAMES: Record<string, string> = Object.fromEntries(CATALOG.flatMap((row) => row.skills.map((skill) => [skill.slug, workLabel(skill.slug)])));

function pretty(slug: string) {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

const NONE_WORDS: Record<Dimension, string> = {
  skill: "Other work",
  agent: "No agent",
  client: "Your own organization",
  model: "Tools and page reading",
  person: "Not recorded",
  organization: "Unknown",
};

function labelFor(names: Awaited<ReturnType<typeof namesFor>>, dimension: Dimension, key: string) {
  if (key === NONE) return NONE_WORDS[dimension];
  return names[dimension][key] ?? pretty(key);
}

const SOURCE_WORDS: Record<UsageRow["source"], string> = {
  run: "Run",
  followup: "Follow-up",
  intake: "Chat",
  file: "File read",
  creative: "Image",
  page: "Page reading",
};

const TYPICAL_WORDS: Record<UsageRow["source"], string> = {
  run: "Other agent work",
  followup: "A follow-up answer",
  intake: "A chat",
  file: "Reading a file",
  creative: "An image",
  page: "Reading pages",
};

export const overview = workspaceQuery({
  args: filterArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const read = await scoped(ctx, args, now);
    const { access, owner } = read;
    const mirror = await accountFor(ctx, ctx.workspaceId);
    const resetAt = mirror?.nextResetAt ?? null;
    const monthStart = monthStartOf(resetAt, now);
    const extra = mirror?.extraOrganizations ?? 0;
    const included = planActive(mirror) || !billingOn() ? PLAN.includedCents + extra * EXTRA_ORG.includedCents : 0;

    // The month's use and the pace are the account's: every organization spends from the one balance.
    let usedThisMonth: number | null = null;
    let pace: ReturnType<typeof forecast> | null = null;
    if (access === "account" || access === "organization") {
      const everyOrganization = owner.account ? await organizationsOf(ctx, owner.account._id) : read.organizations;
      const since = dayOf(Math.min(monthStart, now - 13 * DAY_MS));
      const accountRows = (await readRows(ctx, everyOrganization.map((row) => row._id), since)).rows;
      const monthDay = dayOf(monthStart);
      const fortnight = dayOf(now - 13 * DAY_MS);
      usedThisMonth = accountRows.filter((row) => row.day >= monthDay).reduce((sum, row) => sum + row.priceCents, 0);
      const last14 = accountRows.filter((row) => row.day >= fortnight).reduce((sum, row) => sum + row.priceCents, 0);
      pace = mirror ? forecast({ balance: mirror.balanceCents, usedLast14Days: last14, now, resetAt }) : null;
    }

    const balance = {
      on: billingOn(),
      planName: PLAN.name,
      balance: mirror?.balanceCents ?? null,
      includedThisMonth: included,
      /** What the month's credits are made of: the plan's, and those each extra organization adds. */
      includedParts: included > 0 ? { plan: PLAN.includedCents, extraOrganizations: extra, perOrganization: EXTRA_ORG.includedCents } : null,
      usedThisMonth,
      packs: access === "summary" ? null : (mirror?.packsCents ?? null),
      resetAt,
      forecast: pace,
      lowAt: AUTO_REFILL.thresholdCents,
    };
    const limits = await limitsFor(ctx);
    if (access === "summary") {
      return { access, balance, limits, period: null, totals: null, daily: null, by: null, options: null, typical: null, truncated: false };
    }

    const filters = filtersOf(args, access);
    const days = periodDays(args.period, now, monthStart);
    const inPeriod = read.rows.filter((row) => row.day >= days[0]);
    const filtered = inPeriod.filter((row) => matches(row, filters));
    const names = await namesFor(ctx, read.rows, read.organizations);

    // The work an agent did is shown only inside its row ("parts" below), never as a breakdown or filter of its own.
    const dimensions = DIMENSIONS.filter((dimension) => {
      if (dimension === "skill") return false;
      if (dimension === "organization") return access === "account" && read.organizations.length > 1;
      if (dimension === "person") return access !== "own";
      return true;
    });
    const by = Object.fromEntries(
      dimensions.map((dimension) => [dimension, breakdown(filtered, dimension).map((slice) => ({ ...slice, label: labelFor(names, dimension, slice.key) }))]),
    ) as Partial<Record<Dimension, (ReturnType<typeof breakdown>[number] & { label: string; parts?: { key: string; label: string; credits: number }[] })[]>>;
    // Each agent's row carries what it spent on each kind of its work, condensed: "Research 9,800 · Ads 1,200".
    for (const slice of by.agent ?? []) {
      slice.parts = breakdown(
        filtered.filter((row) => (row.agentSlug ?? NONE) === slice.key),
        "skill",
      ).map((part) => ({ key: part.key, label: labelFor(names, "skill", part.key), credits: part.credits }));
    }
    // What each filter can be set to: everything seen in the period with the other filters applied.
    const options = Object.fromEntries(
      dimensions.map((dimension) => [
        dimension,
        breakdown(
          inPeriod.filter((row) => matches(row, filters, dimension)),
          dimension,
        ).map((slice) => ({ key: slice.key, label: labelFor(names, dimension, slice.key) })),
      ]),
    ) as Partial<Record<Dimension, { key: string; label: string }[]>>;
    const stacked = daily(filtered, days, "agent");
    const total = filtered.reduce((sum, row) => sum + row.priceCents, 0);
    const typical = typicalUse(read.rows.filter((row) => matches(row, { ...(filters.client ? { client: filters.client } : {}) })))
      .map((row) => ({
        ...row,
        label: row.key.startsWith("source:") ? TYPICAL_WORDS[row.source] : labelFor(names, "skill", row.key),
        enough: row.count >= TYPICAL_MIN,
      }));

    return {
      access,
      balance,
      limits,
      period: { period: args.period, from: days[0], to: days[days.length - 1], days: days.length },
      totals: { credits: total, items: new Set(filtered.map((row) => `${row.workspaceId}:${row.source}:${row.ref}`)).size, perDay: days.length ? total / days.length : 0 },
      daily: { bars: stacked.bars, keys: stacked.keys.map((key) => ({ key, label: labelFor(names, "agent", key) })) },
      by,
      options,
      typical,
      truncated: read.truncated,
    };
  },
});

/** The caps that bound spending here, in credits: per skill per run and per day, the approval limit, refill and chat caps. */
async function limitsFor(ctx: Ctx) {
  const perSkill = [];
  for (const agent of CATALOG) {
    if (agent.status !== "live") continue;
    for (const skill of agent.skills) {
      if (skill.status !== "available") continue;
      const caps = await loadCaps(ctx, ctx.workspaceId, agent.slug, skill.slug);
      perSkill.push({ skillSlug: skill.slug, agentSlug: agent.slug, label: workLabel(skill.slug), perRun: priceFor(caps.maxCostCentsPerRun), perDay: priceFor(caps.maxCostCentsPerDay) });
    }
  }
  return {
    perSkill,
    spendApproval: await spendLimit(ctx, ctx.workspaceId),
    autoRefill: { threshold: AUTO_REFILL.thresholdCents, amount: AUTO_REFILL.amountCents, maxPerMonth: AUTO_REFILL.maxPerMonth },
    chatCap: priceFor(INTAKE_CAP_CENTS),
  };
}

/** Where a piece of work opens. Work in another organization has no link here: it opens from that organization. */
async function hrefOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, item: { source: UsageRow["source"]; ref: string; workspaceId: string }) {
  if (item.workspaceId !== workspaceId) return null;
  const db = ctx.db;
  if (item.source === "run") return `/app/runs/${item.ref}`;
  if (item.source === "followup") {
    const id = db.normalizeId("sessionChats", item.ref);
    const chat = id ? await db.get(id) : null;
    return chat ? `/app/research/${chat.projectId}` : null;
  }
  if (item.source === "intake") {
    const id = db.normalizeId("intakes", item.ref);
    const intake = id ? await db.get(id) : null;
    if (!intake) return null;
    if (intake.runId) return `/app/runs/${intake.runId}`;
    if (intake.projectId) return `/app/research/${intake.projectId}`;
    return "/app/chats";
  }
  if (item.source === "creative") {
    const id = db.normalizeId("creativeImages", item.ref);
    const image = id ? await db.get(id) : null;
    return image ? `/app/assets/${image.assetId}` : null;
  }
  if (item.source === "file") {
    const id = db.normalizeId("sessionFiles", item.ref);
    const file = id ? await db.get(id) : null;
    if (file?.projectId) return `/app/research/${file.projectId}`;
    return file?.intakeId ? "/app/chats" : null;
  }
  const id = db.normalizeId("pageReadJobs", item.ref);
  const job = id ? await db.get(id) : null;
  return job?.runId ? `/app/runs/${job.runId}` : null;
}

/** The list of work behind the page's numbers: every run, chat, image or page read in the filter, newest first. */
export const items = workspaceQuery({
  args: { ...filterArgs, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const read = await scoped(ctx, args, now);
    if (read.access === "summary") return { items: [], total: 0, truncated: false };
    const mirror = await accountFor(ctx, ctx.workspaceId);
    const days = periodDays(args.period, now, monthStartOf(mirror?.nextResetAt, now));
    const rows = read.rows.filter((row) => row.day >= days[0] && matches(row, filtersOf(args, read.access)));
    const all = workItems(rows);
    const limit = Math.max(1, Math.min(500, Math.round(args.limit ?? 50)));
    const names = await namesFor(ctx, rows, read.organizations);
    const shown = [];
    for (const item of all.slice(0, limit)) {
      shown.push({
        key: `${item.workspaceId}:${item.source}:${item.ref}`,
        kind: SOURCE_WORDS[item.source],
        source: item.source,
        title: item.title ?? (item.skillSlug ? labelFor(names, "skill", item.skillSlug) : SOURCE_WORDS[item.source]),
        at: item.lastAt,
        startedAt: item.firstAt,
        person: item.startedBy ? labelFor(names, "person", item.startedBy) : NONE_WORDS.person,
        agentSlug: item.agentSlug ?? null,
        agent: item.agentSlug ? labelFor(names, "agent", item.agentSlug) : null,
        skill: item.skillSlug ? labelFor(names, "skill", item.skillSlug) : null,
        client: item.clientId ? labelFor(names, "client", item.clientId) : null,
        organization: read.organizations.length > 1 ? labelFor(names, "organization", item.workspaceId) : null,
        models: item.models.map((model) => labelFor(names, "model", model)),
        credits: item.credits,
        href: await hrefOf(ctx, ctx.workspaceId, item),
      });
    }
    return { items: shown, total: all.length, truncated: read.truncated };
  },
});

// ------------------------------------------------------------------------------------------- backfill

/**
 * Builds the rollup from ledger rows written before it existed, one organization and one page at a time.
 * Run once per deployment: `npx convex run usage:backfill '{}'`. It schedules itself until every page of
 * every organization is done. Rows charged since the rollup began carry `inUsage` and are skipped. Running
 * it again first clears what an earlier pass wrote, so nothing is counted twice.
 */
export const backfill = internalMutation({
  args: { workspaceId: v.optional(v.id("workspaces")), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const workspace = args.workspaceId ? await ctx.db.get(args.workspaceId) : await ctx.db.query("workspaces").order("asc").first();
    if (!workspace) return { done: true };
    if (!args.cursor) {
      const old = await ctx.db
        .query("usageItems")
        .withIndex("by_workspace_day", (q) => q.eq("workspaceId", workspace._id))
        .filter((q) => q.eq(q.field("backfilled"), true))
        .take(2000);
      for (const row of old) await ctx.db.delete(row._id);
      if (old.length === 2000) {
        await ctx.scheduler.runAfter(0, internal.usage.backfill, { workspaceId: workspace._id, cursor: null });
        return { done: false };
      }
    }
    const page = await ctx.db
      .query("billingLedger")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspace._id))
      .paginate({ cursor: args.cursor ?? null, numItems: 200 });
    for (const row of page.page) {
      if (row.inUsage) continue;
      const who = await attributionFor(ctx, row.workspaceId, row.source, row.ref);
      const stamped = { startedBy: row.startedBy ?? who.startedBy, agentSlug: row.agentSlug ?? who.agentSlug, skillSlug: row.skillSlug ?? who.skillSlug, clientId: row.clientId ?? who.clientId, title: who.title };
      await addToUsage(ctx, { workspaceId: row.workspaceId, source: row.source, ref: row.ref, priceCents: row.priceCents, at: row.at, model: row.model ?? who.model }, stamped, true);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.usage.backfill, { workspaceId: workspace._id, cursor: page.continueCursor });
      return { done: false };
    }
    const next = await ctx.db
      .query("workspaces")
      .filter((q) => q.gt(q.field("_creationTime"), workspace._creationTime))
      .first();
    if (next) await ctx.scheduler.runAfter(0, internal.usage.backfill, { workspaceId: next._id, cursor: null });
    return { done: !next };
  },
});
