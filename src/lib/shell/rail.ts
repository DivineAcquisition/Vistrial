import { AREAS, AREA_LABEL, CATALOG, type Area, type CatalogAgent } from "../../../convex/catalog";

export type { CatalogAgent, Area };
export { CATALOG, AREAS, AREA_LABEL };

export type RailSkill = { slug: string; name: string; handsBack: string; sort: number };

export type RailAgent = {
  slug: string;
  name: string;
  area: Area | null;
  job: string;
  promise: string;
  sort: number;
  skills?: RailSkill[];
  state?: "off" | "suggesting" | "on";
};

export type RailGroup = {
  area: Area | "other";
  label: string;
  agents: RailAgent[];
};

export type RailModel = {
  areas: RailGroup[];
};

/** Areas first, then the agents in each area. A row with no area is listed under Other. */
export function railFromCatalog(agents: RailAgent[]): RailModel {
  const areas: RailGroup[] = AREAS.map((area) => ({
    area,
    label: AREA_LABEL[area],
    agents: agents
      .filter((agent) => agent.area === area)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  })).filter((group) => group.agents.length > 0);

  const other = agents
    .filter((agent) => agent.area !== "sales" && agent.area !== "retention" && agent.area !== "operations")
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  if (other.length > 0) areas.push({ area: "other", label: "Other", agents: other });
  return { areas };
}

export function railAgentSlugs(model: RailModel): string[] {
  return model.areas.flatMap((group) => group.agents.map((agent) => agent.slug));
}
