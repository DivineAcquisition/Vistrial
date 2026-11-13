import type { ModelFamily, ModelMarkData } from "@/components/models/model-mark";
import type { ModelOption } from "@/components/models/model-switch";

const option = (family: ModelFamily, familyName: string, id: string, name: string, cost: string | null, fastName: string | null, capScale = 1): ModelOption => ({
  id,
  family,
  familyName,
  name,
  cost,
  fastName,
  capScale,
  fastCapScale: 1,
});

/**
 * Sample data for the dev stories only: what the model switch shows on a deployment where OpenRouter is set
 * up and GPT and Gemini are switched on, with Claude Opus 5.5 as the platform's own model. Nothing in the
 * product reads this.
 */
export const SAMPLE_MODELS: ModelOption[] = [
  option("claude", "Claude", "claude-opus-5-5", "Claude Opus 5.5", null, "Claude Sonnet 5.5"),
  option("claude", "Claude", "claude-sonnet-5-5", "Claude Sonnet 5.5", "Usually costs less", null),
  option("claude", "Claude", "claude-haiku-5-5", "Claude Haiku 5.5", "Usually costs less", null),
  option("gpt", "GPT", "openai/gpt-6-astra", "GPT-6 Astra", "Usually costs more", "GPT-6.1 Terra", 2.5),
  option("gpt", "GPT", "openai/gpt-6.1-sol", "GPT-6.1 Sol", "Usually costs less", "GPT-6.1 Terra"),
  option("gpt", "GPT", "openai/gpt-6.1-terra", "GPT-6.1 Terra", "Usually costs less", "GPT-6 Luna"),
  option("gpt", "GPT", "openai/gpt-6-luna", "GPT-6 Luna", "Usually costs less", null),
  option("gemini", "Gemini", "google/gemini-4-argon", "Gemini 4 Argon", "Usually costs less", "Gemini 4 Hydrogen"),
  option("gemini", "Gemini", "google/gemini-4-carbon", "Gemini 4 Carbon", "Usually costs less", "Gemini 4 Hydrogen"),
  option("gemini", "Gemini", "google/gemini-4-hydrogen", "Gemini 4 Hydrogen", "Usually costs less", "Gemini 3.8 Flash"),
  option("gemini", "Gemini", "google/gemini-3.8-flash", "Gemini 3.8 Flash", "Usually costs less", null),
];

/** The switch for work that searches the web before web search through OpenRouter has been proven, and on a deployment with no OpenRouter key (today's production): Claude only. */
export const SAMPLE_MODELS_CLAUDE: ModelOption[] = SAMPLE_MODELS.filter((row) => row.family === "claude");

export const SAMPLE_MARKS: Record<"opus" | "sonnet" | "sol" | "terra" | "carbon", ModelMarkData> = {
  opus: { family: "claude", name: "Claude Opus 5.5" },
  sonnet: { family: "claude", name: "Claude Sonnet 5.5" },
  sol: { family: "gpt", name: "GPT-6.1 Sol" },
  terra: { family: "gpt", name: "GPT-6.1 Terra" },
  carbon: { family: "gemini", name: "Gemini 4 Carbon" },
};
