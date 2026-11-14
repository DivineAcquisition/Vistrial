/**
 * Each agent's own public page, at /agents/<page slug>. One shape for every agent, so Strategist and the
 * agents after Dealmaker get theirs the same way. The words here are public: they say only what the agent
 * does or will do, and an agent that is not live says so plainly.
 *
 * Dealmaker's words follow its doctrine (docs/rebuild/dealmaker.md, 0.0), and its five steps and the five
 * questions of its standard come from the same file the product uses.
 */

import { CATALOG, type CatalogAgent } from "../../../convex/catalog";
import { DOCTRINE_NAME, DOCTRINE_STEPS, THE_STANDARD } from "../../../convex/skills/dealmaker/doctrine";

export type AgentPage = {
  /** The page's address under /agents. */
  slug: string;
  /** The catalog agent it is about. Name, status and skills are read from the catalog. */
  agentSlug: string;
  eyebrow: string;
  headline: string;
  supporting: string;
  /** Said when the agent is not live yet. */
  notYet: string;
  doctrine: {
    title: string;
    lead: string;
    paragraphs: string[];
    steps: readonly { id: string; name: string; does: string }[];
  };
  principles: { id: string; numeral: string; title: string; body: string; inProduct: string }[];
  foundation: { title: string; body: string; controls: string };
  tabs: { title: string; lead: string; items: { id: string; name: string; does: string }[] };
  skills: { title: string; lead: string };
  never: { title: string; items: string[] };
  connects: { title: string; items: { label: string; status: "today" | "coming" }[] };
  standard: { title: string; lead: string; questions: readonly string[] };
  cta: { headline: string; body: string; label: string; href: string };
  seo: { title: string; description: string };
};

