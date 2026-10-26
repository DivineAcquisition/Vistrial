export const AREAS = ["sales", "retention", "operations"] as const;

export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  sales: "Sales",
  retention: "Retention",
  operations: "Operations",
};

/** Kept so older rows still validate. The rail groups by area. */
export const STAGES = ["foundation", "organization", "execution"] as const;

export type Stage = (typeof STAGES)[number];

export type AgentSkill = {
  slug: string;
  name: string;
  handsBack: string;
  sort: number;
};

export type CatalogAgent = {
  slug: string;
  name: string;
  area: Area;
  stage: Stage;
  job: string;
  promise: string;
  sort: number;
  skills: AgentSkill[];
};

/**
 * Seed rows for the agents table. The rail reads the table, not this list.
 * One agent per area. A skill becomes its own agent only after it needs to.
 */
export const CATALOG: CatalogAgent[] = [
  {
    slug: "sales",
    name: "Sales Agent",
    area: "sales",
    stage: "execution",
    job: "Hands back research, copy, creative briefs, and a content calendar for a person to approve.",
    promise: "The Sales Agent never posts. A person approves every asset before it can be published.",
    sort: 0,
    skills: [
      { slug: "ad-research", name: "Ad research", handsBack: "A research report.", sort: 0 },
      { slug: "ad-copy", name: "Ad copy", handsBack: "Copy sets.", sort: 1 },
      { slug: "creative", name: "Creative", handsBack: "Creative briefs.", sort: 2 },
      { slug: "content", name: "Content ideation", handsBack: "A content calendar.", sort: 3 },
    ],
  },
  {
    slug: "retention",
    name: "Retention Agent",
    area: "retention",
    stage: "organization",
    job: "Will hand back plans, signals, and plays. The skills are named. The work comes after Sales.",
    promise: "The Retention Agent does not run, and it does not contact a customer.",
    sort: 1,
    skills: [
      { slug: "onboarding", name: "Onboarding and activation", handsBack: "An activation plan.", sort: 0 },
      { slug: "health", name: "Health and risk", handsBack: "Risk signals.", sort: 1 },
      { slug: "save", name: "Save and win-back", handsBack: "Save plays.", sort: 2 },
      { slug: "expansion", name: "Expansion and referrals", handsBack: "Expansion plays.", sort: 3 },
      { slug: "design", name: "Retention design", handsBack: "Notes on how the product keeps people.", sort: 4 },
    ],
  },
  {
    slug: "operations",
    name: "Operations Agent",
    area: "operations",
    stage: "foundation",
    job: "Will hand back a daily briefing, reports, and task lists. The skills are named. The work comes last.",
    promise: "The Operations Agent does not run, and it does not send a briefing on its own.",
    sort: 2,
    skills: [
      { slug: "approvals", name: "Approvals and briefings", handsBack: "A daily briefing.", sort: 0 },
      { slug: "reporting", name: "Reporting", handsBack: "A report.", sort: 1 },
      { slug: "tasks", name: "Tasks and follow-through", handsBack: "A task list.", sort: 2 },
      { slug: "integrations", name: "Integrations and cleanup", handsBack: "A cleanup list.", sort: 3 },
    ],
  },
];

export const SALES_SKILL_SLUGS = ["ad-research", "ad-copy", "creative", "content"] as const;

export type SalesSkillSlug = (typeof SALES_SKILL_SLUGS)[number];
