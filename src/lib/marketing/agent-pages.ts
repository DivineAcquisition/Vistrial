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
import { HOW, PHILOSOPHY, SOURCES } from "./content";

export type AgentPage = {
  /** The page's address under /agents. */
  slug: string;
  /** The catalog agent it is about. Name, status and skills are read from the catalog. */
  agentSlug: string;
  eyebrow: string;
  headline: string;
  supporting: string;
  /** Said when the agent is not live yet. */
  notYet?: string;
  doctrine: {
    title: string;
    lead: string;
    paragraphs: string[];
    steps: readonly { id: string; name: string; does: string }[];
  };
  principles: { title: string; items: { id: string; numeral: string; title: string; body: string; inProduct: string }[] };
  foundation: { title: string; body: string; controls: string };
  tabs: { title: string; lead: string; items: { id: string; name: string; does: string }[] };
  skills: { title: string; lead: string };
  never: { title: string; items: string[] };
  connects: { title: string; items: { label: string; status: "today" | "coming" }[] };
  /** What every result must let the team answer or show. */
  standard: { title: string; lead: string; items: readonly string[] };
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
  principles: {
    title: "How Dealmaker thinks",
    items: [
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
  },
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
    items: THE_STANDARD,
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

/**
 * Strategist's words follow its doctrine (docs/rebuild/doctrine-understanding-precedes-advantage.md, section 1).
 * Its five steps are the homepage's own (HOW), and its sources the ones that work today (SOURCES).
 */
export const STRATEGIST_PAGE: AgentPage = {
  slug: "strategist",
  agentSlug: "growth-architect",
  eyebrow: "Agent 01 · Attract",
  headline: "Understanding precedes advantage.",
  supporting:
    "Strategist studies your market before it recommends anything. It keeps what it saw apart from what it infers, says when the evidence runs out, and hands back finished work for a person to approve.",
  doctrine: {
    title: "Understanding Precedes Advantage",
    lead: "An agent must understand the task before attempting to complete it.",
    paragraphs: [
      "It gathers the context the task needs, separates evidence from assumptions, and recognises the limits of what it knows.",
      "Its job is not the greatest volume of information. Its job is to turn understanding into detailed, accurate and usable work. Where the evidence is not enough, it says so. Where judgment is needed, it explains its recommendation. Where an action has consequences, a person approves it.",
    ],
    steps: HOW.steps.map((step) => ({ id: step.id, name: step.title, does: step.body })),
  },
  principles: {
    title: "How Strategist thinks",
    items: [
      {
        id: "understand",
        numeral: "I",
        title: "Understand the task first",
        body: "Before it researches, it works out the objective, what a good result looks like, what it already knows about your business and what is missing.",
        inProduct: "Every run starts from your business profile and a plan you can read. It asks you only when a gap would change the result, and writes down any assumption it makes instead.",
      },
      {
        id: "evidence",
        numeral: "II",
        title: "Evidence apart from assumptions",
        body: "What a source shows, what is read from it, and what is only an idea to test are different things. A popular ad is not proof that it made money.",
        inProduct: "Every claim is labelled Observed, Inference, Untested hypothesis or Your data, with the source you can open. Labels are set by the product, never by the model.",
      },
      {
        id: "limits",
        numeral: "III",
        title: "Say when the evidence runs out",
        body: "A confident guess is not an answer. Knowing the limits of what was found is part of the work.",
        inProduct: "\"Not enough data\" is shown where it applies, and any source it could not read is named in the report with the reason.",
      },
      {
        id: "depth",
        numeral: "IV",
        title: "Depth over volume",
        body: "Work is judged on relevance, specificity, evidence and whether someone can use it. The number of pages is not one of them.",
        inProduct: "Reports end with the few changes worth testing first, each with its reasoning, and say what to leave for later.",
      },
      {
        id: "approval",
        numeral: "V",
        title: "Judgment stays human",
        body: "Agents do the study and the drafting. A person decides what is used and what goes out.",
        inProduct: "Every report and ad set waits as a draft until an Owner or Manager approves it. Strategist never publishes, posts or contacts anyone.",
      },
      {
        id: "learn",
        numeral: "VI",
        title: "Learning is controlled",
        body: "Strategist gets better because your workspace holds better context and better evidence, not because it remembers everything you say.",
        inProduct: "You pick a change to try and set a check-in. What your own figures show, and the facts a person confirms, become context for the next round.",
      },
    ],
  },
  foundation: {
    title: "Where it comes from",
    body: PHILOSOPHY.paragraphs[0],
    controls: PHILOSOPHY.paragraphs[1],
  },
  tabs: {
    title: "Where the work happens",
    lead: "Six places inside Vistrial, each starting from what it needs and showing the plan before it runs.",
    items: [
      { id: "chat", name: "Chat", does: "Ask Strategist for anything. It shows its plan and the budget before it starts." },
      { id: "research", name: "Research", does: "Market reports: competitors, ads, content and patterns, each claim with its source." },
      { id: "offers", name: "Offers", does: "Your offer beside what competitors lead with, and two or three changes to test." },
      { id: "diagnostics", name: "Diagnostics", does: "Where growth stalls, from your own figures, with a 90-day plan to fix, build and scale." },
      { id: "creative", name: "Creative", does: "An ad set for one brand from your brand kit: a brief, four copy variations, a video script and captions." },
      { id: "pages", name: "Pages", does: "A section-by-section read of landing pages in your industry, and what your page lacks." },
    ],
  },
  skills: {
    title: "Seven skills",
    lead: "Each one hands back finished work with its sources, saved as a draft for you to approve.",
  },
  never: {
    title: "What it will never do",
    items: [
      "Publish, post or send anything without a person approving it.",
      "Log in anywhere, or get around a block, to read a source.",
      "Present a claim without a label and a source you can open.",
      "Treat a popular ad as proof that it worked.",
      "Reuse another brand's words, footage, faces, voice, music or logos.",
      "Run past its cost limit.",
    ],
  },
  connects: {
    title: "Researches across",
    items: SOURCES.items.map((item) => ({ label: item.label, status: "today" as const })),
  },
  standard: {
    title: "The standard",
    lead: "Strategist's work is not done until it shows that it:",
    items: ["Understood the objective.", "Used the relevant context.", "Supported its material claims.", "Produced the work you asked for."],
  },
  cta: {
    headline: "Start with Strategist.",
    body: "Request Private Access. Strategist is live today, and the agents after it join your workspace as they go live.",
    label: "Request access",
    href: "/request?from=strategist",
  },
  seo: {
    title: "Strategist: Understanding precedes advantage",
    description:
      "Strategist is Vistrial's research agent. It studies your market, keeps evidence apart from assumptions, says when the evidence runs out, and hands back finished work for you to approve.",
  },
};

/** Every agent with its own page. */
export const AGENT_PAGES: readonly AgentPage[] = [STRATEGIST_PAGE, DEALMAKER_PAGE];

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
