/**
 * Public page copy. One source for the landing page, pricing, forms, and
 * supporting pages. Layout code reads this file and does not own sentences.
 *
 * Display prices are not connected to billing.
 */

import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

export const SITE_DESCRIPTION =
  "Vistrial is an agentic workforce for agencies, consultants, coaches and info sellers: AI agents that research your market, sharpen your offer, and draft the ads to test, with a source on every claim and a person approving every step.";

export const SECTIONS = {
  hero: true,
  problem: true,
  philosophy: true,
  how: true,
  growthArchitect: true,
  evidence: true,
  agents: true,
  industries: true,
  safety: true,
  pricing: true,
  faq: true,
  final: true,
  /** Hidden until real proof exists. Do not turn this on with invented logos or numbers. */
  proof: false,
} as const;

/** Shared hero strings: page titles, the social image, and sample labels. The page's own hero copy is LANDING_HERO in landing.ts. */
export const HERO = {
  headline: "Know what to fix in your offer and ads, and whether the fix worked.",
  supporting:
    "AI agents for agencies, consultants, coaches and info sellers. They study your market, draft the changes for you to approve, and measure each one against your own figures.",
  primaryCta: "Request private access",
  trust: "Every claim shows its source. Nothing is published without a person's approval. Each customer's data is kept separate.",
  exampleLabel: "Example with sample data",
} as const;

export const NAV = {
  skipToContent: "Skip to content",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  signIn: "Sign in",
  signInHref: `${PRODUCTION_APP_ORIGIN}/login`,
  request: "Request private access",
  /** The framework's nav has a logo and one button. Menu links are exits, so there are none. */
  links: [],
} as const;

/**
 * Only sources that work today. Meta's Ad Library is left out until Vistrial has working access to it,
 * and TikTok and Instagram are read from links the customer pastes, not searched.
 */
export const SOURCES = {
  label: "Researches across",
  items: [
    { key: "web", label: "The open web" },
    { key: "youtube", label: "YouTube" },
    { key: "tiktok", label: "TikTok links" },
    { key: "instagram", label: "Instagram links" },
    { key: "pages", label: "Public landing pages" },
    { key: "results", label: "Your results files" },
    { key: "metaAds", label: "Your Meta ad account" },
  ],
} as const;

/** The strip under the hero: sources flow into the agent, and the agent hands back a draft. */
export const AGENT_FLOW = {
  agent: "Growth Architect",
  agentRole: "Agent 01",
  statuses: [
    "Reading competitor offer pages",
    "Reading the links you pasted",
    "Sorting what was seen from what is inferred",
    "Drafting the report",
  ],
  output: {
    title: "Market report",
    meta: "Draft · 14 claims · 31 sources",
    state: "Waiting for your approval",
  },
  caption: "Sample run. Any source that was unavailable is named in the report.",
} as const;

/** How it works, played as a run: each step reports what it did. Sample numbers. */
export const DOCTRINE_RUN = {
  labels: { queued: "Queued", running: "Running", done: "Done", waiting: "Waiting on you" },
  notes: {
    observe: "Read 24 pages and 9 videos",
    distinguish: "14 claims, each labeled",
    prioritize: "3 changes to test first",
    create: "Report and 4 ad variations",
    validate: "Check-in set for 30 days",
  },
} as const;

/** The approval moment in Safety. */
export const APPROVAL = {
  introTitle: "Try the approval step",
  introBody: "Every draft waits here until a person approves it. Hold the button to approve the sample report. Nothing is published either way.",
  hold: "Hold to approve",
  holding: "Keep holding",
  hint: "Press and hold the button, or hold Space or Enter.",
  approvedTitle: "Approved",
  approvedBody: "Nothing goes live until you publish it.",
  reset: "Reset example",
} as const;

