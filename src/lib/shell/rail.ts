import { CATALOG, STAGES, type CatalogAgent, type Stage } from "../../../convex/catalog";

export type { CatalogAgent, Stage };
export { CATALOG, STAGES };

const STAGE_LABEL: Record<Stage, string> = {
  foundation: "Foundation",
  organization: "Organization",
  execution: "Execution",
};

export type RailGroup = {
  stage: Stage;
  label: string;
  agents: CatalogAgent[];
};

export type RailModel = {
  compass: CatalogAgent | null;
  stages: RailGroup[];
};

/** Compass is pinned once. Every other agent appears in its stage, from the rows passed in. */
export function railFromCatalog(agents: CatalogAgent[]): RailModel {
  const compass = agents.find((agent) => agent.slug === "compass") ?? null;
  const stages = STAGES.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage],
    agents: agents
      .filter((agent) => agent.stage === stage && agent.slug !== "compass")
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  })).filter((group) => group.agents.length > 0);
  return { compass, stages };
}

export function railAgentSlugs(model: RailModel): string[] {
  const slugs = model.compass ? [model.compass.slug] : [];
  for (const group of model.stages) slugs.push(...group.agents.map((agent) => agent.slug));
  return slugs;
}
