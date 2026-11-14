/**
 * The agentic workforce: four departments, seven agents. Only Strategist is live in V1.
 * These are seed rows. The rail, the agent pages and `runs.start` read the tables, not this file.
 */

export const DEPARTMENTS = ["growth", "sales", "customer-success", "operations"] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_CATALOG: { slug: Department; name: string; job: string; sort: number }[] = [
  { slug: "growth", name: "Growth and Marketing", job: "Research, strategy and campaigns that bring in demand.", sort: 0 },
  { slug: "sales", name: "Sales", job: "Turning demand into customers.", sort: 1 },
  { slug: "customer-success", name: "Customer Success", job: "Getting customers to value, keeping them and growing them.", sort: 2 },
  { slug: "operations", name: "Operations", job: "How the business runs, measured.", sort: 3 },
];

export const DEPARTMENT_LABEL: Record<Department, string> = Object.fromEntries(
  DEPARTMENT_CATALOG.map((row) => [row.slug, row.name]),
) as Record<Department, string>;

export type SkillStatus = "available" | "comingSoon";

export type AgentStatus = "live" | "planned";

export type AgentSkill = {
  slug: string;
  /**
   * The skill's own name. Shown only on the public site and future agent pages: inside the app a skill is
   * part of its agent and is never named. Screens there use `work` and `output` (lib/workWords.ts).
   */
  name: string;
  /** What the agent is doing, in a word or two, for labels inside the app: "Research", "Offer analysis". */
  work: string;
  /** What it hands back, with its article, for sentences: "a market report", "an ad set". */
  output: string;
  job: string;
  promise: string;
  handsBack: string;
  status: SkillStatus;
  sort: number;
};

export type CatalogAgent = {
  slug: string;
  number: number;
  name: string;
  department: Department;
  status: AgentStatus;
  lifecycle: string;
  job: string;
  promise: string;
  sort: number;
  skills: AgentSkill[];
};

export const GROWTH_ARCHITECT = "growth-architect";

/** Old agent slugs and the agent that took each one over. The catalog sync renames these rows in place. */
export const RENAMED_AGENTS: Record<string, string> = { sales: GROWTH_ARCHITECT };

/** The slug an agent has now, for a slug that may come from an older row or an older client. */
export function currentAgentSlug(slug: string) {
  return RENAMED_AGENTS[slug] ?? slug;
}

const PLANNED_PROMISE = "It does not run yet.";

/** Skills that are built and may run for customers. Everything else in the catalog is coming soon. */
const AVAILABLE_SKILLS = new Set(["market-intelligence", "offer-intelligence", "growth-diagnostics", "creative-production", "landing-page-teardown"]);

/**
 * How the app words each skill's work, without naming the skill: a label and what it hands back. Every
 * agent's skills need a row here, Dealmaker's and the later agents' too; the catalog test checks it.
 */
const WORK_WORDS: Record<string, { work: string; output: string }> = {
  "market-intelligence": { work: "Research", output: "a market report" },
  "offer-intelligence": { work: "Offer analysis", output: "an offer analysis" },
  "campaign-strategy": { work: "Campaign plan", output: "a campaign strategy" },
  "creative-production": { work: "Ads", output: "an ad set" },
  "funnel-architect": { work: "Funnel plan", output: "a funnel plan" },
  "growth-diagnostics": { work: "Growth diagnosis", output: "a growth diagnosis" },
  "landing-page-teardown": { work: "Page breakdown", output: "a page breakdown" },
  // Dealmaker (docs/rebuild/dealmaker.md, answer 12.2): "Dealmaker · Pipeline review" inside the app.
  "pipeline-forensics": { work: "Pipeline review", output: "a pipeline review" },
  "conversation-intelligence": { work: "Call review", output: "a call review" },
  "deal-briefing": { work: "Pre-call brief", output: "a pre-call brief" },
  "follow-up-engine": { work: "Follow-ups", output: "a follow-up list" },
  "objection-playbook": { work: "Objection playbook", output: "an objection playbook" },
  "proposal-architect": { work: "Proposal", output: "a proposal" },
};

function skill(slug: string, name: string, handsBack: string, promise: string, sort: number): AgentSkill {
  const words = WORK_WORDS[slug] ?? { work: "Work", output: "a result" };
  return { slug, name, ...words, job: handsBack, handsBack, promise, status: AVAILABLE_SKILLS.has(slug) ? "available" : "comingSoon", sort };
}

