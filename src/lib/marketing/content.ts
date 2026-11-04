/**
 * Public page copy. One source for the landing page, pricing, forms, and
 * supporting pages. Layout code reads this file and does not own sentences.
 *
 * Legal pages are drafts for qualified counsel, not final text.
 *
 * Display prices are not connected to billing.
 */

import { AGENTS } from "@/lib/agents/roster";
import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

export const SITE_DESCRIPTION =
  "Vistrial is an agentic workforce for business growth: specialized AI agents that research your market, sharpen your strategy, and produce the work to grow, with evidence on every claim and a person approving every step.";

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

export const HERO = {
  /** Chosen draft. The other options are in HEADLINE_OPTIONS for review. */
  headline: "The agentic workforce for business growth.",
  supporting:
    "Specialized AI agents that research your market, sharpen your strategy, and produce the work to grow. Starting with Growth Architect.",
  primaryCta: "Request private access",
  secondaryCta: "See Growth Architect",
  trust: "Every claim shows its source. Nothing is published without a person's approval. Each customer's data is kept separate.",
  exampleLabel: "Example with sample data",
} as const;

export const HEADLINE_OPTIONS = [
  "The agentic workforce for business growth.",
  "Understand your market before you spend on it.",
  "Specialists for every stage of growth. Starting with research.",
] as const;

export const NAV = {
  skipToContent: "Skip to content",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  signIn: "Sign in",
  signInHref: `${PRODUCTION_APP_ORIGIN}/login`,
  request: "Request private access",
  links: [
    { href: "/#how", label: "How it works" },
    { href: "/#growth-architect", label: "Growth Architect" },
    { href: "/#agents", label: "Agents" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#faq", label: "FAQ" },
  ],
} as const;

export const SOURCES = {
  label: "Researches across",
  items: [
    { key: "web", label: "The open web" },
    { key: "youtube", label: "YouTube" },
    { key: "meta", label: "Meta Ad Library" },
    { key: "tiktok", label: "TikTok" },
    { key: "instagram", label: "Instagram" },
    { key: "results", label: "Your own results" },
  ],
} as const;

export const PROBLEM = {
  id: "problem",
  headline: "Most growth starts with a guess.",
  opening:
    "Businesses launch ads, publish content, and raise spend before they understand the market they are trying to move.",
  scattered:
    "Competitor research lives in browser tabs and screenshots. Strategy sits in one document and the creative in another. When a campaign works, nobody can say why. When it fails, nobody can say which assumption was wrong.",
  pains: [
    "We copy what competitors seem to do without knowing whether it works.",
    "Research, strategy, and creative live in different places and drift apart.",
    "AI tools give confident answers with no sources behind them.",
    "We spend before we know which audience or angle to test first.",
  ],
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
      body: "Turn the chosen strategy into real work: reports, copy, scripts, creative briefs, and landing pages.",
    },
    {
      id: "validate",
      title: "Validate",
      body: "Read your own results, learn what held up, and feed it into the next round of research.",
    },
  ],
} as const;

export const GROWTH_ARCHITECT = {
  id: "growth-architect",
  eyebrow: "Agent 01",
  headline: "Growth Architect",
  lead: "One agent for market research, strategy, creative, and funnels. Each skill hands back finished work that the next skill builds on.",
  skills: [
    {
      id: "market-intelligence",
      name: "Market Intelligence",
      handsBack: "Market reports and a visual research board of the ads and videos it found.",
      status: "first" as const,
    },
    {
      id: "offer-intelligence",
      name: "Offer Intelligence",
      handsBack: "Ideal customer profiles, positioning, and messaging.",
      status: "next" as const,
    },
    {
      id: "campaign-strategy",
      name: "Campaign Strategy",
      handsBack: "Campaign blueprints, ad angles, and testing plans.",
      status: "next" as const,
    },
    {
      id: "creative-production",
      name: "Creative Production",
      handsBack: "Ad copy, video scripts, creative briefs, and content packages.",
      status: "next" as const,
    },
    {
      id: "funnel-architect",
      name: "Funnel Architect",
      handsBack: "Funnel blueprints, landing page copy, and page drafts.",
      status: "next" as const,
    },
    {
      id: "growth-diagnostics",
      name: "Growth Diagnostics",
      handsBack: "Performance analysis and a prioritized improvement plan from your own data.",
      status: "next" as const,
    },
  ],
  statusLabel: { first: "Available first", next: "Coming next" },
} as const;