export const DEALMAKER_PAGE: AgentPage = {
  slug: "dealmaker",
  agentSlug: "sales-conversion",
  eyebrow: "Agent 03 · Convert",
  headline: "Clarity precedes progress.",
  supporting:
    "Dealmaker brings discipline to selling on calls. It studies what happened, keeps evidence apart from interpretation, shows what is still unresolved, and helps the right person own the next action.",
  notYet: "Dealmaker is in development and does not run yet. Strategist is live today.",
  doctrine: {
    title: DOCTRINE_NAME,
    lead: "A sales opportunity advances when the people involved understand the situation, resolve uncertainty, and keep the commitments a decision needs.",
    paragraphs: [
      "Dealmaker exists to bring that discipline to the sales operation.",
      "Its work should make the team more attentive, more accountable, and more effective.",
    ],
    steps: DOCTRINE_STEPS,
  },
  principles: [
    {
      id: "understand",
      numeral: "I",
      title: "Understand before advancing",
      body: "A buyer has objectives, constraints, alternatives and a way of deciding. An objection is information to investigate. Silence leaves uncertainty. An enthusiastic call can show interest without showing readiness to buy.",
      inProduct: "Recommendations account for what the buyer said they need, what is still unanswered, earlier conversations and the next steps agreed.",
    },
    {
      id: "evidence",
      numeral: "II",
      title: "Progress requires evidence",
      body: "Calls made and messages sent describe effort; what matters is what happened in them. A rep's report has an author. A CRM status is a recorded assertion. Neither automatically overrides contradictory evidence.",
      inProduct: "Recorded events, the buyer's own words, a rep's account and measured results stay apart. Missing information is shown as missing, and records that disagree are shown for a person to settle.",
    },
    {
      id: "ownership",
      numeral: "III",
      title: "Every commitment needs ownership",
      body: "A commitment works when someone owns it, knows what done means and knows when it is due. A setter's discovery should reach the closer. A buyer should never have to repeat what a handoff lost.",
      inProduct: "Important commitments carry an owner, a due date where it has one, and a clear next action. Handoffs keep the context.",
    },
    {
      id: "respect",
      numeral: "IV",
      title: "Follow-through respects the buyer",
      body: "Each follow-up answers a question, delivers something promised, confirms a decision, or asks whether more contact is welcome. A clear no is respected. A poor fit is disqualified honestly.",
      inProduct: "Dealmaker never invents urgency, misrepresents an offer or pushes to improve a number. Messages that persuade, price, re-engage or close always wait for a person to approve them.",
    },
    {
      id: "context",
      numeral: "V",
      title: "Accountability requires context",
      body: "Fair judgment considers a person's role, their deals, lead quality, workload and the support they had. A problem can be execution, an unclear process, a weak offer, poor qualification or missing support.",
      inProduct: "End-of-day reports support review and coaching. A missing report is a gap in the records, not proof that no work was done.",
    },
    {
      id: "learn",
      numeral: "VI",
      title: "Experience improves judgment",
      body: "Every won, lost, delayed or disqualified deal can teach something, if the lesson keeps its evidence and its limits. One outcome is not proof of a cause.",
      inProduct: "Dealmaker proposes lessons for a person to approve. Approved lessons guide future work and can inform Strategist's research, inside the same business only.",
    },
  ],
  foundation: {
    title: "Where it comes from",
    body: "Socratic examination, Stoic discipline and practical judgment: question assumptions, take responsibility for what you control, and adapt to the circumstances.",
    controls: "Your team controls the honesty of its communication, the quality of its preparation and the reliability of its follow-through. It cannot control another person's decision.",
  },
  tabs: {
    title: "Where the work happens",
    lead: "Six places inside Vistrial, built around how a sales team works.",
    items: [
      { id: "chat", name: "Chat", does: "Ask Dealmaker for anything. It shows its plan and the budget before it starts." },
      { id: "calendar", name: "Calendar", does: "Your booked calls for the week, each with its brief ready, due or missing." },
      { id: "pipeline", name: "Pipeline", does: "Every deal by stage, colour-coded by health, with who has the ball, what is established, what is unresolved and the commitments that are open." },
      { id: "calls", name: "Calls", does: "The brief before the call, a checklist and notes during it, and the review, recap and proposal after it." },
      { id: "comms", name: "Comms", does: "Every text, email, voice note and direct message drafted for sending, each waiting for the approval it needs." },
      { id: "playbook", name: "Playbook", does: "What Dealmaker knows about how you sell: your offer, who you sell to, the objections you hear and how you close." },
    ],
  },
  skills: {
    title: "Six skills",
    lead: "Each one hands back something your team can use, from your own records, with its evidence.",
  },
  never: {
    title: "What it will never do",
    items: [
      "Send a first message to a lead, a price, or a closing message without a person approving it.",
      "Mark a deal won or lost without the owner.",
      "Invent urgency, scarcity or a claim your proof does not support.",
      "Keep contacting someone who said no.",
      "Turn a missing report into a verdict about a person.",
      "Treat one won or lost deal as proof of what caused it.",
    ],
  },
  connects: {
    title: "Works with",
    items: [
      { label: "HighLevel", status: "today" },
      { label: "Call transcripts from your note taker", status: "today" },
      { label: "HubSpot", status: "coming" },
      { label: "Salesforce", status: "coming" },
    ],
  },
  standard: {
    title: "The standard",
    lead: "Dealmaker has done useful work when your team can clearly answer:",
    questions: THE_STANDARD,
  },
  cta: {
    headline: "Be first when Dealmaker is ready.",
    body: "Request Private Access and start with Strategist today. Dealmaker joins your workspace when it goes live.",
    label: "Request access",
    href: "/request?from=dealmaker",
  },
  seo: {
    title: "Dealmaker: Clarity precedes progress",
    description:
      "Dealmaker is Vistrial's sales agent for teams that sell on calls. It studies what happened, separates evidence from interpretation, shows what is unresolved and helps the right person own the next action.",
  },
};

/** Every agent with its own page. */
export const AGENT_PAGES: readonly AgentPage[] = [DEALMAKER_PAGE];

export function agentPageFor(slug: string): AgentPage | null {
  return AGENT_PAGES.find((page) => page.slug === slug) ?? null;
}

/** The catalog row a page is about. */
export function agentOfPage(page: AgentPage): CatalogAgent {
  const agent = CATALOG.find((row) => row.slug === page.agentSlug);
  if (!agent) throw new Error(`No catalog agent ${page.agentSlug}`);
  return agent;
}

/** Where an agent's page is, by the agent's catalog slug, or null when it has none yet. */
export function agentPageHref(agentSlug: string): string | null {
  const page = AGENT_PAGES.find((row) => row.agentSlug === agentSlug);
  return page ? `/agents/${page.slug}` : null;
}
