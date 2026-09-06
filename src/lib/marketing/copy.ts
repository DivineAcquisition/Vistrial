/**
 * Landing copy. Written deliberately in the page brief — do not punch up,
 * do not add exclamation marks, do not invent proof.
 * No named CRM, platform, or industry.
 */

export const SITE_DESCRIPTION =
  "Vistrial makes sure no lead sits untouched and no closer walks into a call blind. Built for sales teams selling something worth a conversation.";

export const HERO = {
  headline: "Every lead gets worked. Every call gets remembered.",
  /** The phrase that carries the gradient. Visual only — the headline is unchanged. */
  headlineAccent: "Every call gets remembered.",
  eyebrow: "Lead Leak Audit",
  subhead: SITE_DESCRIPTION,
  primaryCta: "Get your free Lead Leak Audit",
  secondaryCta: "See how it works",
  underCta: "30 minutes. We look at your own numbers. No pitch deck.",
} as const;

export const PROBLEM = {
  headline: "The leads are fine. What happens after isn't.",
  points: [
    {
      lead: "Nobody knows who was contacted, or when.",
      rest: "So leads get called twice, or never.",
    },
    {
      lead: "Your team walks into calls with nothing.",
      rest: "A name and a calendar invite.",
    },
    {
      lead: "What was said last time is gone.",
      rest: "Objections get raised, handled, then raised again on the next call because nobody remembers.",
    },
  ],
  closing: "Every one of those is a lead you already paid for.",
} as const;

/**
 * Sample-file chrome for the product mock. Not a landing-page feature list.
 */
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

export const WHAT_IT_DOES = {
  headline: "One system that tracks who to call, what to say, and what happened.",
  items: [
    {
      id: "never-miss",
      title: "Never miss one.",
      body: "The moment someone comes in, they're in line to be contacted — ranked by how ready they are, not by when they arrived. If someone's been waiting too long, it shows, and it doesn't go away until someone handles it.",
    },
    {
      id: "know-who",
      title: "Know who you're calling.",
      body: "Before a call, your team sees what matters: who this is, what they've already said no to, and what happened last time. No digging through notes.",
    },
    {
      id: "nothing-forgotten",
      title: "Nothing gets forgotten.",
      body: "Every conversation, every follow-up, every objection — held in one place instead of scattered across memory and message threads.",
    },
  ],
} as const;

export const TOOLS = {
  headline: "It works with the tools you already use.",
  body: "Vistrial connects to your existing systems: your CRM, your calendar, your call recordings. Nothing to migrate, nothing to rebuild, nothing your team has to relearn. Connect once, and it runs quietly in the background from there.",
  chips: ["Your CRM", "Your calendar", "Your call recordings"],
} as const;

export const OUTCOME = {
  headline: "We track one number: how many of your leads become clients.",
  body: "Before Vistrial and after, from your own history. Not opens, not replies, not activity — clients. You see the same number we do.",
  lines: [
    "How many leads actually got a human response, and how fast",
    "Where deals are dying, and why",
    "What your team is missing that's costing you closes",
  ],
  honesty:
    "We don't make the calls. Your team does. Vistrial makes sure every lead gets worked, and that whoever works it knows what they're walking into.",
} as const;

export const WHO = {
  headline: "Built for teams that sell on a conversation.",
  body: "If closing a deal takes a real conversation, not just a checkout page, Vistrial fits. Sales teams, client-facing businesses, anyone whose leads deserve more than a generic follow-up.",
  notForLabel: "Who it's not for",
  notFor:
    "If your product sells itself with no call involved, or your lead volume is small enough to track from memory, you don't need this yet.",
} as const;

export const AUDIT = {
  headline: "Find out what you're leaking.",
  body: "Thirty minutes. We look at your own numbers and show you: how many leads never got a response, your real response time, and what a slow follow-up is actually costing you.",
  keep: "You keep the findings either way.",
  cta: "Book the audit",
  underCta: "No deck, no slides, just your numbers.",
} as const;

export const FAQ = {
  headline: "FAQ",
  items: [
    {
      q: "Do I have to change how my team works?",
      a: "No. It layers on top of what you already use.",
    },
    {
      q: "Does it message people automatically?",
      a: "It drafts. A person on your team approves every message before it goes out. Nothing sends on its own.",
    },
    {
      q: "What if we don't record calls?",
      a: "Everything else still works. Recording adds more, but it isn't required.",
    },
    {
      q: "How long to get running?",
      a: "Connecting takes minutes. Getting your team using it well takes days, not weeks.",
    },
    {
      q: "Who is this not for?",
      a: "Anyone selling something that closes without a conversation, or working small enough volume to track by memory.",
    },
  ],
} as const;

/** Marketplace listing chrome — not shown on the public landing. */
export const CRM = {
  listingLive: "Open the marketplace listing",
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
} as const;

export const BOOK = {
  eyebrow: "Lead Leak Audit",
  title: "A few questions, then you pick a time.",
  description: "Thirty minutes. We look at your own numbers. No pitch deck.",
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
  book: "Book the audit",
  skipToContent: "Skip to content",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  sections: [
    { href: "#what-it-does", label: "What it does" },
    { href: "#who", label: "Who it's for" },
    { href: "#faq", label: "FAQ" },
  ],
} as const;