export const EVIDENCE = {
  id: "evidence",
  headline: "Every claim shows its source.",
  lead: "Growth Architect labels how much it knows. Popular is not the same as profitable, and a long-running ad is not proof that it worked.",
  kinds: [
    { id: "observed", label: "Observed", body: "Seen directly in a source you can open." },
    { id: "inferred", label: "Inferred", body: "A reasonable reading of what was seen." },
    { id: "hypothesis", label: "Hypothesis", body: "An idea to test, never presented as fact." },
    { id: "firstParty", label: "Your results", body: "Backed by your own measured data." },
    { id: "insufficient", label: "Not enough data", body: "Said plainly instead of guessed." },
  ],
} as const;

export const AGENTS_SECTION = {
  id: "agents",
  headline: "Seven specialists. One organization.",
  lead: "Vistrial grows into a workforce across the customer lifecycle. Every agent shares the same context, evidence, and approvals. We start with one, and build it properly.",
  departments: [
    {
      id: "growth",
      name: "Growth and Marketing",
      agents: [
        { number: "01", name: "Growth Architect", job: "Research, strategy, creative, and funnels.", live: true },
        { number: "02", name: "Campaign Execution", job: "Approved launches, testing, and reporting.", live: false },
      ],
    },
    {
      id: "sales",
      name: "Sales",
      agents: [{ number: "03", name: "Sales Conversion", job: "Qualification, follow-up drafts, and pipeline.", live: false }],
    },
    {
      id: "success",
      name: "Customer Success",
      agents: [
        { number: "04", name: "Activation", job: "Onboarding and first value.", live: false },
        { number: "05", name: "Retention", job: "Customer health and save plans.", live: false },
        { number: "06", name: "Expansion", job: "Upsell, referrals, and account growth.", live: false },
      ],
    },
    {
      id: "operations",
      name: "Operations",
      agents: [{ number: "07", name: "Operations Intelligence", job: "Briefings, reporting, and coordination.", live: false }],
    },
  ],
  liveLabel: "Live",
  plannedLabel: "Planned",
} as const;

export const INDUSTRIES = {
  id: "industries",
  headline: "Built for businesses that sell considered purchases.",
  lead: "Growth Architect already knows what to look for in these markets. Other businesses can request access.",
  cards: [
    {
      id: "med-spa",
      title: "Aesthetic and medical spa",
      motion: "Treatments and consultations sold to a local market that compares carefully.",
      watches: [
        "What competitors in your area advertise, and for how long",
        "Which treatments and offers they lead with",
        "How they frame price and financing",
        "Before-and-after formats that keep running",
      ],
    },
    {
      id: "home-services",
      title: "Home services and remodeling",
      motion: "Projects with long decisions, estimates, and seasonal demand.",
      watches: [
        "Seasonal offers local competitors run",
        "Guarantee, warranty, and financing messages",
        "Themes customers repeat in public reviews",
        "The landing pages behind local ads",
      ],
    },
    {
      id: "coaches-consultants",
      title: "Coaches and consultants",
      motion: "Programs sold through content, applications, and calls.",
      watches: [
        "Short-form hooks that keep getting reused",
        "Webinar, application, and booking funnels",
        "How competitors frame the investment",
        "Proof and testimonial patterns",
      ],
    },
  ],
  closing: "If you sell a considered purchase and your industry is not listed, request access and tell us what you sell.",
} as const;

