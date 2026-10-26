import { AREAS, AREA_ROWS, CATALOG, type Area, type CatalogAgent, type CatalogSkill } from "../../../convex/catalog";

export type { Area, CatalogAgent, CatalogSkill };
export { AREAS, CATALOG };

const AREA_LABEL: Record<Area, string> = Object.fromEntries(AREA_ROWS.map((row) => [row.key, row.name])) as Record<
  Area,
  string
>;

export type RailGroup = {
  area: Area;
  label: string;
  agents: CatalogAgent[];
};

export type RailModel = {
  areas: RailGroup[];
};

/** Areas in order, each with its agents, from the rows passed in. */
export function railFromCatalog(agents: CatalogAgent[]): RailModel {
  const areas = AREAS.map((area) => ({
    area,
    label: AREA_LABEL[area],
    agents: agents
      .filter((agent) => agent.area === area)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  })).filter((group) => group.agents.length > 0);
  return { areas };
}

export function railAgentSlugs(model: RailModel): string[] {
  return model.areas.flatMap((group) => group.agents.map((agent) => agent.slug));
}
