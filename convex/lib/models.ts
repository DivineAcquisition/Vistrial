/**
 * The models a person can choose between, and what each can run. Pure, so the server decides and a screen
 * can show the same thing. Model ids and names were read from Anthropic's models page and OpenRouter's
 * models endpoint on 2026-11-13. Prices live in modelRouter.ts (`PRICES`).
 */
import type { ModelRoute } from "./modelRouter";
import type { WorkKind } from "./registry";

export const FAMILIES = ["claude", "gpt", "gemini"] as const;
export type Family = (typeof FAMILIES)[number];

export function isFamily(value: unknown): value is Family {
  return (FAMILIES as readonly unknown[]).includes(value);
}

export const FAMILY_NAME: Record<Family, string> = { claude: "Claude", gpt: "GPT", gemini: "Gemini" };

/**
 * One model a person can choose.
 * - `provider`: where it runs. Claude runs at Anthropic, direct; the others through OpenRouter.
 * - `light`: the model that does the sorting and summarizing around it, so a short step does not pay the
 *   chosen model's price.
 * - `fallback`: the model tried when the chosen one fails. Always in the same family, so a person who chose
 *   GPT is never silently given Claude.
 */
export type ModelSpec = {
  id: string;
  family: Family;
  name: string;
  provider: "claude" | "openrouter";
  light: string;
  fallback: string;
  /** Not yet proven, by a real call, to search or read the web through the tools the router declares. Offered for such work only once `Gate.haikuWeb` is set. */
  webUnproven?: boolean;
};

const model = (family: Family, id: string, name: string, light: string, fallback: string): ModelSpec => ({
  id,
  family,
  name,
  provider: family === "claude" ? "claude" : "openrouter",
  light,
  fallback,
});

/**
 * Every model offered, strongest first within its family. The list, its prices and what was left out and
 * why are in docs/rebuild/models-and-openrouter.md, section 1. Left out on purpose: previews, deprecated
 * and speciality models, anything that cannot return structured output, and Claude Fable 5.2, which
 * Anthropic only serves with 30 days of retention.
 */
export const MODELS: readonly ModelSpec[] = [
  model("claude", "claude-opus-5-5", "Claude Opus 5.5", "claude-sonnet-5-5", "claude-sonnet-5-5"),
  model("claude", "claude-sonnet-5-5", "Claude Sonnet 5.5", "claude-sonnet-5-5", "claude-opus-5-5"),
  { ...model("claude", "claude-haiku-5-5", "Claude Haiku 5.5", "claude-haiku-5-5", "claude-sonnet-5-5"), webUnproven: true },
  model("gpt", "openai/gpt-6-astra", "GPT-6 Astra", "openai/gpt-6.1-terra", "openai/gpt-6.1-sol"),
  model("gpt", "openai/gpt-6.1-sol", "GPT-6.1 Sol", "openai/gpt-6.1-terra", "openai/gpt-6.1-terra"),
  model("gpt", "openai/gpt-6.1-terra", "GPT-6.1 Terra", "openai/gpt-6-luna", "openai/gpt-6.1-sol"),
  model("gpt", "openai/gpt-6-luna", "GPT-6 Luna", "openai/gpt-6-luna", "openai/gpt-6.1-terra"),
  model("gemini", "google/gemini-4-argon", "Gemini 4 Argon", "google/gemini-4-hydrogen", "google/gemini-4-carbon"),
  model("gemini", "google/gemini-4-carbon", "Gemini 4 Carbon", "google/gemini-4-hydrogen", "google/gemini-4-hydrogen"),
  model("gemini", "google/gemini-4-hydrogen", "Gemini 4 Hydrogen", "google/gemini-3.8-flash", "google/gemini-4-carbon"),
  model("gemini", "google/gemini-3.8-flash", "Gemini 3.8 Flash", "google/gemini-3.8-flash", "google/gemini-4-hydrogen"),
];

export function modelSpec(id: unknown): ModelSpec | null {
  return MODELS.find((row) => row.id === id) ?? null;
}

/** The model a family name alone stands for: an older record stored the family, not the model. */
const FAMILY_DEFAULT: Record<Family, string> = { claude: "claude-opus-5-5", gpt: "openai/gpt-6.1-sol", gemini: "google/gemini-4-carbon" };

/** Reads a stored or sent choice: a model id from the list, or a family name from an older record. Anything else is no choice. */
export function parseChoice(value: unknown): ModelSpec | null {
  return modelSpec(isFamily(value) ? FAMILY_DEFAULT[value] : value);
}

/** A model's plain name. A model missing here has no name to show, so a screen shows nothing rather than an id. */
export const MODEL_NAMES: Record<string, string> = {
  "claude-fable-5-1": "Claude Fable 5.1",
  ...Object.fromEntries(MODELS.map((row) => [row.id, row.name])),
};

/** The family a model belongs to, read from its id. Null for a model of no known family (the fake one, an unknown id). */
export function familyOf(model: string): Family | null {
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) return "claude";
  if (model.startsWith("openai/")) return "gpt";
  if (model.startsWith("google/") || model.startsWith("gemini-")) return "gemini";
  return null;
}

/**
 * A chosen model's route per kind of work: the model itself for research and writing, its lighter companion
 * for sorting and summarizing. Each falls back inside the family.
 */
export function routesFor(spec: ModelSpec): Record<WorkKind, ModelRoute> {
  const provider = spec.provider;
  const strong = { provider, model: spec.id, fallbackProvider: provider, fallbackModel: spec.fallback };
  const light = { provider, model: spec.light, fallbackProvider: provider, fallbackModel: spec.light === spec.id ? spec.fallback : spec.id };
  return { research: strong, write: strong, classify: light, summarize: light };
}

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
  /** CLAUDE_HAIKU_WEB=on: a real call has shown Claude Haiku 5.5 searches and reads the web through the router's tools, and is counted at the right rate. */
  haikuWeb?: boolean;
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

/**
 * Why one model cannot run a piece of work here, or null when it can: its family's reason, and for a model
 * whose web tools are unproven, work that searches or reads the web until that is proven.
 */
export function cannotRunModel(spec: ModelSpec, needs: Needs, gate: Gate): CannotRun | null {
  const family = cannotRun(spec.family, needs, gate);
  if (family) return family;
  if (spec.webUnproven && !gate.haikuWeb) {
    if (needs.webSearch) return "no_web_search";
    if (needs.webFetch) return "no_web_fetch";
  }
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

export type CostHint = "less" | "more";

/**
 * How a model's list price compares with the platform's own model, input and output, each with what it
 * costs to reach (`fee`: 1.055 through OpenRouter, 1 direct). Only said when both prices point the same way
 * and at least one differs; otherwise null and the screen says nothing. Never a number: models use
 * different amounts of tokens for the same work.
 */
export function costHint(mine: { input: number; output: number; fee: number } | undefined, base: { input: number; output: number; fee: number } | undefined): CostHint | null {
  if (!mine || !base) return null;
  const pairs = [
    [mine.input * mine.fee, base.input * base.fee],
    [mine.output * mine.fee, base.output * base.fee],
  ];
  if (pairs.every(([a, b]) => a === b)) return null;
  if (pairs.every(([a, b]) => a <= b)) return "less";
  if (pairs.every(([a, b]) => a >= b)) return "more";
  return null;
}

export const COST_HINT_WORDS: Record<CostHint, string> = { less: "Usually costs less", more: "Usually costs more" };