export const PROBLEM = {
  id: "problem",
  headline: "Most growth starts with a guess.",
  opening:
    "Agencies, consultants and coaches launch ads, publish content, and raise spend before they understand the market they are trying to move.",
  scattered:
    "Competitor research lives in browser tabs and screenshots. Strategy sits in one document and the creative in another. When a campaign works, nobody can say why. When it fails, nobody can say which assumption was wrong.",
  pains: [
    "We copy what competitors seem to do without knowing whether it works.",
    "Research, strategy, and creative live in different places and drift apart.",
    "AI tools give confident answers with no sources behind them.",
    "We spend before we know which audience or angle to test first.",
  ],
  /** The "before" picture: research spread across tabs, with nothing to back it. */
  scene: {
    tabs: ["rival-agency.com", "Ad screenshot (3).png", "Offer v4 FINAL", "Notes from call"],
    activeTab: 2,
    note: "“Competitors seem to offer a guarantee? Maybe test a pilot?”",
    flags: ["No source", "Unclear owner", "Last edited 6 weeks ago"],
    stamp: "Guess",
  },
  bridge: {
    text: "Vistrial starts with evidence instead.",
    link: "See how it works",
    href: "#how",
  },
} as const;

export const PHILOSOPHY = {
  id: "philosophy",
  eyebrow: "Our philosophy",
  headline: "Study first. Then act.",
  paragraphs: [
    "Vistrial began with an old discipline, not a new tool. Long before dashboards, philosophers taught that a conclusion is earned by looking carefully, naming what you actually know, and admitting what you do not.",
    "Most growth work skips that step. It starts with a guess, spends on it, and hopes. We built Vistrial so the careful step comes first, and costs less than the guess it replaces.",
  ],
  tenets: [
    { id: "observe", title: "Observation before opinion", body: "Look at the market as it is before deciding what it should be." },
    { id: "know", title: "Know what you know", body: "Keep what was seen apart from what is inferred, and both apart from what is hoped." },
    { id: "admit", title: "Say when you do not", body: "“Not enough data” is an honest answer. A confident guess is not." },
    { id: "judge", title: "Judgment stays human", body: "Agents do the study and the drafting. A person decides what goes out." },
  ],
  maxim: "Understanding precedes advantage.",
  link: { href: "/#how", label: "See how every agent applies it" },
  image: {
    src: "/brand/philosopher-thinker-crisp.png",
    width: 640,
    height: 1326,
    alt: "A black-and-white cartoon-style drawing of a full-length seated figure in deep thought, chin resting on his hand.",
    credit:
      "Drawn from Auguste Rodin, The Thinker, c. 1880. Bronze. The Cleveland Museum of Art, Gift of Alexandre P. Rosenberg, 1979.138. Public domain (CC0).",
  },
} as const;

export const HOW = {
  id: "how",
  headline: "Understanding precedes advantage.",
  lead: "Every Vistrial agent works in the same order. It studies before it recommends, and it shows how sure it is.",
  steps: [
    {
      id: "observe",
      title: "Observe",
      body: "Study the market first: competitors, customers, offers, ads, and content, from sources you can open and check.",
    },
    {
      id: "distinguish",
      title: "Distinguish",
      body: "Separate what was seen from what is inferred, what is only a hypothesis, and what your own results prove.",
    },
    {
      id: "prioritize",
      title: "Prioritize",
      body: "Choose the few audiences, angles, and experiments worth your attention, and say what to leave for later.",
    },
    {
      id: "create",
      title: "Create",
      body: "Turn the choice into finished work: reports, offer analyses, ad copy, video scripts, and designed ads.",
    },
    {
      id: "validate",
      title: "Validate",
      body: "You pick what to try and set a check-in. Your own figures show what held up, and the next round builds on it.",
    },
  ],
} as const;

/**
 * Skill status mirrors convex/catalog.ts (AVAILABLE_SKILLS). content.test.ts fails if the two drift apart.
 * "What it hands back" stays close to the catalog's own wording.
 */
