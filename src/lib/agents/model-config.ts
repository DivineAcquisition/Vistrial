import type { ModelRoute, ModelTier, WorkKind } from "@/lib/agents/types";

/**
 * Configuration — not application logic.
 *
 * Confirmed against Anthropic's current model IDs (August 2026):
 * Opus 5, Sonnet 5, Haiku 4.5. Fable 5 is the creative-tier model and is
 * forbidden for this product.
 *
 * Changing a route is a row in `agent_model_routes` (or an env override),
 * not a deploy. Application code asks the router for a work kind.
 */
export const MODEL_TIER_ENV: Record<ModelTier, string> = {
  opus: "AGENT_MODEL_OPUS",
  sonnet: "AGENT_MODEL_SONNET",
  haiku: "AGENT_MODEL_HAIKU",
};

export const DEFAULT_MODEL_BY_TIER: Record<ModelTier, string> = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5-20251001",
};

/** The creative-tier model. Drafts must sound like a specific owner, not like prose. */
export const FORBIDDEN_MODEL_IDS = ["claude-fable-5"] as const;

export const DEFAULT_ROUTES: readonly ModelRoute[] = [
  { workKind: "playbook", tier: "opus", modelId: DEFAULT_MODEL_BY_TIER.opus, escalateToTier: null, useBatchWhenAsync: true },
  { workKind: "follow_up_draft", tier: "opus", modelId: DEFAULT_MODEL_BY_TIER.opus, escalateToTier: null, useBatchWhenAsync: true },
  { workKind: "extraction", tier: "sonnet", modelId: DEFAULT_MODEL_BY_TIER.sonnet, escalateToTier: null, useBatchWhenAsync: true },
  { workKind: "verification", tier: "sonnet", modelId: DEFAULT_MODEL_BY_TIER.sonnet, escalateToTier: null, useBatchWhenAsync: true },
  {
    workKind: "agent_planning",
    tier: "sonnet",
    modelId: DEFAULT_MODEL_BY_TIER.sonnet,
    escalateToTier: "opus",
    useBatchWhenAsync: true,
  },
  { workKind: "summarize", tier: "sonnet", modelId: DEFAULT_MODEL_BY_TIER.sonnet, escalateToTier: null, useBatchWhenAsync: true },
  { workKind: "classify", tier: "haiku", modelId: DEFAULT_MODEL_BY_TIER.haiku, escalateToTier: null, useBatchWhenAsync: true },
] as const;

export function configuredModelId(tier: ModelTier, stored?: string | null): string {
  const fromEnv = process.env[MODEL_TIER_ENV[tier]]?.trim();
  const id = (stored?.trim() || fromEnv || DEFAULT_MODEL_BY_TIER[tier]).trim();
  assertModelAllowed(id);
  return id;
}

export function assertModelAllowed(modelId: string): void {
  const lower = modelId.toLowerCase();
  if (FORBIDDEN_MODEL_IDS.some((id) => lower === id || lower.includes("fable"))) {
    throw new Error("The creative-tier model is not used in this product.");
  }
  if (lower.includes("creative")) {
    throw new Error("The creative-tier model is not used in this product.");
  }
}

export function defaultRoute(workKind: WorkKind): ModelRoute {
  const route = DEFAULT_ROUTES.find((row) => row.workKind === workKind);
  if (!route) throw new Error(`No model route for ${workKind}.`);
  return {
    ...route,
    modelId: configuredModelId(route.tier, route.modelId),
  };
}
