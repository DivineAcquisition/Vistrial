/**
 * Which model route a piece of work runs on. One place, so every caller answers the same way:
 *
 * 1. No family chosen: the platform's route for that kind of work (`modelRoutes`), as always.
 * 2. A family the platform's route already belongs to: that same route.
 * 3. Another family: that family's route (lib/models.ts), if it can run the work here.
 * 4. A family that cannot run the work here: the platform's route, and the answer says why. Nothing is
 *    swapped silently: the model that runs is recorded on the step, and a person choosing by hand is refused
 *    before this point (`assertCanRun`).
 *
 * Where no route is set, the fake model stands in only where dev skills are on. Production gets null and
 * the work fails with `no_route` instead of guessing.
 */
import type { QueryCtx } from "../_generated/server";
import { userError } from "./errors";
import { CANNOT_RUN_WORDS, FAMILY_NAME, FAMILY_ROUTES, cannotRun, familyOf, type CannotRun, type Family, type Gate, type Needs } from "./models";
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
  /** The family asked for that could not run this work here, and why. The platform's route runs instead. */
  setAside?: { family: Family; reason: CannotRun };
};

export async function resolveRoute(ctx: Pick<QueryCtx, "db">, workKind: WorkKind, choice?: Family | null, needs: Needs = {}): Promise<Resolved> {
  const base = await platformRoute(ctx, workKind);
  if (!choice) return { route: base };
  if (base && familyOf(base.model) === choice) return { route: base };
  const reason = cannotRun(choice, needs, modelGate());
  if (reason) return { route: base, setAside: { family: choice, reason } };
  return { route: FAMILY_ROUTES[choice][workKind] };
}

/** Refuses a family a person chose by hand that cannot run this work here, in words they can act on. */
export function assertCanRun(choice: Family | null | undefined, needs: Needs) {
  if (!choice) return;
  const reason = cannotRun(choice, needs, modelGate());
  if (reason) throw userError(`${FAMILY_NAME[choice]} cannot run this: ${CANNOT_RUN_WORDS[reason].toLowerCase()}. Choose another model.`);
}
