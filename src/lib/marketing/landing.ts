/**
 * The landing page, written to the owner's framework (docs/rebuild/landing-page-framework.md):
 * a sequence of objections answered in the order a cold reader raises them. One page, one goal,
 * one button. Layout code reads this file and does not own sentences.
 *
 * Rules this file keeps, and landing.test.ts enforces:
 *  - every required section has copy, and pains and fixes match one for one, in order;
 *  - with and without are matched pairs;
 *  - nothing here is invented: no customers, numbers, quotes or logos. Cost tags name a kind of
 *    cost, never a figure. Times in the process are described, not measured.
 */

import { EVIDENCE, PHILOSOPHY, SECTIONS } from "@/lib/marketing/content";

/** The one button. The same words at the nav, hero, offer and final sections. */
export const CTA = {
  label: "Request private access",
  href: "/request",
} as const;

/** True today: access is by request and each request is reviewed by a person. */
export const SCARCITY = "We bring on a limited number of teams at a time.";

export const LANDING_HERO = {
  /** Names the reader and a threshold. Anyone not yet selling and spending can leave here. */
  qualifier: "For agencies, consultants, coaches and info sellers already spending on ads or content",
  headline: "Know what to fix in your offer and ads, and whether the fix worked.",
  how: "Vistrial's AI agents study your market from sources you can open, draft the changes for you to approve, and measure each one against your own figures.",
} as const;

/** Each pain is one moment, and its cost sits on its own line. Costs are kinds of loss, not figures. */
export const PAINS = {
  id: "problem",
  headline: "You have probably had one of these weeks.",
  costLabel: "Cost",
  items: [
    {
      id: "price",
      moment: "A prospect asks why you cost more than the agency down the road. You answer from memory.",
      cost: "Deals lost on a price you could have defended",
    },
    {
      id: "hunch",
      moment: "You rewrite the offer on a hunch. Three weeks later, nobody can say if it helped.",
      cost: "Three weeks gone, and no answer",
    },
    {
      id: "tabs",
      moment: "Your competitor research is forty browser tabs and a folder of screenshots from last quarter.",
      cost: "Hours each month, redone every time",
    },
    {
      id: "unsourced",
      moment: "An AI tool hands you a confident market summary with no sources. It goes into a client deck.",
      cost: "Your name on a claim you cannot back",
    },
    {
      id: "ads",
      moment: "You launch four new ads on Monday without knowing what the market has already seen.",
      cost: "Spend on a test your competitors already ran",
    },
    {
      id: "page",
      moment: "Your sales page skips a question every buyer asks. You first hear it on a call you lose.",
      cost: "Visitors you paid for, leaving unanswered",
    },
  ],
} as const;

/** One fix per pain, same order. Present tense, outcome first. */
export const FIXES = {
  id: "solution",
  headline: "Each one has a fix.",
  items: [
    {
      id: "price",
      outcome: "You answer with their page open.",
      detail: "Your offer sits beside competitors' stated price and guarantee, each with its source.",
    },
    {
      id: "hunch",
      outcome: "Every change gets a check-in date.",
      detail: "Connect your figures and the before and after are compared for you.",
    },
    {
      id: "tabs",
      outcome: "Your research is one report you can reopen.",
      detail: "Every claim links to the source it came from.",
    },
    {
      id: "unsourced",
      outcome: "Every claim says how sure it is.",
      detail: "Observed, an inference, an untested hypothesis, your data, or not enough data.",
    },
    {
      id: "ads",
      outcome: "You see what competitors lead with before you write.",
      detail: "Then you get four variations to test, each one a stated hypothesis.",
    },
    {
      id: "page",
      outcome: "You see which objections your page skips.",
      detail: "It is read section by section, beside other pages in your industry.",
    },
  ],
  /** The philosophy and the evidence labels support the fixes. They are not separate stops. */
  principle: {
    title: PHILOSOPHY.headline,
    maxim: PHILOSOPHY.maxim,
    body: "Agents do the study and the drafting. A person decides what goes out.",
    labelsTitle: "How sure a claim is",
    labels: EVIDENCE.kinds,
  },
} as const;

