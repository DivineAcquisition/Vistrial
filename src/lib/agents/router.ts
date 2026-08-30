import { defaultRoute, configuredModelId, assertModelAllowed } from "@/lib/agents/model-config";
import type { AgentMode, ModelRoute, ModelTier, ResolvedModel, WorkKind } from "@/lib/agents/types";

export type RouteTable = Partial<Record<WorkKind, ModelRoute>>;

/**
 * Resolve a work kind to a model ID from configuration.
 * Application code never names a model ID.
 */
export function resolveModel(args: {
  workKind: WorkKind;
  mode: AgentMode;
  routes?: RouteTable;
  escalate?: boolean;
}): ResolvedModel {
  const base = args.routes?.[args.workKind] ?? defaultRoute(args.workKind);
  const tier: ModelTier =
    args.escalate && base.escalateToTier ? base.escalateToTier : base.tier;
  const modelId = args.escalate && base.escalateToTier
    ? configuredModelId(base.escalateToTier)
    : configuredModelId(tier, args.escalate ? null : base.modelId);
  assertModelAllowed(modelId);
  const async = args.mode !== "on_demand";
  return {
    workKind: args.workKind,
    tier,
    modelId,
    version: modelId,
    escalateToTier: base.escalateToTier,
    useBatch: async && base.useBatchWhenAsync,
    cachePrompt: true,
  };
}

export function routesFromRows(rows: ModelRoute[]): RouteTable {
  const table: RouteTable = {};
  for (const row of rows) {
    assertModelAllowed(row.modelId);
    table[row.workKind] = row;
  }
  return table;
}
