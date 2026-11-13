/**
 * The model switch: which models a person can choose between for a piece of work, and which one it starts
 * on. The server decides what is offered; a screen only shows it. See docs/rebuild/models-and-openrouter.md.
 */
import { v } from "convex/values";

import { workspaceQuery } from "./lib/builders";
import { capScale } from "./lib/caps";
import { modelGate, platformRoute, rememberedModel, skillNeeds } from "./lib/modelChoice";
import { COST_HINT_WORDS, FAMILY_NAME, MODELS, MODEL_NAMES, cannotRun, costHint } from "./lib/models";
import { PRICES } from "./lib/modelRouter";
import { OPENROUTER_FEE } from "./lib/openrouter";
import { canWork } from "./lib/roles";

const priced = (model: string | undefined, provider: string | undefined) => {
  const price = model ? PRICES[model] : undefined;
  return price ? { input: price.input, output: price.output, fee: provider === "openrouter" ? 1 + OPENROUTER_FEE : 1 } : undefined;
};

/**
 * The models for the picker: only the ones that can run this work here. A model whose family is not
 * switched on, or that cannot do what the skill needs (search the web, read a page), is left out. Each says
 * how its list price compares with the platform's own model. `skillSlug` missing means work that needs only
 * text (a chat that has not chosen a skill).
 *
 * `current` is what the work starts on if the person picks nothing: the model they last chose for this kind
 * of work, else the platform's own.
 */
export const options = workspaceQuery({
  args: { skillSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const gate = modelGate();
    const needs = args.skillSlug ? skillNeeds(args.skillSlug) : {};
    const base = await platformRoute(ctx, "research");
    const basePrice = priced(base?.model, base?.provider);
    const models = MODELS.filter((row) => !cannotRun(row.family, needs, gate)).map((row) => {
      const hint = base?.model === row.id ? null : costHint(priced(row.id, row.provider), basePrice);
      return {
        id: row.id,
        family: row.family,
        familyName: FAMILY_NAME[row.family],
        name: row.name,
        cost: hint ? COST_HINT_WORDS[hint] : null,
        /** The lighter model Fast work runs on, when it is not this one. */
        fastName: row.light === row.id ? null : (MODEL_NAMES[row.light] ?? null),
        /** How far a run's credit limit is raised on this model, Thorough and Fast. 1 for most. */
        capScale: capScale(PRICES[row.id]),
        fastCapScale: capScale(PRICES[row.light]),
      };
    });
    const remembered = await rememberedModel(ctx, ctx.workspaceId, ctx.identity.subject, needs);
    const platform = base && models.some((row) => row.id === base.model) ? base.model : null;
    return {
      models,
      /** Null when the platform's route is on a model that is not in the list (a test deployment). */
      current: remembered ?? platform,
      canChoose: canWork(ctx.member.role),
    };
  },
});