/** Study, propose, you approve, try, measure. Who does each step is part of the picture. */
export const LOOP = {
  title: "The loop every change goes through",
  again: "The next round starts from what you measured.",
  who: { agent: "Agent", you: "You" },
  steps: [
    { id: "study", name: "Study", by: "agent", body: "Reads your market from sources you can open." },
    { id: "propose", name: "Propose", by: "agent", body: "Drafts a report and the changes worth testing." },
    { id: "approve", name: "You approve", by: "you", body: "Nothing is used until you say so." },
    { id: "try", name: "Try", by: "you", body: "You put the change live and set a check-in." },
    { id: "measure", name: "Measure", by: "agent", body: "Compares your figures before and after." },
  ],
} as const;

export const OFFER = {
  id: "offer",
  eyebrow: "The offer",
  name: "Private Access",
  headline: "Everything Growth Architect makes, for one monthly price.",
  deliverablesTitle: "What you get",
  deliverables: [
    "Market reports with a source on every claim",
    "Offer analyses beside competitors' price and guarantee",
    "Growth diagnoses from your own figures",
    "Ad sets: a brief, four copy variations, a video script and captions",
    "Designed ads on request, charged per image from your credits",
    "Landing page teardowns, section by section",
    "A check-in on every change you try",
    "PDF exports, with a white-label option",
    "A cost limit on every run",
  ],
  effort: "You say what you sell and approve the work. The agents do the reading, the comparing and the drafting.",
  price: "$179",
  per: "a month",
  credits: "$150 of credits included each month",
  creditsNote: "Each piece of work shows its cost. Included credits reset each month.",
  access: "Access is by request. A person reviews every request and replies by email.",
  noCharge: "Nothing is charged on this site.",
} as const;

/** Matched pairs: the same topic on both sides. */
export const COMPARE = {
  id: "compare",
  headline: "The same month, with and without.",
  without: "Without Vistrial",
  with: "With Vistrial",
  rows: [
    { topic: "Competitor research", without: "Tabs and screenshots, redone each quarter", with: "One report you reopen, every claim sourced" },
    { topic: "AI answers", without: "Confident, with nothing behind them", with: "Labeled observed, inference or hypothesis" },
    { topic: "Your offer", without: "Priced from memory of what others charge", with: "Set beside competitors' stated price and guarantee" },
    { topic: "New ads", without: "Four guesses launched on Monday", with: "Four variations, each a named hypothesis" },
    { topic: "After a change", without: "Nobody checks, or nobody agrees", with: "A check-in date and your own before and after" },
    { topic: "What it costs to run", without: "A surprise at the end of the month", with: "A limit on every run, shown as it works" },
  ],
} as const;

/** Times are described, not measured: there is no real onboarding data to quote yet. */
export const PROCESS = {
  id: "process",
  headline: "Five steps. Most of the work is not yours.",
  timeLabel: "Your time",
  steps: [
    { title: "Request access", body: "Tell us what you sell. A person reads every request and replies by email.", time: "A few minutes" },
    { title: "Set up your workspace", body: "Describe your offer and market. Connect your own figures if you want changes measured.", time: "One short setup" },
    { title: "Growth Architect studies and drafts", body: "It reads the sources, labels what it found, and stops at the cost limit.", time: "None" },
    { title: "You approve and pick what to try", body: "Approve the report or send it back. Choose a change and a check-in: 14, 30, 60 or 90 days.", time: "A read and a decision" },
    { title: "You record what happened", body: "At the check-in, say how it went. The next round of research builds on it.", time: "One answer" },
  ],
} as const;

export const ROLES = {
  id: "roles",
  headline: "Your part is small on purpose.",
  yours: {
    title: "Your part",
    items: ["Say what you sell", "Approve each draft, or send it back", "Pick what to try", "Record what happened"],
  },
  ours: {
    title: "The agents' part",
    items: [
      "Read competitor pages, videos and the links you paste",
      "Read landing pages section by section",
      "Sort what was seen from what is inferred",
      "Label every claim and link its source",
      "Set your offer beside competitors' price and guarantee",
      "Find where growth stalls in your own figures",
      "Draft the brief, four variations, script and captions",
      "Check ad copy against your brand kit",
      "Save your starting figures when you try a change",
      "Tell you when a check-in is due",
      "Stop at the cost limit",
      "Say so when there is not enough data",
    ],
  },
} as const;

/**
 * Buyer's voice, price first. The framework's required topics are tagged so the test can find them.
 * There is no guarantee in the Terms, and the answer says so.
 */
