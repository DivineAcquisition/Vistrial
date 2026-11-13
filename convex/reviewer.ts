/**
 * Test accounts for platform reviewers (Meta App Review). Internal only: run from the Convex dashboard
 * (Functions → reviewer → createReviewerAccount). The Clerk secret key is read from this deployment's
 * environment and never leaves it. Running it again for the same email gives a fresh password and keeps
 * the workspace.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { userError } from "./lib/errors";

const CLERK_API = "https://api.clerk.com/v1";

/** A strong password people can type: four groups, letters and digits, no look-alike characters. */
function newPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) => {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return [...bytes].map((byte) => set[byte % set.length]).join("");
  };
  return `${pick(letters, 5)}-${pick(letters, 5)}-${pick(letters, 5)}-${pick(digits, 4)}`;
}

type ClerkError = { errors?: { code?: string; message?: string }[] };

async function clerk(key: string, path: string, init: { method: string; body?: unknown }) {
  const response = await fetch(`${CLERK_API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, body };
}

function clerkMessage(body: unknown) {
  const first = (body as ClerkError | null)?.errors?.[0];
  return first?.message ?? first?.code ?? "unknown error";
}

export const createReviewerAccount = internalAction({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ email: string; password: string; signInUrl: string; workspaceId: string; created: boolean }> => {
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) throw new Error("Add CLERK_SECRET_KEY (the Clerk secret key for this deployment's Clerk instance) to this deployment's environment variables.");
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw userError("Give a valid email address.");
    const password = newPassword();

    let userId: string | null = null;
    let created = false;
    const create = await clerk(key, "/users", {
      method: "POST",
      body: { email_address: [email], password, first_name: "Meta", last_name: "Reviewer", skip_legal_checks: true },
    });
    if (create.ok) {
      userId = (create.body as { id?: string }).id ?? null;
      created = true;
    } else {
      const code = (create.body as ClerkError | null)?.errors?.[0]?.code;
      if (code !== "form_identifier_exists") throw new Error(`Clerk refused to create the user: ${clerkMessage(create.body)}`);
      const found = await clerk(key, `/users?email_address=${encodeURIComponent(email)}`, { method: "GET" });
      const rows = Array.isArray(found.body) ? (found.body as { id?: string }[]) : [];
      userId = rows[0]?.id ?? null;
      if (!userId) throw new Error("Clerk says the email exists but did not return the user.");
      const reset = await clerk(key, `/users/${userId}`, { method: "PATCH", body: { password, skip_password_checks: false } });
      if (!reset.ok) throw new Error(`Clerk refused to set the password: ${clerkMessage(reset.body)}`);
    }
    if (!userId) throw new Error("Clerk did not return a user id.");

    const workspaceId: string = await ctx.runMutation(internal.reviewer.setUpReviewerWorkspace, { userId });
    const site = process.env.SITE_URL ?? "https://app.vistrial.io";
    return { email, password, signInUrl: `${site.replace(/\/$/, "")}/sign-in`, workspaceId, created };
  },
});

/** The reviewer's workspace: Strategist on, setup done, and a confirmed London business profile. */
export const setUpReviewerWorkspace = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("active"), true))
      .first();
    const workspaceId =
      member?.workspaceId ??
      (await createWorkspaceFor(ctx, {
        userId: args.userId,
        displayName: "Meta Reviewer",
        name: "Vistrial Review Workspace",
        timezone: "Europe/London",
        defaultCountry: "GB",
      }));

    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    if (settings && !settings.setupDone) await ctx.db.patch(settings._id, { setupDone: true });

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", GROWTH_ARCHITECT))
      .unique();
    if (agent) {
      const link = await ctx.db
        .query("workspaceAgents")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
        .unique();
      if (link && link.state !== "on") await ctx.db.patch(link._id, { state: "on", updatedAt: Date.now(), updatedBy: args.userId });
      if (!link) await ctx.db.insert("workspaceAgents", { workspaceId, agentId: agent._id, state: "on", updatedAt: Date.now(), updatedBy: args.userId });
    }

    const versions = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId))
      .take(50);
    if (!versions.some((row) => row.status === "confirmed")) {
      await ctx.db.insert("profileVersions", {
        workspaceId,
        version: versions.reduce((max, row) => Math.max(max, row.version), 0) + 1,
        offer: "Domestic and end-of-tenancy cleaning in London, at fixed prices",
        priceNotes: "From £95 for a standard clean; end-of-tenancy priced by bedrooms",
        audience: "Busy professionals and renters in London",
        geography: "London, UK",
        channels: "Website, Instagram and Meta ads",
        brandVoice: "Friendly, plain and reliable",
        competitors: [],
        confirmedBy: args.userId,
        confirmedAt: Date.now(),
        status: "confirmed",
      });
    }

    await writeAudit(ctx, { workspaceId, actorType: "system", actorId: "reviewer", action: "reviewer.account_ready", subject: args.userId });
    return workspaceId;
  },
});
