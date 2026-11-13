/**
 * The models a person can choose between, by family, and what each family can run. Pure, so the server
 * decides and a screen can show the same thing. Model ids, names and the reasons for each choice are in
 * docs/rebuild/models-and-openrouter.md, section 1; they were read from OpenRouter's models endpoint on
 * 2026-11-13. Prices live beside the Claude ones in modelRouter.ts (`PRICES`).
 */
import type { ModelRoute } from "./modelRouter";
import type { WorkKind } from "./registry";

export const FAMILIES = ["claude", "gpt", "gemini"] as const;
export type Family = (typeof FAMILIES)[number];

export function isFamily(value: unknown): value is Family {
  return (FAMILIES as readonly unknown[]).includes(value);
}

export const FAMILY_NAME: Record<Family, string> = { claude: "Claude", gpt: "GPT", gemini: "Gemini" };

/** A model's plain name. A model missing here has no name to show, so a screen shows nothing rather than an id. */
export const MODEL_NAMES: Record<string, string> = {
  "claude-fable-5-1": "Claude Fable 5.1",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "openai/gpt-6.1-sol": "GPT-6.1 Sol",
  "openai/gpt-6.1-terra": "GPT-6.1 Terra",
  "google/gemini-4-carbon": "Gemini 4 Carbon",
  "google/gemini-4-hydrogen": "Gemini 4 Hydrogen",
};

/** The family a model belongs to, read from its id. Null for a model of no known family (the fake one, an unknown id). */
export function familyOf(model: string): Family | null {
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) return "claude";
  if (model.startsWith("openai/")) return "gpt";
  if (model.startsWith("google/") || model.startsWith("gemini-")) return "gemini";
  return null;
}

const pair = (provider: string, thorough: string, fast: string): Record<WorkKind, ModelRoute> => {
  const strong = { provider, model: thorough, fallbackProvider: provider, fallbackModel: fast };
  const light = { provider, model: fast, fallbackProvider: provider, fallbackModel: thorough };
  return { research: strong, write: strong, classify: light, summarize: light };
};

/**
 * Each family's route per kind of work: the stronger model for research and writing, the lighter one for
 * sorting and summarizing, each falling back to the other. A fallback never leaves the family, so a person
 * who chose GPT is never silently given Claude. Claude is Anthropic, direct: the launch routes.
 */
export const FAMILY_ROUTES: Record<Family, Record<WorkKind, ModelRoute>> = {
  claude: pair("claude", "claude-opus-5-5", "claude-sonnet-5-5"),
  gpt: pair("openrouter", "openai/gpt-6.1-sol", "openai/gpt-6.1-terra"),
  gemini: pair("openrouter", "google/gemini-4-carbon", "google/gemini-4-hydrogen"),
};

/** What a piece of work asks of a model beyond text and structured output. */
export type Needs = { webSearch?: boolean; webFetch?: boolean };

/** What this deployment has switched on. Read from the environment by `modelGate()` in modelChoice.ts. */
export type Gate = {
  /** OPENROUTER_API_KEY is set. */
  openRouter: boolean;
  /** Families named in MODEL_FAMILIES: the owner's switch for offering them at all. */
  families: readonly string[];
  /** OPENROUTER_WEB_SEARCH=on: a real call has shown web search results come back. */
  webSearch: boolean;
};

export type CannotRun = "not_switched_on" | "no_web_search" | "no_web_fetch";

/**
 * Why a family cannot run a piece of work here, or null when it can. Claude is the platform's own routes and
 * is never gated here. The others go through OpenRouter: they need its key and the owner's switch, cannot
 * read a web page themselves, and search the web only once that has been proven.
 */
export function cannotRun(family: Family, needs: Needs, gate: Gate): CannotRun | null {
  if (family === "claude") return null;
  if (!gate.openRouter || !gate.families.includes(family)) return "not_switched_on";
  if (needs.webFetch) return "no_web_fetch";
  if (needs.webSearch && !gate.webSearch) return "no_web_search";
  return null;
}

export const CANNOT_RUN_WORDS: Record<CannotRun, string> = {
  not_switched_on: "Not switched on yet",
  no_web_search: "Cannot search the web here yet",
  no_web_fetch: "Cannot read web pages here",
};

/** What a screen shows for a model that ran: its family (for the mark) and its plain name. */
export type ModelMark = { family: Family; name: string };

/**
 * The mark for a stored model. Null when nothing was stored (an older record), or the model has no known
 * family or name (the fake one): the screen then shows nothing rather than a guess.
 */
export function markOf(madeWith: { model: string } | null | undefined): ModelMark | null {
  if (!madeWith) return null;
  const family = familyOf(madeWith.model);
  const name = MODEL_NAMES[madeWith.model];
  return family && name ? { family, name } : null;
}

/** A run step stores its route as "provider/model". The provider never holds a slash; an OpenRouter model id does. */
export function parseModelRoute(modelRoute: string | undefined): { provider: string; model: string } | null {
  if (!modelRoute) return null;
  const cut = modelRoute.indexOf("/");
  return cut > 0 ? { provider: modelRoute.slice(0, cut), model: modelRoute.slice(cut + 1) } : null;
}

export type CostHint = "less" | "more" | "same";

/**
 * How a family's list prices compare with another route's, input and output of both its models. Only said
 * when every price points the same way; mixed prices return null and the screen says nothing. Never a
 * number: models use different amounts of tokens for the same work.
 */
export function costHint(
  prices: Record<string, { input: number; output: number } | undefined>,
  family: Record<WorkKind, ModelRoute>,
  base: Record<"research" | "classify", { model: string } | null>,
): CostHint | null {
  const pairs: [number, number][] = [];
  for (const kind of ["research", "classify"] as const) {
    const mine = prices[family[kind].model];
    const theirs = base[kind] ? prices[base[kind].model] : undefined;
    if (!mine || !theirs) return null;
    pairs.push([mine.input, theirs.input], [mine.output, theirs.output]);
  }
  if (pairs.every(([a, b]) => a === b)) return "same";
  if (pairs.every(([a, b]) => a <= b)) return "less";
  if (pairs.every(([a, b]) => a >= b)) return "more";
  return null;
}

export const COST_HINT_WORDS: Record<CostHint, string> = { less: "Usually costs less", more: "Usually costs more", same: "About the same cost" };
