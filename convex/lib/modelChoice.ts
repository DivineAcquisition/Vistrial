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
import type { QueryCtx } from "../_generated/server";
import { userError } from "./errors";
import { CANNOT_RUN_WORDS, cannotRun, parseChoice, routesFor, type CannotRun, type Family, type Gate, type Needs } from "./models";
import type { ModelRoute } from "./modelRouter";
import { openRouterKey, openRouterWebSearchOn } from "./openrouter";
import { devSkillsEnabled, type WorkKind } from "./registry";

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