export const GROWTH_ARCHITECT = {
  id: "growth-architect",
  eyebrow: "Agent 01",
  headline: "Growth Architect",
  lead: "One agent for market research, offers, diagnosis, creative, and landing pages. Each skill hands back finished work for you to approve. Then you pick what to try, set a check-in, and record what happened.",
  skills: [
    {
      id: "market-intelligence",
      name: "Market Intelligence",
      handsBack: "A market report with sources: competitors, ads, content, and patterns.",
      status: "available" as const,
    },
    {
      id: "offer-intelligence",
      name: "Offer Intelligence",
      handsBack: "Your offer set beside what competitors lead with, and two or three changes to test.",
      status: "available" as const,
    },
    {
      id: "growth-diagnostics",
      name: "Growth Diagnostics",
      handsBack: "A diagnosis of where growth stalls, from your own figures.",
      status: "available" as const,
    },
    {
      id: "creative-production",
      name: "Creative Production",
      handsBack: "An ad set for one brand: a brief, four copy variations, a video script, and captions. Designed ads on request.",
      status: "available" as const,
    },
    {
      id: "landing-page-teardown",
      name: "Landing Page Teardown",
      handsBack: "A section-by-section read of landing pages in your industry: what they share and what your page lacks.",
      status: "available" as const,
    },
    {
      id: "campaign-strategy",
      name: "Campaign Strategy",
      handsBack: "A campaign strategy built on approved research.",
      status: "comingSoon" as const,
    },
    {
      id: "funnel-architect",
      name: "Funnel Architect",
      handsBack: "A funnel plan with the pages and steps it needs.",
      status: "comingSoon" as const,
    },
  ],
  statusLabel: { available: "Available", comingSoon: "Coming soon" },
} as const;

/** Labels match the product's own (convex/lib/evidence.ts). */
export const EVIDENCE = {
  id: "evidence",
  headline: "Every claim shows its source.",
  lead: "Growth Architect labels how much it knows. Popular is not the same as profitable, and a page that keeps running is not proof that it works.",
  kinds: [
    { id: "observed", label: "Observed", body: "Seen directly in a source you can open." },
    { id: "inferred", label: "Inference", body: "A reasonable reading of what was seen." },
    { id: "hypothesis", label: "Untested hypothesis", body: "An idea to test, never presented as fact." },
    { id: "firstParty", label: "Your data", body: "Backed by your own measured figures." },
    { id: "insufficient", label: "Not enough data", body: "Said plainly instead of guessed." },
  ],
} as const;

/** Grouped the way the app groups them (src/lib/shell/journey.ts). Live and planned mirror convex/catalog.ts. */
export const AGENTS_SECTION = {
  id: "agents",
  headline: "Seven specialists across the customer journey.",
  lead: "Vistrial groups its agents by where they help: Attract, Convert, Keep. Growth Architect is live today. The others are planned and do not run yet.",
  departments: [
    {
      id: "attract",
      name: "Attract",
      agents: [
        { number: "01", name: "Growth Architect", job: "Research, offers, diagnosis, creative, and landing pages.", live: true },
        { number: "02", name: "Campaign Execution", job: "Approved launches, testing, and reporting.", live: false },
      ],
    },
    {
      id: "convert",
      name: "Convert",
      agents: [{ number: "03", name: "Sales Conversion", job: "Qualification, follow-up drafts, and pipeline.", live: false }],
    },
    {
      id: "keep",
      name: "Keep",
      agents: [
        { number: "04", name: "Activation", job: "Onboarding and first value.", live: false },
        { number: "05", name: "Retention", job: "Customer health and save plans.", live: false },
        { number: "06", name: "Expansion", job: "Upsell, referrals, and account growth.", live: false },
      ],
    },
    {
      id: "run",
      name: "Across all three",
      agents: [{ number: "07", name: "Operations Intelligence", job: "Briefings, reporting, and coordination.", live: false }],
    },
  ],
  liveLabel: "Live",
  plannedLabel: "Planned",
} as const;

/** Who Vistrial is for. Each line names work an available skill does today. */
export const INDUSTRIES = {
  id: "industries",
  headline: "Built for agencies, consultants, coaches and info sellers.",
  lead: "The same research, pointed at what you sell. Other businesses can request access.",
  cards: [
    {
      id: "agencies",
      title: "Agencies",
      motion: "Retainers and projects sold to clients who compare you with the agency down the road.",
      watches: [
        "What competing agencies lead with: offer, price, and guarantee",
        "Landing pages in a client's industry, section by section",
        "Ad sets for one client brand at a time, from that brand's kit",
        "Reports you can export as a PDF, with a white-label option",
      ],
    },
    {
      id: "consultants",
      title: "Consultants",
      motion: "Expertise sold through proposals, calls, and referrals.",
      watches: [
        "How competing firms frame their offer, and whether they state a price",
        "Which objections their pages answer, and which they skip",
        "Where your own growth stalls, from your own figures",
        "Two or three changes to test, each with a way to tell if it worked",
      ],
    },
    {
      id: "coaches",
      title: "Coaches",
      motion: "Programs sold through content, applications, and calls.",
      watches: [
        "Hooks in the videos and posts you paste links to",
        "Application and booking pages in your niche, section by section",
        "How competing programs frame the investment",
        "Ad variations to test, written to your brand kit",
      ],
    },
    {
      id: "info-sellers",
      title: "Info sellers",
      motion: "Courses, memberships, and programs sold from a page.",
      watches: [
        "Sales pages for competing courses, section by section",
        "The offers competitors lead with, and what yours leaves out",
        "Four copy variations, a video script, and captions for one offer",
        "What changed after a test, measured from your own figures",
      ],
    },
  ],
  closing: "If you sell your expertise and your business is not listed, request access and tell us what you sell.",
} as const;

