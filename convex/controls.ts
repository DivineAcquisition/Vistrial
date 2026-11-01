import { v } from "convex/values";

import { CATALOG, GROWTH_ARCHITECT } from "./catalog";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { SKILL_CAPS, assertWithinCeiling, capsForSkill, dayKey } from "./lib/caps";
import { loadSkillCaps, skillDaySpend } from "./lib/capStore";
import { notAllowed, notFound } from "./lib/errors";
import { runnableSkills } from "./lib/skills";

/** Skills with caps to show: every skill that can run here, and every skill with caps of its own. */
function cappedSkills(): { slug: string; name: string; agentSlug: string }[] {
  const named = new Map<string, { name: string; agentSlug: string }>();
  for (const skill of runnableSkills()) named.set(skill.slug, { name: skill.name, agentSlug: skill.agentSlug });
  for (const slug of Object.keys(SKILL_CAPS)) {
    const agent = CATALOG.find((row) => row.skills.some((item) => item.slug === slug));
    const name = agent?.skills.find((item) => item.slug === slug)?.name ?? slug;
    named.set(slug, { name, agentSlug: agent?.slug ?? GROWTH_ARCHITECT });
  }
  return [...named].map(([slug, row]) => ({ slug, ...row }));
}

const OPEN = ["queued", "running", "waiting"] as const;

async function cancelOpen(ctx: MutationCtx, workspaceId: Id<"workspaces">, stopReason: "cancelled") {
  for (const status of OPEN) {
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
      .take(50);
    for (const run of rows) {
      await ctx.db.patch(run._id, { status: "stopped", stopReason, finishedAt: Date.now() });
      await writeAudit(ctx, {
        workspaceId,
        actorType: "system",
        actorId: "runtime",
        action: "run.finished",
        subject: run._id,
        count: run.costCents,
      });
    }
  }
}

/** Pause, halt, and each skill's caps with its defaults, its ceiling and what it has spent today. */
export const get = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const paused = await ctx.db
      .query("workspaceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const platform = await ctx.db
      .query("platformControls")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    const day = dayKey();
    const skills = await Promise.all(
      cappedSkills().map(async (skill) => {
        const { defaults, ceiling } = capsForSkill(skill.slug);
        return {
          slug: skill.slug,
          name: skill.name,
          caps: await loadSkillCaps(ctx, ctx.workspaceId, skill.slug, skill.agentSlug),
          defaults,
          ceiling,
          daySpentCents: await skillDaySpend(ctx, ctx.workspaceId, skill.slug, day),
        };
      }),
    );
    return {
      skills,
      paused: paused?.agentsPaused === true,
      halted: platform?.halted === true,
    };
  },
});

/** An Owner sets one skill's caps, up to that skill's ceiling. */
export const setCaps = workspaceMutation({
  args: {
    skillSlug: v.string(),
    maxCostCentsPerRun: v.number(),
    maxCostCentsPerDay: v.number(),
    maxSteps: v.number(),
    maxDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (ctx.member.role !== "owner") notAllowed();
    if (!cappedSkills().some((skill) => skill.slug === args.skillSlug)) notFound();
    assertWithinCeiling(args, capsForSkill(args.skillSlug).ceiling);
    if (args.maxSteps < 1 || args.maxDurationMs < 1) throw new Error("Caps must allow at least one step.");
    const current = await ctx.db
      .query("skillCaps")
      .withIndex("by_workspace_skill", (q) => q.eq("workspaceId", ctx.workspaceId).eq("skillSlug", args.skillSlug))
      .unique();
    const fields = {
      maxCostCentsPerRun: args.maxCostCentsPerRun,
      maxCostCentsPerDay: args.maxCostCentsPerDay,
      maxSteps: args.maxSteps,
      maxDurationMs: args.maxDurationMs,
      updatedBy: ctx.identity.subject,
      updatedAt: Date.now(),
    };
    const id = current
      ? (await ctx.db.patch(current._id, fields), current._id)
      : await ctx.db.insert("skillCaps", { workspaceId: ctx.workspaceId, skillSlug: args.skillSlug, ...fields });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "caps.updated",
      subject: id,
      count: args.maxCostCentsPerRun,
    });
    return null;
  },
});

export const setPaused = workspaceMutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.member.role !== "owner") notAllowed();
    const current = await ctx.db
      .query("workspaceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (current) await ctx.db.patch(current._id, { agentsPaused: args.paused });
    else await ctx.db.insert("workspaceControls", { workspaceId: ctx.workspaceId, agentsPaused: args.paused });
    if (args.paused) await cancelOpen(ctx, ctx.workspaceId, "cancelled");
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: args.paused ? "agents.paused" : "agents.resumed",
      subject: ctx.workspaceId,
      count: args.paused ? 1 : 0,
    });
    return null;
  },
});
