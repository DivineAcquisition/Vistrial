export const AREAS = ["sales", "retention", "operations"] as const;

export type Area = (typeof AREAS)[number];

export type SkillStatus = "available" | "comingSoon";

export type CatalogSkill = {
  key: string;
  name: string;
  status: SkillStatus;
  sort: number;
};

export type CatalogAgent = {
  slug: string;
  name: string;
  area: Area;
  job: string;
  promise: string;
  sort: number;
  skills: CatalogSkill[];
};

export const AREA_ROWS: Array<{ key: Area; name: string; sort: number }> = [
  { key: "sales", name: "Sales", sort: 0 },
  { key: "retention", name: "Retention", sort: 1 },
  { key: "operations", name: "Operations", sort: 2 },
];

function skills(names: Array<[string, string]>): CatalogSkill[] {
  return names.map(([key, name], sort) => ({ key, name, status: "comingSoon" as const, sort }));
}

/**
 * Seed rows for the registry. The rail reads the tables, not this list.
 * Every skill starts as comingSoon. A skill flips to available in the step that builds it.
 */
export const CATALOG: CatalogAgent[] = [
  {
    slug: "sales",
    name: "Sales Agent",
    area: "sales",
    job: "Researches what works in your market and hands back ads and content to approve.",
    promise: "The Sales Agent never posts or sends anything. A person approves every asset.",
    sort: 0,
    skills: skills([
      ["ad-research", "Ad research"],
      ["ad-copy", "Ad copy"],
      ["creative", "Creative"],
      ["content-ideation", "Content ideation"],
    ]),
  },
  {
    slug: "retention",
    name: "Retention Agent",
    area: "retention",
    job: "Keeps customers by planning onboarding, spotting risk, and drafting save plays.",
    promise: "The Retention Agent never contacts a customer on its own.",
    sort: 1,
    skills: skills([
      ["onboarding", "Onboarding and activation"],
      ["health", "Health and risk"],
      ["save-plays", "Save and win-back plays"],
      ["expansion", "Expansion and referrals"],
      ["retention-design", "Retention design"],
    ]),
  },
  {
    slug: "operations",
    name: "Operations Agent",
    area: "operations",
    job: "Keeps the work moving with briefings, reports, and follow-through.",
    promise: "The Operations Agent never changes your data without a person approving it.",
    sort: 2,
    skills: skills([
      ["briefings", "Approvals and briefings"],
      ["reporting", "Reporting"],
      ["tasks", "Tasks and follow-through"],
      ["data-cleanup", "Integrations and data cleanup"],
    ]),
  },
];