export const SAFETY = {
  id: "safety",
  headline: "Safe by design",
  lead: "These are product behaviors, not badges.",
  steps: ["Draft", "Your review", "Not published"],
  items: [
    "Nothing is published, posted, or sent without a person's approval.",
    "Research uses official access only: public sources, official APIs, and links you provide. No logins and no getting around blocks.",
    "Every claim is labeled as observed, an inference, an untested hypothesis, or your data, with its source.",
    "Every run has a cost limit, and the cost is shown as it runs.",
    "Each customer's data is separate from every other customer's.",
    "Every important action is recorded.",
  ],
  linkLabel: "Security overview",
  linkHref: "/security",
} as const;

export const FAQ = {
  id: "faq",
  headline: "Frequently asked questions",
  items: [
    {
      q: "What is Growth Architect?",
      a: "The first Vistrial agent, and the only one that runs today. It researches your market, sets your offer beside what competitors lead with, finds where growth stalls from your own figures, reads landing pages in your industry section by section, and drafts ad sets with designed ads. Campaign Strategy and Funnel Architect are not available yet.",
    },
    {
      q: "Where does the research come from?",
      a: "Public web pages, YouTube, TikTok and Instagram links you paste, and public landing pages it reads as VistrialBot. From your side: results files you upload as CSV, and your own Meta ad account through a read-only connection. It does not log in anywhere, and a report names any page it could not read.",
    },
    {
      q: "Can I trust what it says?",
      a: "Every claim is labeled as observed, an inference, an untested hypothesis, or your data, and links to its source. When there is not enough data, it says so instead of guessing. It never claims an ad made money unless your own numbers show it.",
    },
    {
      q: "Will it post or spend on its own?",
      a: "No. Growth Architect produces reports and drafts for review. It does not publish, post, or contact anyone, and its connection to your Meta ad account is read-only.",
    },
    {
      q: "What happens after it recommends something?",
      a: "You pick what to try and when to check back: 14, 30, 60, or 90 days. If your Meta ad account or a results file is connected, your starting figures are saved. At the check-in you record what happened, and the next round of research builds on it.",
    },
    {
      q: "What does it do with my data?",
      a: "Your data is kept separate from every other customer's. Vistrial uses your business profile, research, and results to do your work only. The Security overview describes the controls, and the Privacy Policy explains how information is handled.",
    },
    {
      q: "Who is Private Access for?",
      a: "Agencies, consultants, coaches, and people who sell courses or programs, who want to understand their market before they spend more on it. Access is by request. We bring on a limited number of teams at a time.",
    },
    {
      q: "What happens after I request access?",
      a: "You get a confirmation email. A person on our team reviews every request and replies by email about whether access is available.",
    },
    {
      q: "Can I cancel?",
      a: "Yes. You can cancel anytime from your billing settings, and your access continues through the period you have paid for. Full details are in our Terms of Service.",
    },
  ],
} as const;

export const FINAL_CTA = {
  id: "final",
  headline: "Request access. We review each team.",
  body: "Growth Architect is opening to a limited number of teams at a time, so each one is set up properly.",
  primary: "Request private access",
  secondary: "Contact us about Custom",
  secondaryHref: "/contact",
} as const;

export const PROOF = {
  id: "proof",
  headline: "Hidden until real testimonials, logos, or results are added.",
  body: "No testimonials, logos, or results are shown until you add real ones here.",
} as const;

export const FOOTER = {
  productLine: "AI agents that study your market, draft the changes, and measure what worked.",
  copyright: "Vistrial",
  links: [
    { href: "/security-overview", label: "Security overview" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/contact", label: "Contact" },
  ],
} as const;

export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: HERO.headline,
} as const;

