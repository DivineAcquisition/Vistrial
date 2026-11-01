import { CATALOG, DEPARTMENTS, DEPARTMENT_LABEL, type CatalogAgent, type Department } from "../../../convex/catalog";

export type { CatalogAgent, Department };
export { CATALOG, DEPARTMENTS, DEPARTMENT_LABEL };

export type RailSkill = {
  slug: string;
  name: string;
  handsBack: string;
  promise?: string;
  status?: "available" | "comingSoon";
  sort: number;
};

export type RailDepartment = { slug: string; name: string; sort: number };

export type RailAgent = {
  slug: string;
  name: string;
  number?: number | null;
  department: string | null;
  /** A planned agent shows in the rail but cannot be turned on or run. */
  status: "live" | "planned";
  lifecycle?: string | null;
  job: string;
  promise: string;
  sort: number;
  skills?: RailSkill[];
  state?: "off" | "suggesting" | "on";
};

export type RailGroup = {
  department: string;
  label: string;
  agents: RailAgent[];
};

export type RailModel = {
  departments: RailGroup[];
};

/** Departments first, then the agents in each. Pass department rows from the table so the labels are live. */
export function railFromCatalog(agents: RailAgent[], departmentRows?: RailDepartment[]): RailModel {
  const ordered = departmentRows
    ? [...departmentRows].sort((a, b) => a.sort - b.sort)
    : DEPARTMENTS.map((slug, sort) => ({ slug, name: DEPARTMENT_LABEL[slug], sort }));
  const known = new Set(ordered.map((row) => row.slug));
  const bySort = (a: RailAgent, b: RailAgent) => a.sort - b.sort || a.name.localeCompare(b.name);
  const departments: RailGroup[] = ordered
    .map((row) => ({
      department: row.slug,
      label: row.name,
      agents: agents.filter((agent) => agent.department === row.slug).sort(bySort),
    }))
    .filter((group) => group.agents.length > 0);

  const other = agents.filter((agent) => !agent.department || !known.has(agent.department)).sort(bySort);
  if (other.length > 0) departments.push({ department: "other", label: "Other", agents: other });
  return { departments };
}

export function railAgentSlugs(model: RailModel): string[] {
  return model.departments.flatMap((group) => group.agents.map((agent) => agent.slug));
}

/** The badge an agent shows in the rail and on its page. */
export function agentStateLabel(agent: Pick<RailAgent, "status" | "state">) {
  if (agent.status === "planned") return "Planned";
  return agent.state === "on" ? "On" : agent.state === "suggesting" ? "Suggesting" : "Off";
}
