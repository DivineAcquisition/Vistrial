export const AREAS = ["sales", "retention", "operations"] as const;

export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  sales: "Sales",
  retention: "Retention",
  operations: "Operations",
};

export type SkillStatus = "available" | "comingSoon";

/** Seed rows for the areas table. The rail reads the table. */
export const AREA_CATALOG: { slug: Area; name: string; job: string; promise: string; sort: number }[] = [
  {
    slug: "sales",
    name: "Sales",
    job: "Ready-to-use assets for a person to approve and publish.",
    promise: "Nothing in Sales is posted on its own.",
    sort: 0,
  },
  {
    slug: "retention",
    name: "Retention",
    job: "Plans, signals, and plays. Details come after Sales.",
    promise: "Retention does not contact a customer in this step.",
    sort: 1,
  },
  {
    slug: "operations",
    name: "Operations",
    job: "Briefings, reports, and task lists. Details come last.",
    promise: "Operations does not send a briefing on its own.",
    sort: 2,
  },
];

/** Kept so older rows still validate. The rail groups by area. */
export const STAGES = ["foundation", "organization", "execution"] as const;

export type Stage = (typeof STAGES)[number];

export type AgentSkill = {
  slug: string;
  name: string;
  job: string;
  promise: string;
  handsBack: string;
  status: SkillStatus;
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
      {
        slug: "ad-research",
        name: "Ad research",
        job: "A research report.",
        promise: "It does not post an ad.",
        handsBack: "A research report.",
        status: "comingSoon",
        sort: 0,
      },
      {
        slug: "ad-copy",
        name: "Ad copy",
        job: "Copy sets.",
        promise: "It does not post copy.",
        handsBack: "Copy sets.",
        status: "comingSoon",
        sort: 1,
      },
      {
        slug: "creative",
        name: "Creative",
        job: "Creative briefs.",
        promise: "It does not publish a creative.",
        handsBack: "Creative briefs.",
        status: "comingSoon",
        sort: 2,
      },
      {
        slug: "content",
        name: "Content ideation",
        job: "A content calendar.",
        promise: "It does not schedule a post.",
        handsBack: "A content calendar.",
        status: "comingSoon",
        sort: 3,
      },
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
      {
        slug: "onboarding",
        name: "Onboarding and activation",
        job: "An activation plan.",
        promise: "It does not run yet.",
        handsBack: "An activation plan.",
        status: "comingSoon",
        sort: 0,
      },
      {
        slug: "health",
        name: "Health and risk",
        job: "Risk signals.",
        promise: "It does not run yet.",
        handsBack: "Risk signals.",
        status: "comingSoon",
        sort: 1,
      },
      {
        slug: "save",
        name: "Save and win-back",
        job: "Save plays.",
        promise: "It does not run yet.",
        handsBack: "Save plays.",
        status: "comingSoon",
        sort: 2,
      },
      {
        slug: "expansion",
        name: "Expansion and referrals",
        job: "Expansion plays.",
        promise: "It does not run yet.",
        handsBack: "Expansion plays.",
        status: "comingSoon",
        sort: 3,
      },
      {
        slug: "design",
        name: "Retention design",
        job: "Notes on how the product keeps people.",
        promise: "It does not run yet.",
        handsBack: "Notes on how the product keeps people.",
        status: "comingSoon",
        sort: 4,
      },
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
      {
        slug: "approvals",
        name: "Approvals and briefings",
        job: "A daily briefing.",
        promise: "It does not run yet.",
        handsBack: "A daily briefing.",
        status: "comingSoon",
        sort: 0,
      },
      {
        slug: "reporting",
        name: "Reporting",
        job: "A report.",
        promise: "It does not run yet.",
        handsBack: "A report.",
        status: "comingSoon",
        sort: 1,
      },
      {
        slug: "tasks",
        name: "Tasks and follow-through",
        job: "A task list.",
        promise: "It does not run yet.",
        handsBack: "A task list.",
        status: "comingSoon",
        sort: 2,
      },
      {
        slug: "integrations",
        name: "Integrations and cleanup",
        job: "A cleanup list.",
        promise: "It does not run yet.",
        handsBack: "A cleanup list.",
        status: "comingSoon",
        sort: 3,
      },
    ],
  },
];

export const SALES_SKILL_SLUGS = ["ad-research", "ad-copy", "creative", "content"] as const;

export type SalesSkillSlug = (typeof SALES_SKILL_SLUGS)[number];
