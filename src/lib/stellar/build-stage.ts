import type { PlacementBuildStage } from "@/types/database";

/**
 * The five plain-language build stages (Prompt S1 Part 3). Defined once,
 * used everywhere the client portal or DA console shows a stage. This is
 * display vocabulary only — it is not the DA-internal-tool mapping, which
 * lives in `stellar_build_stage_mappings` as configuration (see the
 * migration header for why that table is still empty).
 */
export const BUILD_STAGE_ORDER: PlacementBuildStage[] = [
  "getting_set_up",
  "building_system",
  "testing",
  "live",
  "running_smoothly",
];

export const BUILD_STAGE_LABELS: Record<PlacementBuildStage, string> = {
  getting_set_up: "Getting set up",
  building_system: "Building your system",
  testing: "Testing",
  live: "Live",
  running_smoothly: "Running smoothly",
};

export function buildStageLabel(stage: PlacementBuildStage): string {
  return BUILD_STAGE_LABELS[stage];
}

export function buildStageIndex(stage: PlacementBuildStage): number {
  return BUILD_STAGE_ORDER.indexOf(stage);
}

export const AGREEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  void: "Void",
};