export const THANKS = {
  title: "Request received",
  access:
    "We have your request for Private Access. We will email the address you gave. A person on our team reviews every request and will reply by email. Reply to that email if something needs a correction.",
  custom:
    "We have your note. We will email the address you gave. A person on our team will reply by email to set up a short call about what your team needs. Reply to that email if something needs a correction.",
} as const;

export const NOT_FOUND = {
  title: "That page is not here",
  body: "The link may be old. You can go back to the Vistrial home page.",
  cta: "Back to Vistrial",
} as const;

export const FORMS = {
  accessTitle: "Request private access",
  accessLead: "Tell us enough to review the fit. We read this ourselves. A phone number is not required.",
  customTitle: "Contact us",
  customLead: "For a larger team or a setup that needs a conversation.",
  submitAccess: "Submit request",
  submitCustom: "Send",
  pending: "Sending",
  consent: "I agree to be contacted about this request, and I agree to the",
  privacyHref: "/privacy",
  phoneHelp: "Optional. We will not use this for marketing texts.",
  problemHelp: "Optional. 1000 characters at most.",
  honeypotLabel: "Company website confirm",
  sections: {
    you: "About you",
    business: "Your business",
    selling: "How you grow today",
    more: "Anything else",
    need: "What you need",
  },
  /** The panel beside the forms: what happens after you send. A plan, not a promise of timing. */
  next: {
    title: "What happens next",
    now: "Now",
    next: "Next",
    later: "Then",
    access: [
      { title: "You send this form", body: "It takes a few minutes. A phone number is optional." },
      { title: "A person reads it", body: "We review every request ourselves to check the fit." },
      { title: "We reply by email", body: "If it is a fit, we set up your private workspace with you." },
      { title: "Growth Architect starts", body: "Your first market report is drafted, then waits for your approval." },
    ],
    custom: [
      { title: "You send this form", body: "Tell us what your team needs." },
      { title: "We reply by email", body: "A person on our team sets up a short call." },
      { title: "We plan your setup", body: "Seats, sources, and limits that fit how you work." },
    ],
    sourcesLabel: "Growth Architect researches across",
  },
  errors: {
    required: "This field is required.",
    email: "Enter a work email, like name@company.com.",
    consent: "Check the box to agree to be contacted and to the Privacy Policy and Terms.",
    long: "Keep that to 1000 characters.",
    website: "Enter a website like example.com, or leave it blank.",
    phone: "That phone number is too long.",
    generic: "We could not submit that just now. Try again in a moment.",
    rate: "Please wait a few minutes and try again.",
  },
} as const;

export const EMAIL_DEFAULTS = {
  accessConfirm: {
    id: "access_confirm",
    label: "Private Access confirmation",
    subject: "We received your Private Access request",
    body: "Hi {{name}},\n\nThanks for requesting Private Access to Vistrial.\n\nA person on our team reviews every request and will reply by email.\n\nWe bring on a limited number of teams at a time so each one is set up properly. If your team is a fit, we will walk you through next steps, including guided setup inside your workspace.\n\nIf you want to add anything to your request, just reply to this email.\n\nThe Vistrial team",
  },
  customConfirm: {
    id: "custom_confirm",
    label: "Custom confirmation",
    subject: "We received your request about Vistrial Custom",
    body: "Hi {{name}},\n\nThanks for reaching out about Vistrial Custom.\n\nA person on our team will reply by email to set up a short call about what your team needs.\n\nIf it helps, reply with a few details: your team size, the tools you use today, and how many businesses you manage.\n\nThe Vistrial team",
  },
  declined: {
    id: "declined",
    label: "Declined",
    subject: "About your Vistrial request",
    body: "Hello {{name}},\n\nThank you for asking about Vistrial. We are not able to offer access right now.\n\nYou can reply to this email if your situation changes.\n\nVistrial",
  },
  waitlisted: {
    id: "waitlisted",
    label: "Waitlisted",
    subject: "You're on the Vistrial waitlist",
    body: "Hi {{name}},\n\nThanks for your interest in Vistrial. We bring on a limited number of teams at a time, and we are not able to bring your team on just yet.\n\nWe will email you when we can bring your team on. Your request stays on file for up to 12 months.\n\nIf anything changes on your side, reply to this email.\n\nThe Vistrial team",
  },
} as const;

