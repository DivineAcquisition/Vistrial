/**
 * Which model route a piece of work runs on. One place, so every caller answers the same way:
 *
 * 1. No model chosen: the platform's route for that kind of work (`modelRoutes`), as always.
 * 2. The model the platform's route already uses: that same route.
 * 3. Another model: that model's route (lib/models.ts), if its family can run the work here.
 * 4. A model that cannot run the work here: the platform's route, and the answer says why. Nothing is
 *    swapped silently: the model that runs is recorded on the step, and a person choosing by hand is refused
 *    before this point (`assertCanRun`).
 *
 * Where no route is set, the fake model stands in only where dev skills are on. Production gets null and
 * the work fails with `no_route` instead of guessing.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { userError } from "./errors";
import { CANNOT_RUN_WORDS, cannotRun, parseChoice, routesFor, type CannotRun, type Family, type Gate, type Needs } from "./models";
import type { ModelRoute } from "./modelRouter";
import { openRouterKey, openRouterWebSearchOn } from "./openrouter";
import { devSkillsEnabled, type WorkKind } from "./registry";
import { skillFor } from "./skills";

const FAKE_ROUTE: ModelRoute = { provider: "fake", model: "fake-writer", fallbackProvider: "fake", fallbackModel: "fake-writer" };

/** What this deployment has switched on, from its environment variables. */
export function modelGate(): Gate {
  const families = (process.env.MODEL_FAMILIES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return { openRouter: Boolean(openRouterKey()), families, webSearch: openRouterWebSearchOn() };
}

/** The platform's route for a kind of work: the row a Platform Admin set, else the fake model where dev skills are on, else none. */
export async function platformRoute(ctx: Pick<QueryCtx, "db">, workKind: WorkKind | string): Promise<ModelRoute | null> {
  const row = await ctx.db
    .query("modelRoutes")
    .withIndex("by_workKind", (q) => q.eq("workKind", workKind))
    .unique();
  if (row) return { provider: row.provider, model: row.model, fallbackProvider: row.fallbackProvider, fallbackModel: row.fallbackModel };
  return devSkillsEnabled() ? FAKE_ROUTE : null;
}

export type Resolved = {
  route: ModelRoute | null;
  /** The model asked for that could not run this work here, and why. The platform's route runs instead. */
  setAside?: { model: string; family: Family; reason: CannotRun };
};

/** `choice` is a model id (or, from an older record, a family name). */
export async function resolveRoute(ctx: Pick<QueryCtx, "db">, workKind: WorkKind, choice?: string | null, needs: Needs = {}): Promise<Resolved> {
  const base = await platformRoute(ctx, workKind);
  const spec = parseChoice(choice);
  if (!spec) return { route: base };
  const mine = routesFor(spec)[workKind];
  if (base && base.provider === mine.provider && base.model === mine.model) return { route: base };
  const reason = cannotRun(spec.family, needs, modelGate());
  if (reason) return { route: base, setAside: { model: spec.id, family: spec.family, reason } };
  return { route: mine };
}

/** Refuses a model a person chose by hand that cannot run this work here, in words they can act on. */
export function assertCanRun(choice: string | null | undefined, needs: Needs) {
  if (!choice) return;
  const spec = parseChoice(choice);
  if (!spec) throw userError("That model is not offered. Choose another model.");
  const reason = cannotRun(spec.family, needs, modelGate());
  if (reason) throw userError(`${spec.name} cannot run this: ${CANNOT_RUN_WORDS[reason].toLowerCase()}. Choose another model.`);
}

/** What a skill asks of a model beyond text, read from the tools it is allowed. */
export function skillNeeds(skillSlug: string): Needs {
  const tools: readonly string[] = skillFor(skillSlug)?.tools ?? [];
  return { webSearch: tools.includes("web.search"), webFetch: tools.includes("web.fetch") };
}

/**
 * A person's last choice is remembered per kind of place, because not every model can do every task: work
 * that only writes ("text"), work that searches the web ("search"), and work that reads web pages ("read").
 * Choosing GPT for writing does not change what their research runs on.
 */
export type ChoiceGroup = "text" | "search" | "read";

export function choiceGroup(needs: Needs): ChoiceGroup {
  if (needs.webFetch) return "read";
  return needs.webSearch ? "search" : "text";
}

type Reader = Pick<QueryCtx, "db">;

function preferences(ctx: Reader, workspaceId: Id<"workspaces">, userId: string) {
  return ctx.db
    .query("memberPreferences")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
}

/**
 * The model this person last chose for this kind of work in this organization, if it can still run it here.
 * Null when they never chose, or the choice can no longer run (a family was switched off): the platform's
 * route then runs, as for anyone who never chose.
 */
export async function rememberedModel(ctx: Reader, workspaceId: Id<"workspaces">, userId: string, needs: Needs): Promise<string | null> {
  const row = await preferences(ctx, workspaceId, userId);
  const spec = parseChoice(row?.models?.[choiceGroup(needs)]);
  return spec && !cannotRun(spec.family, needs, modelGate()) ? spec.id : null;
}

async function remember(ctx: Pick<MutationCtx, "db">, workspaceId: Id<"workspaces">, userId: string, needs: Needs, model: string) {
  const row = await preferences(ctx, workspaceId, userId);
  const group = choiceGroup(needs);
  if (row?.models?.[group] === model) return;
  const models = { ...row?.models, [group]: model };
  if (row) await ctx.db.patch(row._id, { models, updatedAt: Date.now() });
  else await ctx.db.insert("memberPreferences", { workspaceId, userId, models, updatedAt: Date.now() });
}

/**
 * The model a new piece of work is stored with.
 * - A model the person picked by hand must be able to run the work, or it is refused here, before anything
 *   starts. It is remembered as their choice for this kind of work.
 * - Without a pick it is the model they last chose for this kind of work, if it can run it.
 * - Otherwise nothing is stored and the platform's route runs. Work nobody starts by hand passes no
 *   `userId` and always lands here.
 */
export async function choiceFor(
  ctx: Pick<MutationCtx, "db">,
  input: { workspaceId: Id<"workspaces">; userId?: string; picked: string | null | undefined; needs: Needs },
): Promise<string | undefined> {
  if (input.picked !== undefined && input.picked !== null) {
    const spec = parseChoice(input.picked);
    if (!spec) throw userError("That model is not one you can choose.");
    assertCanRun(spec.id, input.needs);
    if (input.userId) await remember(ctx, input.workspaceId, input.userId, input.needs, spec.id);
    return spec.id;
  }
  if (!input.userId) return undefined;
  return (await rememberedModel(ctx, input.workspaceId, input.userId, input.needs)) ?? undefined;
}
