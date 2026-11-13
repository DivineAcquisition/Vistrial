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
export type ModelSpec = { id: string; family: Family; name: string; provider: "claude" | "openrouter"; light: string; fallback: string };

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
  model("claude", "claude-haiku-5-5", "Claude Haiku 5.5", "claude-haiku-5-5", "claude-sonnet-5-5"),
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
