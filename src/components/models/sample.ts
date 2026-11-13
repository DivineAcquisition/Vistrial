import type { ModelMarkData } from "@/components/models/model-mark";
import type { ModelOption } from "@/components/models/model-switch";

/**
 * Sample data for the dev stories only: what the model switch shows on a deployment where OpenRouter is set
 * up and GPT and Gemini are switched on. Nothing in the product reads this.
 */
export const SAMPLE_MODELS: ModelOption[] = [
  { family: "claude", label: "Claude", thorough: "Claude Opus 5.5", fast: "Claude Sonnet 5.5", off: null, cost: null },
  { family: "gpt", label: "GPT", thorough: "GPT-6.1 Sol", fast: "GPT-6.1 Terra", off: null, cost: "Usually costs less" },
  { family: "gemini", label: "Gemini", thorough: "Gemini 4 Carbon", fast: "Gemini 4 Hydrogen", off: null, cost: "Usually costs less" },
];

/** The same switch for work that searches the web, before web search through OpenRouter has been proven. */
export const SAMPLE_MODELS_RESEARCH: ModelOption[] = SAMPLE_MODELS.map((row) => (row.family === "claude" ? row : { ...row, off: "Cannot search the web here yet" }));

/** The switch on a deployment with no OpenRouter key: today's production. */
export const SAMPLE_MODELS_OFF: ModelOption[] = SAMPLE_MODELS.map((row) => (row.family === "claude" ? row : { ...row, off: "Not switched on yet", cost: null }));

export const SAMPLE_MARKS: Record<"opus" | "sonnet" | "sol" | "terra" | "carbon", ModelMarkData> = {
  opus: { family: "claude", name: "Claude Opus 5.5" },
  sonnet: { family: "claude", name: "Claude Sonnet 5.5" },
  sol: { family: "gpt", name: "GPT-6.1 Sol" },
  terra: { family: "gpt", name: "GPT-6.1 Terra" },
  carbon: { family: "gemini", name: "Gemini 4 Carbon" },
};