/**
 * Factual statements on the public page, and the product behavior behind each.
 * Review this before launch. If a row is wrong, change the copy, not the claim.
 */
export const CLAIMS: Array<{ statement: string; support: string }> = [
  {
    statement: "Growth Architect is the one agent that runs today. The other six are planned.",
    support: "convex/catalog.ts: Growth Architect has status live. The six other agents have status planned and the promise \"It does not run yet.\"",
  },
  {
    statement: "Five Growth Architect skills are available: Market Intelligence, Offer Intelligence, Growth Diagnostics, Creative Production, and Landing Page Teardown. Campaign Strategy and Funnel Architect are coming soon.",
    support: "convex/catalog.ts AVAILABLE_SKILLS lists those five slugs. Every other skill in the catalog is comingSoon. content.test.ts compares this page with that list.",
  },
  {
    statement: "Creative Production hands back a brief, four copy variations, a video script, and captions for one brand, with designed ads on request.",
    support: "convex/catalog.ts describes the ad set in those words. Designed ads are an add-on to an ad set (convex/creativeImages.ts), charged per image.",
  },
  {
    statement: "Research reads public web pages, YouTube, TikTok and Instagram links you paste, and public landing pages.",
    support: "convex/adapters: web search and fetch, YouTube search, and link previews for TikTok and Instagram (neither is searched). The page reader (docs/rebuild/page-reader.md) reads public pages as VistrialBot. Meta's Ad Library is not listed because Vistrial has no working access to it today.",
  },
  {
    statement: "You can add your own figures: results files as CSV, and your Meta ad account through a read-only connection.",
    support: "convex/resultUploads.ts reads a CSV and keeps totals. The Meta connection asks for ads_read only and never creates, edits, pauses, or funds anything (docs/rebuild/meta-ads-connection.md).",
  },
  {
    statement: "Research uses no logins and does not get around blocks.",
    support: "The /bot page and docs/rebuild/page-reader.md: VistrialBot follows robots.txt, does not log in or solve CAPTCHAs, and stops when a site refuses. Account access (docs/rebuild/browser-with-approval.md) is a design with a dry-run screen only.",
  },
  {
    statement: "Every claim is labeled Observed, Inference, Untested hypothesis, Your data, or Not enough data.",
    support: "convex/lib/evidence.ts sets those five labels in code, not by the model.",
  },
  {
    statement: "Nothing is published, posted, or sent without a person's approval.",
    support: "Assets stay drafts until a person approves them (convex/lib/assetStatus.ts). The product has no publish or send action to an outside channel. The only email it sends goes to the workspace's own owners and managers.",
  },
  {
    statement: "You pick what to try, set a check-in at 14, 30, 60, or 90 days, and record what happened.",
    support: "convex/decisions.ts: a decision stores the check-in date and starting figures from the business's Meta results and results files, then the outcome. Check-in reminder emails are in convex/emailReminders.ts.",
  },
  {
    statement: "Every run has a cost limit, and the cost is shown as it runs.",
    support: "convex/lib/caps.ts sets a cap per run and per day. The run screen shows \"Spent x of cap\" while it works.",
  },
  {
    statement: "Each customer's data is separate.",
    support: "Every workspace query and mutation checks membership first (convex/lib/builders.ts). convex/isolation.test.ts proves another workspace gets not-found.",
  },
  {
    statement: "Every important action is recorded.",
    support: "convex/lib/audit.ts writes an audit row for approvals, decisions, connections, and staff access.",
  },
  {
    statement: "Private Access is $179 per month with $150 of credits included. Included credits reset each month.",
    support: "convex/lib/billing.ts PLAN: 17900 cents, 15000 cents included. The Terms of Service state the same price and that included credits do not carry over.",
  },
  {
    statement: "Nothing is charged on this site.",
    support: "The public pages have no checkout. PRICING_DISPLAY is display copy and is not connected to billing.",
  },
  {
    statement: "You can cancel anytime and keep access through the period you have paid for.",
    support: "Terms of Service, cancellation: cancelling stops the next renewal and access continues to the end of the paid period.",
  },
  {
    statement: "We bring on a limited number of teams at a time.",
    support: "Access is by request and every request is reviewed by a person before a workspace is set up.",
  },
];
