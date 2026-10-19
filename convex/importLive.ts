import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation } from "./_generated/server";
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
    for (const row of args.runs) await upsertRun(ctx, row as Record<string, unknown>);
    for (const row of args.steps) await upsertStep(ctx, row as Record<string, unknown>);
    for (const row of args.events) await upsertEvent(ctx, row as Record<string, unknown>);
    for (const row of args.outputs) await upsertOutput(ctx, row as Record<string, unknown>);
    for (const row of args.staff) await upsertStaff(ctx, row as Record<string, unknown>);
    for (const row of args.controls) await upsertPresence(ctx, row as Record<string, unknown>);
    for (const row of args.approvals) await upsertApproval(ctx, row as Record<string, unknown>);
    for (const row of args.notifications) await upsertNotification(ctx, row as Record<string, unknown>);
    return {
      runs: args.runs.length,
      steps: args.steps.length,
      events: args.events.length,
      outputs: args.outputs.length,
      staff: args.staff.length,
      controls: args.controls.length,
      approvals: args.approvals.length,
      notifications: args.notifications.length,
    };
  },
});
