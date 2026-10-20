import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation } from "./_generated/server";
import { redactInbound } from "./redactText";
import {
  upsertApproval,
  upsertEvent,
  upsertNotification,
  upsertOutput,
  upsertPresence,
  upsertRun,
  upsertStaff,
  upsertStep,
} from "./liveRows";

function asRow(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function scrubOutput(row: Record<string, unknown>): { row: Record<string, unknown>; redacted: boolean } {
  const body = typeof row.body === "string" ? redactInbound(row.body) : { text: null, redacted: false };
  if (!body.redacted) return { row, redacted: false };
  return { row: { ...row, body: body.text, verbatim: true }, redacted: true };
}

/** Copy of the live-core tables. A signed-in person cannot call this. */
export const importBatch = mutation({
  args: {
    key: v.string(),
    runs: v.array(v.any()),
    steps: v.array(v.any()),
    events: v.array(v.any()),
    outputs: v.array(v.any()),
    staff: v.array(v.any()),
    controls: v.array(v.any()),
    approvals: v.array(v.any()),
    notifications: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "import", key: args.key });
    let redacted = 0;
    for (const row of args.runs) await upsertRun(ctx, asRow(row));
    for (const row of args.steps) await upsertStep(ctx, asRow(row));
    for (const row of args.events) await upsertEvent(ctx, asRow(row));
    for (const row of args.outputs) {
      const scrubbed = scrubOutput(asRow(row));
      if (scrubbed.redacted) redacted += 1;
      await upsertOutput(ctx, scrubbed.row);
    }
    for (const row of args.staff) await upsertStaff(ctx, asRow(row));
    for (const row of args.controls) await upsertPresence(ctx, asRow(row));
    for (const row of args.approvals) await upsertApproval(ctx, asRow(row));
    for (const row of args.notifications) await upsertNotification(ctx, asRow(row));
    await ctx.db.insert("importUses", {
      at: new Date().toISOString(),
      purpose: "history",
      redacted,
      counts: { runs: args.runs.length, outputs: args.outputs.length },
    });
    return {
      runs: args.runs.length,
      steps: args.steps.length,
      events: args.events.length,
      outputs: args.outputs.length,
      staff: args.staff.length,
      controls: args.controls.length,
      approvals: args.approvals.length,
      notifications: args.notifications.length,
      redacted,
    };
  },
});

/**
 * One-time history copy and the catch-up step. Live writers cannot call this:
 * it accepts only the import key. Approvals are not copied.
 */
