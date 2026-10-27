import { AREAS, AREA_LABEL, CATALOG, type Area, type CatalogAgent } from "../../../convex/catalog";

export type { CatalogAgent, Area };
export { CATALOG, AREAS, AREA_LABEL };

export type RailSkill = {
  slug: string;
  name: string;
  handsBack: string;
  promise?: string;
  status?: "available" | "comingSoon";
  sort: number;
};

export type RailArea = { slug: string; name: string; sort: number };

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

/** Areas first, then the agents in each area. Pass area rows from the table so the labels are live. */
export function railFromCatalog(agents: RailAgent[], areaRows?: RailArea[]): RailModel {
  const ordered = areaRows
    ? [...areaRows].sort((a, b) => a.sort - b.sort)
    : AREAS.map((slug, sort) => ({ slug, name: AREA_LABEL[slug], sort }));
  const known = new Set(ordered.map((area) => area.slug));
  const areas: RailGroup[] = ordered
    .map((area) => ({
      area: (known.has(area.slug) ? area.slug : "other") as RailGroup["area"],
      label: area.name,
      agents: agents
        .filter((agent) => agent.area === area.slug)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.agents.length > 0);

  const other = agents
    .filter((agent) => !agent.area || !known.has(agent.area))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  if (other.length > 0) areas.push({ area: "other", label: "Other", agents: other });
  return { areas };
}

export function railAgentSlugs(model: RailModel): string[] {
  return model.areas.flatMap((group) => group.agents.map((agent) => agent.slug));
}
