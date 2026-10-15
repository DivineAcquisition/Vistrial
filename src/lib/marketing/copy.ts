/**
 * Public copy entry. The landing page, pricing, forms, and legal drafts live
 * in content.ts. This file re-exports them and keeps the older booking copy
 * so /book still has words. The new landing does not link to that booking.
 */

export {
  FAQ,
  FOOTER,
  HERO,
  NAV,
  SITE_DESCRIPTION,
  SOCIAL_IMAGE,
} from "@/lib/marketing/content";

export const CASE_FILE = {
  headline: "One file per lead. Everything known, in one place.",
  parts: [
    { id: "readiness", title: "How ready they are", body: "how close they are to buying, from the conversation." },
    { id: "touches", title: "Contact history", body: "every message, call, and reply, with who and when." },
    { id: "transcripts", title: "Call transcripts, structured", body: "what they said, put where the closer will see it." },
    { id: "objections", title: "Open objections", body: "carried across calls, so nobody handles the same one twice." },
    { id: "brief", title: "The pre-call brief", body: "one screen before the call." },
    { id: "follow-up", title: "Follow-up drafts", body: "written from what was said. A person approves before anything sends." },
  ],
} as const;

export const PROBLEM = {
  headline: "The leads are fine. What happens after isn't.",
  points: [
    { lead: "Nobody knows who was contacted, or when.", rest: "So leads get called twice, or never." },
    { lead: "Your team walks into calls with nothing.", rest: "A name and a calendar invite." },
    { lead: "What was said last time is gone.", rest: "Objections get raised again because nobody remembers." },
  ],
  closing: "Every one of those is a lead you already paid for.",
} as const;

export const WHAT_IT_DOES = {
  headline: "One system that tracks who to call, what to say, and what happened.",
  items: [
    { id: "never-miss", anchor: "queue", title: "Watch the wait.", body: "If someone has been waiting too long, it shows." },
    { id: "know-who", anchor: "call-intelligence", title: "Know who you are calling.", body: "The case file is there before the call." },
    { id: "nothing-forgotten", anchor: "follow-up", title: "Nothing sits only in memory.", body: "The follow-up is drafted for a person to approve." },
  ],
} as const;

export const TOOLS = {
  headline: "It works with the tools you already use.",
  body: "Connect the CRM, the calendar, and call recordings you already have.",
  chips: ["Your CRM", "Your calendar", "Your call recordings"],
} as const;

export const OUTCOME = {
  headline: "See which leads got a response, and how fast.",
  body: "The figures come from your own history.",
  lines: [
    { id: "coverage", title: "How many leads got a human response, and how fast" },
    { id: "where-deals-die", title: "Where deals are stalling, and why" },
    { id: "missing", title: "What is waiting on a person" },
  ],
  honesty: "We do not make the calls. Your team does.",
} as const;

export const WHO = {
  headline: "Built for teams that sell on a conversation.",
  body: "If closing takes a real conversation, this is the record of that work.",
  notForLabel: "Who it is not for",
  notFor: "If the sale closes with no conversation, this is not the right fit.",
} as const;

export const AUDIT = {
  headline: "A look at your own leads.",
  body: "This older booking page is still here. The public landing now asks for Private Access instead.",
  keep: "You keep whatever you already sent.",
  cta: "Continue",
  underCta: "No deck.",
} as const;

export const WAITLIST = {
  headline: "Request access.",
  body: "Use the Private Access form.",
  cta: "Request access",
  underCta: "Name, work email, and a few questions about the business.",
  submit: "Request access",
  pending: "Sending",
  sent: "Received. We will email the address you gave.",
  nameLabel: "Name",
  emailLabel: "Work email",
} as const;

export const BOOK = {
  eyebrow: "Access",
  title: "A few questions, then you pick a time.",
  description: "This page is the older booking form. New requests use Private Access.",
  submit: "Continue to the calendar",
  pending: "Submitting",
} as const;

export const CALENDAR = {
  eyebrow: "Access",
  title: "Pick a time.",
  description: "The slot is 30 minutes.",
  missing: "The calendar is not connected on this deployment yet. Your answers were recorded. Email us and we will send a time.",
} as const;

export const CONTACT_PAGE = {
  title: "Contact",
  description: "A question about a Custom setup.",
  submit: "Send",
  pending: "Sending",
  sent: "Received. We will reply to the address you gave.",
} as const;

export const CRM = {
  listingLive: "Open the marketplace listing",
} as const;
