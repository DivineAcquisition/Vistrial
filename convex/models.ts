/**
 * The model switch: what a person can choose between, and the organization's default. The server decides
 * what is offered; a screen only shows it. See docs/rebuild/models-and-openrouter.md.
 */
import { v } from "convex/values";

import { adminMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { userError } from "./lib/errors";
import { modelGate, orgDefaultModel, platformRoute, skillNeeds } from "./lib/modelChoice";
import { CANNOT_RUN_WORDS, COST_HINT_WORDS, FAMILIES, FAMILY_NAME, FAMILY_ROUTES, MODEL_NAMES, cannotRun, costHint, familyOf, isFamily, type Family } from "./lib/models";
import { PRICES } from "./lib/modelRouter";
import { isAdmin, canWork } from "./lib/roles";

/**
 * The families for the picker. Each says the model it would use for Thorough and for Fast work, how its
 * list prices compare with the platform's own route, and, for the skill named, whether it can run it here
 * and why not. `skillSlug` missing means work that needs only text (a chat that has not chosen a skill).
 */
export const options = workspaceQuery({
  args: { skillSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const gate = modelGate();
    const needs = args.skillSlug ? skillNeeds(args.skillSlug) : {};
    const base = { research: await platformRoute(ctx, "research"), classify: await platformRoute(ctx, "classify") };
    const platformFamily = base.research ? familyOf(base.research.model) : null;
    const families = FAMILIES.map((family) => {
      // The family the platform's own routes belong to is those routes, whatever a Platform Admin set them to.
      const own = family === platformFamily && base.research && base.classify;
      const thorough = own ? base.research!.model : FAMILY_ROUTES[family].research.model;
      const fast = own ? base.classify!.model : FAMILY_ROUTES[family].classify.model;
      const off = own ? null : cannotRun(family, needs, gate);
      const hint = own ? null : costHint(PRICES, FAMILY_ROUTES[family], base);
      return {
        family,
        label: FAMILY_NAME[family],
        thorough: MODEL_NAMES[thorough] ?? FAMILY_NAME[family],
        fast: MODEL_NAMES[fast] ?? FAMILY_NAME[family],
        /** Null when it can run this work here; otherwise the words to show beside it, greyed. */
        off: off ? CANNOT_RUN_WORDS[off] : null,
        cost: hint ? COST_HINT_WORDS[hint] : null,
      };
    });
    const orgDefault = await orgDefaultModel(ctx, ctx.workspaceId);
    // What runs when nobody picks: the organization's default if it can run this work, else the platform's route.
    const usable = (family: Family | null) => (family && !families.find((row) => row.family === family)?.off ? family : null);
    return {
      families,
      /** The family work starts on when nobody picks. Null when the platform's route is of no known family (a test deployment). */
      current: usable(orgDefault) ?? platformFamily,
      orgDefault,
      canChoose: canWork(ctx.member.role),
      canSetDefault: isAdmin(ctx.member.role),
    };
  },
});

/** The family this organization's work starts on unless a person picks another. Owners and Admins. */
export const setDefault = adminMutation({
  args: { model: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    if (args.model !== null && !isFamily(args.model)) throw userError("That model is not one you can choose.");
    if (args.model !== null) {
      const off = cannotRun(args.model, {}, modelGate());
      if (off) throw userError(`${FAMILY_NAME[args.model]} cannot be the default here: ${CANNOT_RUN_WORDS[off].toLowerCase()}.`);
    }
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (!settings) throw userError("Finish setting up this organization first.");
    await ctx.db.patch(settings._id, { defaultModel: args.model ?? undefined });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "settings.default_model_updated", subject: settings._id });
    return null;
  },
});
