import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { GROWTH_ARCHITECT } from "../../catalog";
import { post, settingsOf } from "../../lib/briefing";
import { creditWords, priceFor } from "../../lib/credits";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { latest, latestDone, recordOf } from "../marketIntelligence/records";
import type { SkillContext } from "../types";
import { MAX_SUBJECTS, PHASE, closingWords, readSources, settlePosts, sourceTitle, type Subject, type TrendPlan } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });
const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

export async function trendPlanOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "plan")) as TrendPlan | null) : null;
}

/** What this run's searches returned, as dated sources. Read from the run's own records, never from model text. */
export async function trendSourcesOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, now: number) {
  const rows = await db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .order("asc")
    .take(300);
  return readSources(rows.filter((row) => row.kind === "sources" && row.body).map((row) => row.body!), now);
}

/**
 * Read: whose industries this month's search is about. The organization itself, from its confirmed
 * profile, and up to three business clients that have an industry written down, most recently worked on
 * first. With the switch off, or nothing to search for, the run ends here and no model is called.
 */
const read: MutationTool = async (ctx, run) => {
  const workspaceId = run.workspaceId;
  if (!(await settingsOf(ctx, workspaceId)).trendPosts) return { resultCode: "switched_off", resultId: "0", artifact: record("plan", { monthKey: run.inputRef, at: Date.now(), subjects: [] } satisfies TrendPlan) };
  const subjects: Subject[] = [];
  const add = (clientId: Id<"clients"> | null, name: string, industry: string) => {
    const words = clip(industry, 240);
    if (words.length < 3 || subjects.length >= MAX_SUBJECTS) return;
    subjects.push({ id: `t${subjects.length + 1}`, clientId, name: clip(name, 80), industry: words });
  };
  const workspace = await ctx.db.get(workspaceId);
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  if (profile?.offer.trim()) add(null, workspace?.name ?? "your organization", [profile.offer, profile.audience ? `for ${profile.audience}` : "", profile.geography ? `in ${profile.geography}` : ""].filter(Boolean).join(" "));
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).eq("status", "active"))
    .order("desc")
    .take(40);
  for (const client of clients) {
    const industry = client.business?.industry.trim();
    if (!industry) continue;
    add(client._id, client.name, [industry, client.business?.offer ? `(${client.business.offer})` : ""].filter(Boolean).join(" "));
  }
  const value: TrendPlan = { monthKey: run.inputRef, at: Date.now(), subjects };
  return { resultCode: subjects.length ? "ok" : "nothing_to_search", resultId: String(subjects.length), artifact: record("plan", value) };
};

/**
 * Save: each post that stands (settlePosts) is written to the Briefing with its sources linked, for the
 * organization or for the client it is about. When none stands, one post says so and what the reading
 * used, so credits are never spent silently. A trend post creates no task and changes nothing else.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const plan = await trendPlanOf(ctx.db, run, steps);
  if (!plan) return { failCode: "no_plan" };
  if (plan.subjects.length === 0) return { resultCode: "nothing_to_post", resultId: "0", artifact: record("posted", { posted: [], notes: [] }) };
  const researched = Boolean(latestDone(steps, PHASE.research));
  const found = await trendSourcesOf(ctx.db, run, plan.at);
  const writeStep = latestDone(steps, PHASE.write);
  const written = writeStep ? await recordOf(ctx.db, run, writeStep._id, "model") : null;
  const { posts, notes } = settlePosts(plan, found.usable, written);
  const used = priceFor(run.costCents);
  const usedWords = `Reading this month's trends used ${creditWords(used)}${posts.length > 1 ? `, for all ${posts.length} of this month's posts` : ""}.`;
  const posted: string[] = [];
  for (const [index, item] of posts.entries()) {
    const clientId = item.subject.clientId ? ctx.db.normalizeId("clients", item.subject.clientId) : null;
    const id = await post(ctx, {
      workspaceId: run.workspaceId,
      ...(clientId ? { clientId } : {}),
      kind: "trend",
      agentSlug: GROWTH_ARCHITECT,
      title: `Industry trend${clientId ? ` for ${item.subject.name}` : ""}: ${item.headline}`,
      body: [item.body, closingWords(item), ...(index === 0 ? [usedWords] : [])].join("\n\n"),
      sources: item.sources.map((source) => ({ title: sourceTitle(source), url: source.url })),
      ...(index === 0 ? { credits: used } : {}),
      key: `trend:${plan.monthKey}:${item.subject.clientId ?? "own"}`,
    });
    if (id) posted.push(id);
  }
  if (posts.length === 0) {
    const skipped = latest(steps, PHASE.research)?.resultCode === "over_budget";
    const why = skipped
      ? "This month's reading did not start: its worst-case cost was above the trend posts' credit cap, so nothing was read and nothing was used."
      : !researched
        ? "This month's reading did not finish, so there is nothing to report."
        : found.usable.length < 2
          ? `Nothing found this month had two dated sources from different sites within the last 45 days${found.undated + found.stale > 0 ? ` (${found.undated} had no date of their own, ${found.stale} were older)` : ""}.`
          : "Nothing written from this month's sources met the rule: at least two dated sources from different sites, one of them not a social post, and no promise.";
    await post(ctx, { workspaceId: run.workspaceId, kind: "trend", agentSlug: GROWTH_ARCHITECT, title: "No industry trend to report this month", body: [why, ...(used > 0 ? [`Reading used ${creditWords(used)}.`] : [])].join("\n\n"), credits: used, key: `trend:${plan.monthKey}:none` });
  }
  return { resultCode: posts.length ? "ok" : "nothing_posted", resultId: String(posts.length), artifact: record("posted", { posted, notes, undated: found.undated, stale: found.stale }) };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const TREND_TOOLS: Record<string, MutationTool> = { "it.read": read, "it.save": save };