export const CATALOG: CatalogAgent[] = [
  {
    slug: GROWTH_ARCHITECT,
    number: 1,
    name: "Strategist",
    department: "growth",
    status: "live",
    lifecycle: "Attract",
    job: "Researches your market and hands back reports and strategies, each claim with its source, for a person to approve.",
    promise: "Strategist never publishes or contacts anyone. A person approves every report before it is used.",
    sort: 0,
    skills: [
      skill("market-intelligence", "Market Intelligence", "A market report with sources: competitors, ads, content and patterns.", "It reads public sources and links you give it. It does not log in anywhere.", 0),
      skill("offer-intelligence", "Offer Intelligence", "An offer analysis built on approved research.", "It does not change your offer.", 1),
      skill("campaign-strategy", "Campaign Strategy", "A campaign strategy built on approved research.", "It does not launch a campaign.", 2),
      skill("creative-production", "Creative Production", "Your own version of an ad that works: a brief, four copy variations, a script and captions, for one brand.", "It models an ad's structure and never reuses its words, footage, faces, voice, music or logos. It does not publish anything.", 3),
      skill("funnel-architect", "Funnel Architect", "A funnel plan with the pages and steps it needs.", "It does not change your site.", 4),
      skill("growth-diagnostics", "Growth Diagnostics", "A diagnosis of where growth stalls, from your own data.", "It does not change your accounts.", 5),
      skill("landing-page-teardown", "Landing Page Teardown", "A section-by-section teardown of landing pages in your industry: what they share and what your page lacks.", "It reads public pages only. It never logs in, and it sees a page, not its results.", 6),
    ],
  },
  {
    slug: "campaign-execution",
    number: 2,
    name: "Marketer",
    department: "growth",
    status: "planned",
    lifecycle: "Attract",
    job: "Will run approved campaigns through your own connected accounts.",
    promise: PLANNED_PROMISE,
    sort: 1,
    skills: [],
  },
  {
    slug: "sales-conversion",
    number: 3,
    name: "Dealmaker",
    department: "sales",
    status: "planned",
    lifecycle: "Convert",
    job: "Will help turn leads into customers: follow-ups, calls and pipeline.",
    promise: PLANNED_PROMISE,
    sort: 2,
    // Designed in docs/rebuild/dealmaker.md, section 4. Coming soon until each is built; the agent goes live
    // with all six. Every one reads and acts in a CRM only through convex/lib/crm.
    skills: [
      skill("pipeline-forensics", "Pipeline Forensics", "Where deals stall, from your CRM's own figures, with a short plan.", "It reads your CRM. It changes nothing in it.", 0),
      skill("conversation-intelligence", "Conversation Intelligence", "What happened on one sales call: what the lead said, what was promised, the next step and the CRM updates to make.", "It reads a transcript you add. Every CRM update waits for a person's approval.", 1),
      skill("deal-briefing", "Deal Briefing", "One page on a lead before a booked call: who they are, what has happened so far, what to cover.", "It reads your CRM and your calls. It contacts nobody.", 2),
      skill("follow-up-engine", "Follow-up Engine", "The deals that went quiet, who to chase first, a drafted message and the CRM steps for each.", "It never sends a message or changes your CRM on its own. A person approves each one.", 3),
      skill("objection-playbook", "Objection Playbook", "The objections your leads actually raise, counted across calls, with answers built on your approved offer.", "It reads calls you add. It does not change your offer.", 4),
      skill("proposal-architect", "Proposal Architect", "A proposal after a good call, from what the lead said and your approved offer.", "It never sets or changes a price. A person approves the proposal before it goes out.", 5),
    ],
  },
  {
    slug: "activation",
    number: 4,
    name: "Starter",
    department: "customer-success",
    status: "planned",
    lifecycle: "Onboard",
    job: "Will help new customers reach their first result.",
    promise: PLANNED_PROMISE,
    sort: 3,
    skills: [],
  },
  {
    slug: "retention",
    number: 5,
    name: "Keeper",
    department: "customer-success",
    status: "planned",
    lifecycle: "Keep",
    job: "Will spot risk early and suggest plays to keep customers.",
    promise: PLANNED_PROMISE,
    sort: 4,
    skills: [],
  },
  {
    slug: "expansion",
    number: 6,
    name: "Expander",
    department: "customer-success",
    status: "planned",
    lifecycle: "Grow",
    job: "Will find upgrades and referrals among happy customers.",
    promise: PLANNED_PROMISE,
    sort: 5,
    skills: [],
  },
  {
    slug: "operations-intelligence",
    number: 7,
    name: "Operator",
    department: "operations",
    status: "planned",
    lifecycle: "Run",
    job: "Will report how the business runs and what needs attention.",
    promise: PLANNED_PROMISE,
    sort: 6,
    skills: [],
  },
];
