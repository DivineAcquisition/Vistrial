import { internalMutation } from "./_generated/server";
import { ensureAgents } from "./lib/agents";

/** Idempotent catalog seed. Does not create workspaces. */
export const agents = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureAgents(ctx);
    return null;
  },
});