export const SAFETY = {
  id: "safety",
  headline: "Safe by design",
  lead: "These are product behaviors, not badges.",
  steps: ["Draft", "Your review", "Not published"],
  items: [
    "Nothing is published, posted, or sent without a person's approval.",
    "Research uses official access only: public sources, official APIs, and links you provide. No logins and no getting around blocks.",
    "Every claim is labeled as observed, inferred, a hypothesis, or your own result, with its source.",
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
      a: "The first Vistrial agent. It researches your market, competitors, and the ads and content that keep running, then turns that into strategy, creative, and funnels. Market Intelligence comes first, and the other skills follow one at a time.",
    },
    {
      q: "Where does the research come from?",
      a: "Public web pages, YouTube, Meta's Ad Library where it is available, TikTok and Instagram posts it finds or you provide, and your own results if you upload them. It uses official access only, and every source shows whether it was available.",
    },
    {
      q: "Can I trust what it says?",
      a: "Every claim is labeled as observed, inferred, a hypothesis, or backed by your own results, and links to its source. When there is not enough data, it says so instead of guessing. It never claims an ad made money unless your own numbers show it.",
    },
    {
      q: "Will it post or spend on its own?",
      a: "No. Growth Architect produces reports and assets for review. Nothing is published, posted, sent, or charged to an ad account without a person's approval.",
    },
    {
      q: "What does it do with my data?",
      a: "Each workspace is separate. Vistrial uses your business profile, research, and results to do the work for that workspace only. The Security overview describes the controls. The Privacy page is a draft for counsel and is not a finished policy.",
    },
    {
      q: "Who is Private Access for?",
      a: "Businesses that sell considered purchases and want to understand their market before they spend more on it. We bring on a limited number of teams at a time.",
    },
    {
      q: "What happens after I request access?",
      a: "We review the request. You get a confirmation email, and a person replies about whether access is available. A person on our team reviews every request and will reply by email.",
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
  productLine: "The agentic workforce for business growth.",
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

export const EXAMPLE = {
  lead: "Jordan Hale",
  business: "Northline Aesthetics",
  sources: ["CRM record", "Recorded call", "Calendar booking", "Follow-up note"],
  summary:
    "Asked for a consultation, raised price and timing on the call, and booked Thursday. The follow-up draft is waiting for a person.",
  draft:
    "Hi Jordan, following up on the consultation. We can hold the Thursday time we discussed if you still want it.",
  draftStatus: "Waiting for a person to approve. Nothing has been sent.",
  steps: [
    { agent: "sentry" as const, line: `${AGENTS.sentry.name}, ${AGENTS.sentry.sublabel}, noticed this lead waiting past the team's standard.` },
    { agent: "scribe" as const, line: `${AGENTS.scribe.name}, ${AGENTS.scribe.sublabel}, updated the case file from the call.` },
    { agent: "relay" as const, line: `${AGENTS.relay.name}, ${AGENTS.relay.sublabel}, prepared a draft. It waits for approval.` },
  ],
} as const;

export const SECURITY_PAGE = {
  title: "Security overview",
  description: "How Vistrial separates customer data, gates sending, and records important actions.",
  draft: "Draft for review. This page describes controls that exist in the product today. It is not a certification, an audit report, or a compliance claim. Align it with the governance notes when those are final.",
  sections: [
    {
      heading: "Separate workspaces",
      body: "Each customer's leads, calls, and settings live in their own workspace. A person in one workspace cannot read another customer's workspace. Staff access is a separate role, not a shared customer login.",
    },
    {
      heading: "Approval before anything is sent",
      body: "Follow-ups are drafts until a person approves them. At the moment of sending, opt-out, do-not-contact, and related checks run again.",
    },
    {
      heading: "Quiet hours",
      body: "The default quiet hours are 8 pm to 8 am in the lead's local time. Messages wait until quiet hours end.",
    },
    {
      heading: "A record of important actions",
      body: "Status changes, approvals, and staff actions are written down with who did them and when.",
    },
    {
      heading: "Credentials",
      body: "Connection secrets are stored for the workspace that connected them and are not shown on this public page. Vistrial does not ask you to paste a password into this marketing site.",
    },
  ],
} as const;

export const LEGAL_DRAFT_BANNER =
  "Draft for review by qualified counsel. This is not final legal text. Do not treat it as the policy or the terms.";

export const PRIVACY_PAGE = {
  title: "Privacy",
  description: "A placeholder structure for the privacy text counsel will provide.",
  sections: [
    {
      heading: "What this site collects",
      body: "The access form collects the name, work email, business, and answers the visitor types. A phone number is optional. The form also stores the time, the page it came from, and campaign parameters when they are present.",
    },
    {
      heading: "Why",
      body: "The purpose is to review a request for Private Access or a Custom conversation, and to reply about that request.",
    },
    {
      heading: "Who receives it",
      body: "Platform Admins can review requests. Service Team can see them only when a Platform Admin grants that. Request data is not copied into a customer workspace except the fields needed to start onboarding, and only when a Platform Admin converts the request.",
    },
    {
      heading: "How long it is kept",
      body: "Access requests that are declined or inactive are kept for 12 months, then deleted. This is our current default.",
    },
    {
      heading: "How to ask for deletion",
      body: "Email contact@vistrial.io and ask for the request to be deleted. A Platform Admin can delete it, and the deletion is recorded.",
    },
    {
      heading: "Contact",
      body: "For privacy questions or requests, email contact@vistrial.io.",
    },
  ],
} as const;

export const TERMS_PAGE = {
  title: "Terms",
  description: "A placeholder for the terms counsel will provide.",
  body: "No contract term, setup fee, or guarantee is stated on this placeholder. The Terms of Service page is the draft visitors read.",
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
    statement: "One case file per lead, kept up to date from CRM, phone, calendar, and call recordings.",
    support: "Case files are built by Scribe from calls and notes. GoHighLevel syncs CRM records. Calendar and transcript connections exist. Phone activity that reaches the CRM is part of the touch history.",
  },
  {
    statement: "Vistrial does not replace the CRM, the dialer, or the team.",
    support: "The product is a layer on the CRM. People still qualify, book, and close. Compass and Relay cannot send on their own.",
  },
  {
    statement: "Nothing is sent without a person's approval, and checks run again at send time.",
    support: "Relay drafts wait for approval. The approval gate rechecks opt-out, do-not-contact, a reply, and expiry when the action is performed.",
  },
  {
    statement: "Quiet hours are 8 pm to 8 am in the lead's local time.",
    support: "Launch compliance defaults set quiet hours on that window with basis lead_local. Sending waits until quiet hours end.",
  },
  {
    statement: "Opt-outs and do-not-contact markers are respected.",
    support: "Compliance rules stop messages on opt-out words. The send-time recheck includes opted_out and do_not_contact.",
  },
  {
    statement: "Each customer's data is separate.",
    support: "Workspace row-level security isolates leads, calls, and settings by organization.",
  },
  {
    statement: "The CRM is not written unless you choose.",
    support: "The CRM connection is optional. Writes that reach a lead go through the approval gate. Scribe's promise is that it does not change the CRM.",
  },
  {
    statement: "Important actions are recorded.",
    support: "Approval changes, workspace activity, and staff actions write an audit row with actor and time.",
  },
  {
    statement: `${AGENTS.sentry.name} watches response time and alerts the team. It does not message leads.`,
    support: `${AGENTS.sentry.name}, ${AGENTS.sentry.sublabel}. ${AGENTS.sentry.description}`,
  },
  {
    statement: `${AGENTS.scribe.name} builds the case file and does not contact a lead.`,
    support: `${AGENTS.scribe.name}, ${AGENTS.scribe.sublabel}. ${AGENTS.scribe.description}`,
  },
  {
    statement: `${AGENTS.relay.name} drafts follow-ups and does not send them.`,
    support: `${AGENTS.relay.name}, ${AGENTS.relay.sublabel}. ${AGENTS.relay.description}`,
  },
  {
    statement: `${AGENTS.compass.name}, ${AGENTS.compass.sublabel}, answers from the workspace's own data and does not invent numbers.`,
    support: "Compass instructions require every number to come from a lookup result and forbid estimates.",
  },
  {
    statement: "GoHighLevel works today. Other CRMs are coming.",
    support: "The integration hub connects GoHighLevel. No other CRM connector is on that hub.",
  },
  {
    statement: "Private Access starts at $97 per month. The page does not charge anyone.",
    support: "The price is display copy in the pricing configuration. The public pages do not take payment.",
  },
];