export const LANDING_FAQ = {
  id: "faq",
  headline: "Questions before you ask for access",
  items: [
    {
      topic: "price",
      q: "What does it cost?",
      a: "$179 a month, with $150 of credits included. Each piece of work shows its cost, and every run stops at a limit. If you need more, credit packs are $10, $25 or $50. Nothing is charged on this site.",
    },
    {
      topic: "guarantee",
      q: "Is there a guarantee?",
      a: "No. We do not promise results, and the Terms of Service do not offer refunds, except for a charge made in error or where the law requires one. What you get instead: you can cancel anytime, every run has a cost limit, and every change you try is checked against your own figures, so you can judge it yourself.",
    },
    {
      topic: "who",
      q: "Is this for a business like mine?",
      a: "It is built for agencies, consultants, coaches, and people who sell courses or programs. It suits you if you already have an offer and spend on ads or content. It is not a fit if you want a tool that posts or runs ads for you. Vistrial does not publish anything.",
    },
    {
      topic: "how-long",
      q: "How long until I see something?",
      a: "A person reviews your request and replies by email. Once you are in, you start a research session and the report is drafted in that session, then waits for your approval. How soon a change shows a result depends on the check-in you pick: 14, 30, 60 or 90 days.",
    },
    {
      topic: "not-working",
      q: "What if it doesn't work?",
      a: "Then you find out, with your own figures, instead of guessing. At the check-in you record what happened: it helped, no clear change, it made things worse, or too early to tell. The next round builds on that. You can cancel anytime, and access runs to the end of the period you paid for.",
    },
    {
      topic: "trust",
      q: "How do I know it isn't making things up?",
      a: "Every claim is labeled as observed, an inference, an untested hypothesis, or your data, and links to its source. When there is not enough data, it says so. It never claims an ad made money unless your own numbers show it.",
    },
    {
      topic: "control",
      q: "Will it post or spend anything on its own?",
      a: "No. It produces reports and drafts for review. It does not publish, post, or contact anyone, and its connection to your Meta ad account is read-only.",
    },
    {
      topic: "sources",
      q: "Where does the research come from?",
      a: "Public web pages, YouTube, TikTok and Instagram links you paste, and public landing pages it reads as VistrialBot. From your side: results files you upload as CSV, and your own Meta ad account through a read-only connection. It does not log in anywhere, and a report names any page it could not read.",
    },
    {
      topic: "data",
      q: "What do you do with my data?",
      a: "Your data is kept separate from every other customer's and is used to do your work only. The Security overview and the Privacy Policy, linked below, have the details.",
    },
  ],
} as const;

export const LANDING_FINAL = {
  id: "final",
  headline: "Know what to fix, and whether the fix worked.",
} as const;

export const LANDING_FOOTER = {
  signInPrompt: "Already have access?",
} as const;

/**
 * Product pictures. Every picture that is on is a real screen from the app, cut from a dev story
 * with sample data by scripts/capture-landing-pictures.cjs, in the white theme only. A planned slot stays off until its
 * screen exists on main: turn it on by adding the story to that script and a file here.
 * Never fill a slot with a mock-up.
 */
export type Picture = {
  id: string;
  on: boolean;
  /** Which fix or section the picture supports. */
  place: "fix" | "loop" | "planned";
  file: string | null;
  width: number;
  height: number;
  title: string;
  alt: string;
  /** For a planned slot: the screen it is waiting for. */
  waitingFor?: string;
};