export const importHistory = mutation({
  args: {
    key: v.string(),
    purpose: v.union(v.literal("history"), v.literal("catchup")),
    runs: v.array(v.any()),
    steps: v.array(v.any()),
    events: v.array(v.any()),
    outputs: v.array(v.any()),
    staff: v.array(v.any()),
    agentRuns: v.array(v.any()),
    agentRunSteps: v.array(v.any()),
    agentRunApprovals: v.array(v.any()),
    agentEvents: v.array(v.any()),
    agentEscalations: v.array(v.any()),
    agentAssets: v.array(v.any()),
    researchFacts: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "import", key: args.key });
    let redacted = 0;
    const counts = {
      runs: 0,
      steps: 0,
      events: 0,
      outputs: 0,
      staff: 0,
      agentRuns: 0,
      agentRunSteps: 0,
      agentRunApprovals: 0,
      agentEvents: 0,
      agentEscalations: 0,
      agentAssets: 0,
      researchFacts: 0,
      unmapped: 0,
    };
    for (const row of args.runs) {
      await upsertRun(ctx, { ...asRow(row), verbatim: true });
      counts.runs += 1;
    }
    for (const row of args.steps) {
      await upsertStep(ctx, asRow(row));
      counts.steps += 1;
    }
    for (const row of args.events) {
      await upsertEvent(ctx, asRow(row));
      counts.events += 1;
    }
    for (const row of args.outputs) {
      const scrubbed = scrubOutput({ ...asRow(row), verbatim: true });
      if (scrubbed.redacted) redacted += 1;
      await upsertOutput(ctx, scrubbed.row);
      counts.outputs += 1;
    }
    for (const row of args.staff) {
      await upsertStaff(ctx, asRow(row));
      counts.staff += 1;
    }
    for (const row of args.agentRuns) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertRun(ctx, {
        ...source,
        id: `agent_run:${String(source.id)}`,
        agent_id: source.agent_id ?? "operator",
        status: source.status ?? "completed",
        subject_label: source.subject_label ?? "Earlier agent work",
        verbatim: true,
      });
      counts.agentRuns += 1;
    }
    for (const row of args.agentRunSteps) {
      const source = asRow(row);
      if (!source.id || !source.run_id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertStep(ctx, {
        ...source,
        id: `agent_run_step:${String(source.id)}`,
        run_id: `agent_run:${String(source.run_id)}`,
        agent_id: source.agent_id ?? "operator",
        seq: source.seq ?? 0,
        status: source.state ?? source.status ?? "done",
        label: source.label ?? source.tool_name ?? "Step",
      });
      counts.agentRunSteps += 1;
    }
    for (const row of args.agentRunApprovals) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertEvent(ctx, {
        id: `agent_run_approval:${String(source.id)}`,
        org_id: source.org_id,
        run_id: source.run_id ? `agent_run:${String(source.run_id)}` : `agent_run_approval:${String(source.id)}`,
        agent_id: "operator",
        kind: "agent_run_approval",
        label: "A connected-system decision was recorded",
        occurred_at: source.created_at ?? new Date(0).toISOString(),
        verbatim: true,
      });
      counts.agentRunApprovals += 1;
    }
    for (const row of args.agentEvents) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertEvent(ctx, {
        id: `agent_event:${String(source.id)}`,
        org_id: source.org_id,
        run_id: `agent_event:${String(source.id)}`,
        agent_id: "operator",
        lead_id: source.lead_id,
        kind: "agent_event",
        label: String(source.action_taken ?? "Earlier work"),
        occurred_at: source.occurred_at ?? source.created_at ?? new Date(0).toISOString(),
        verbatim: true,
      });
      counts.agentEvents += 1;
    }
    for (const row of args.agentEscalations) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertEvent(ctx, {
        id: `agent_escalation:${String(source.id)}`,
        org_id: source.org_id,
        run_id: source.run_id ? `agent_run:${String(source.run_id)}` : `agent_escalation:${String(source.id)}`,
        agent_id: source.agent_id ?? "operator",
        kind: "escalation",
        label: "The model tier changed",
        occurred_at: source.created_at ?? new Date(0).toISOString(),
        verbatim: true,
      });
      counts.agentEscalations += 1;
    }
    for (const row of args.agentAssets) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      const scrubbed = scrubOutput({
        id: `agent_asset:${String(source.id)}`,
        org_id: source.org_id,
        run_id: source.run_id ? `agent_run:${String(source.run_id)}` : `agent_asset:${String(source.id)}`,
        agent_id: source.agent_id ?? "operator",
        kind: "asset",
        title: source.title ?? "Saved work",
        body: source.body ?? null,
        verbatim: true,
      });
      if (scrubbed.redacted) redacted += 1;
      await upsertOutput(ctx, scrubbed.row);
      counts.agentAssets += 1;
    }
    for (const row of args.researchFacts) {
      const source = asRow(row);
      if (!source.id || !source.org_id) {
        counts.unmapped += 1;
        continue;
      }
      await upsertEvent(ctx, {
        id: `research_fact:${String(source.id)}`,
        org_id: source.org_id,
        run_id: source.run_id ? `agent_run:${String(source.run_id)}` : `research_fact:${String(source.id)}`,
        agent_id: "operator",
        kind: "research_fact",
        label: "A research note was kept",
        occurred_at: source.found_at ?? source.created_at ?? new Date(0).toISOString(),
        verbatim: true,
      });
      counts.researchFacts += 1;
    }
    await ctx.db.insert("importUses", { at: new Date().toISOString(), purpose: args.purpose, redacted, counts });
    return { ...counts, redacted };
  },
});
