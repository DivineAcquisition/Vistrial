/**
 * Landing copy. Written deliberately in the page brief — do not punch up,
 * do not add exclamation marks, do not invent proof.
 */

export const SITE_DESCRIPTION =
  "Sits on top of LeadConnector. Vistrial is a case-file layer: every lead gets a readiness score, full contact history, what was said on the last call, and follow-up written from it. Nothing to migrate.";

export const HERO = {
  headline: "Give every closer the file before the call.",
  /** The phrase that carries the gradient. Visual only — the headline is unchanged. */
  headlineAccent: "before the call.",
  /** Taken from SITE_DESCRIPTION — not a new claim. */
  eyebrow: "Sits on top of LeadConnector",
  subhead: SITE_DESCRIPTION,
  primaryCta: "Request access",
  secondaryCta: "See the product",
  underCta: "Private software. Access is waitlist only.",
} as const;

export const PROBLEM = {
  headline: "Leads stall where context is missing.",
  points: [
    {
      lead: "Touches are not a system.",
      rest: "So leads get contacted twice, or never.",
    },
    {
      lead: "Call context never reaches the next screen.",
      rest: "A name, a calendar invite, and three form answers.",
    },
    {
      lead: "Objections get re-litigated.",
      rest: "What the prospect already said on call one dies in a recording nobody reopens.",
    },
  ],
  closing: "Every one of those is a lead you already paid for.",
} as const;

export const CASE_FILE = {
  headline: "One file per lead. Everything known, in one place.",
  parts: [
    {
      id: "readiness",
      title: "How ready they are",
      body: "how close they are to buying, scored on timeline, budget, authority, and pain. Weighted for your offer, not a generic template.",
    },
    {
      id: "touches",
      title: "Contact history",
      body: "every message, call, and reply, with who and when. Waiting time measured, not assumed.",
    },
    {
      id: "transcripts",
      title: "Call transcripts, structured",
      body: "what they said about budget, timeline, and who else decides, pulled out and put where your closer will see it.",
    },
    {
      id: "objections",
      title: "Open objections",
      body: "verbatim, carried across calls, so nobody handles the same one twice.",
    },
    {
      id: "brief",
      title: "The pre-call brief",
      body: "one screen your closer reads in the two minutes before they dial.",
    },
    {
      id: "follow-up",
      title: "Follow-up drafts",
      body: "written from what was actually said, in your voice. Your team approves before anything sends.",
    },
  ],
} as const;

export const MOMENTS = {
  headline: "Where it sits in the workflow.",
  items: [
    {
      title: "Before the first touch",
      body: "Leads sort by readiness, not arrival time. Anyone waiting past your response window shows up in an alarm that cannot be dismissed until someone actually works them.",
    },
    {
      title: "Before the call",
      body: "Your closer opens one screen: who this is, where they came from, what the setter established, what they have already objected to, and what they said in their own words.",
    },
    {
      title: "After the call",
      body: "The transcript becomes structure. The lead re-scores on what was actually said. Follow-up drafts itself from the real conversation, and a human approves it before it goes.",
    },
  ],
} as const;

export const OUTCOME = {
  headline: "The number we track is clients closed per hundred leads.",
  body: "Not opens. Not replies. Not activity. Vistrial measures how many leads turned into clients before it was installed and how many after, from your own history. You see the same number we do.",
  lines: [
    "Coverage: what percentage of your leads ever got a human touch",
    "Speed: how fast, actually, versus how fast you think",
    "Where deals die: never touched, no-show, ghosted after one call, objection unresolved",
  ],
  honesty:
    "We do not make the calls. Your team does. Vistrial makes sure every lead gets worked, and that whoever works it knows what they are walking into.",
} as const;

export const CRM = {
  headline: "It runs on the CRM you already have.",
  body: "LeadConnector stays your system of record. Your conversations, your calendar, your pipeline, your automations: unchanged. Vistrial reads from it, adds the layer it does not have, and sends through it. One click to connect. Nothing to migrate, nothing to rebuild, nothing to retrain your team on from scratch.",
  listingLive: "Open the LeadConnector Marketplace listing",
} as const;

export const AUDIT = {
  headline: "Find out what you are leaking.",
  body: "Thirty minutes. We connect to your LeadConnector, pull the last twelve months, and show you: how many leads never got a human touch, your real median response time, how many went quiet after one call, and what that is worth at your close rate and price point.",
  keep: "You keep the report either way.",
  cta: "Book the audit",
  underCta: "No deck, no slides, just your numbers.",
} as const;

export const WAITLIST = {
  headline: "Request access.",
  body: "Vistrial is not generally available. Join the waitlist. We email when a seat opens.",
  cta: "Request access",
  underCta: "A name and an email. Nothing else.",
  submit: "Request access",
  pending: "Joining",
  sent: "You are on the list. We will email the address you gave when a seat opens.",
  nameLabel: "Name",
  emailLabel: "Work email",
  notFor:
    "Not for businesses under roughly $8K a month, anything that closes without a conversation, or lead volume small enough to work by memory.",
} as const;

export const BOOK = {
  eyebrow: "Lead Leak Audit",
  title: "A few questions, then you pick a time.",
  description:
    "Thirty minutes. We pull your own numbers from LeadConnector. No pitch deck.",
  submit: "Continue to the calendar",
  pending: "Submitting",
} as const;

export const CALENDAR = {
  eyebrow: "Lead Leak Audit",
  title: "Pick a time.",
  description:
    "The slot is 30 minutes. We will be looking at your numbers, not a slide deck.",
  missing:
    "The calendar is not connected on this deployment yet. Your answers were recorded. Email us and we will send a time.",
} as const;

export const CONTACT_PAGE = {
  title: "Contact",
  description: "A question about Vistrial. We read every one.",
  submit: "Send",
  pending: "Sending",
  sent: "Received. We will reply to the address you gave.",
} as const;

export const FOOTER = {
  productLine: "Vistrial, a Divine Acquisition product.",
  product: "Product",
  company: "Company",
  legal: "Legal",
} as const;

export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: HERO.headline,
} as const;

export const NAV = {
  waitlist: "Request access",
  book: "Book the audit",
  skipToContent: "Skip to content",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  sections: [
    { href: "#case-file", label: "Product" },
    { href: "#moments", label: "Workflow" },
  ],
} as const;