export const PICTURES: Picture[] = [
  {
    id: "offer-compare",
    on: true,
    place: "fix",
    file: "offer-compare",
    width: 1604,
    height: 918,
    title: "Your offer beside theirs",
    alt: "The Offers screen: a table comparing your offer with three competing agencies on what they lead with, price and guarantee. The guarantee cell for your offer is highlighted as not stated, and each competitor column links to its source.",
  },
  {
    id: "ad-set",
    on: true,
    place: "fix",
    file: "ad-set",
    width: 2236,
    height: 1304,
    title: "Four variations for a client brand",
    alt: "The Creative screen: four ad copy variations for one client brand, each with its headline, button, image direction and an untested hypothesis to check.",
  },
  {
    id: "page-teardown",
    on: true,
    place: "fix",
    file: "page-teardown",
    width: 2236,
    height: 1824,
    title: "Your page, section by section",
    alt: "The Pages screen: a landing page read section by section, with counts of its buttons and header links, its qualifier, headline, proof and offer, and a note on whether each section does its job.",
  },
  {
    id: "test-plan",
    on: true,
    place: "loop",
    file: "test-plan",
    width: 1604,
    height: 1286,
    title: "Pick a change, set a check-in",
    alt: "A test plan with two changes. The first is being tried, with a check-in date and starting figures saved. The second has a We'll try this button and a check-back choice of 30 days.",
  },
  {
    id: "research-approve",
    on: true,
    place: "loop",
    file: "research-approve",
    width: 1688,
    height: 608,
    title: "A report waits for you",
    alt: "The Research screen: a market report waiting for approval with Approve, Request changes and Reject buttons, and an earlier version marked Approved.",
  },
  {
    id: "tasks-board",
    on: false,
    place: "planned",
    file: null,
    width: 0,
    height: 0,
    title: "Tasks board",
    alt: "",
    waitingFor: "The Tasks board screen (being built in another session).",
  },
  {
    id: "briefing-post",
    on: false,
    place: "planned",
    file: null,
    width: 0,
    height: 0,
    title: "Briefing post",
    alt: "",
    waitingFor: "The Briefing screen (being built in another session).",
  },
  {
    id: "organizations-clients",
    on: false,
    place: "planned",
    file: null,
    width: 0,
    height: 0,
    title: "Organizations and clients",
    alt: "",
    waitingFor: "The organization and client screens (claude/orgs-foundation, then the screens session).",
  },
];

export function picturesFor(place: Picture["place"]) {
  return PICTURES.filter((picture) => picture.on && picture.place === place && picture.file);
}

export const PICTURE_NOTE = "A real screen from the app, with sample data.";

/** The framework's order. Results is left out when there is no real proof. */
export const LANDING_ORDER = ["nav", "hero", "results", "problem", "solution", "offer", "compare", "process", "roles", "faq", "final"] as const;

const REQUIRED_FAQ_TOPICS = ["price", "guarantee", "who", "how-long", "not-working"] as const;

const empty = (value: string | undefined | null) => !value || value.trim().length === 0;

/**
 * The framework's refusals. An empty list means the page may be published.
 * The page module throws on anything else, so a broken page fails the build instead of going live.
 */
export function landingProblems(): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  need(!empty(CTA.label) && /^[A-Z][a-z]+ /.test(CTA.label), "Nav: the button needs a verb.");
  need(![LANDING_HERO.qualifier, LANDING_HERO.headline, LANDING_HERO.how].some(empty), "Hero: qualifier, headline and how are all required.");
  need(PAINS.items.length >= 3 && PAINS.items.length <= 6, "Problem: three to six pains.");
  need(PAINS.items.every((pain) => !empty(pain.moment) && !empty(pain.cost)), "Problem: every pain needs a moment and a cost.");
  need(FIXES.items.length > 0, "Solution: empty.");
  need(PAINS.items.length === FIXES.items.length, `Pain and solution counts differ (${PAINS.items.length} and ${FIXES.items.length}).`);
  need(PAINS.items.every((pain, index) => FIXES.items[index]?.id === pain.id), "Solution: fixes must follow the pains, one for one, in order.");
  need(FIXES.items.every((fix) => !empty(fix.outcome) && !empty(fix.detail)), "Solution: every fix needs an outcome.");
  need(OFFER.deliverables.length > 0 && ![OFFER.effort, OFFER.price, OFFER.access].some(empty), "Offer: deliverables, the effort line, the price and how access works are required.");
  need(COMPARE.rows.length > 0 && COMPARE.rows.every((row) => !empty(row.with) && !empty(row.without)), "With vs without: every row needs both sides.");
  need(PROCESS.steps.length >= 3 && PROCESS.steps.length <= 5, "Process: three to five steps.");
  need(PROCESS.steps.every((step) => !empty(step.time)), "Process: every step states the reader's time.");
  need(ROLES.yours.items.length > 0 && ROLES.ours.items.length > ROLES.yours.items.length, "Roles: our list must be the longer one.");
  need(REQUIRED_FAQ_TOPICS.every((topic) => LANDING_FAQ.items.some((item) => item.topic === topic)), "FAQ: price, guarantee, who it is for, how long, and what if it does not work are required.");
  need(LANDING_FAQ.items.findIndex((item) => item.topic === "price") <= 1, "FAQ: the price question sits near the top.");
  need(!empty(LANDING_FINAL.headline), "Final CTA: empty.");
  need(SECTIONS.proof === false, "Results: stays off until there is real proof.");
  need(PICTURES.every((picture) => !picture.on || Boolean(picture.file)), "Pictures: a picture that is on needs a real file.");
  return problems;
}
