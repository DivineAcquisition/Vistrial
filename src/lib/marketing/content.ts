/**
 * Public page copy. One source for the landing page, pricing, forms, and
 * supporting pages. Layout code reads this file and does not own sentences.
 *
 * Strings marked [CONFIRM] are drafts for the operator to replace before
 * launch. Legal pages are drafts for qualified counsel, not final text.
 *
 * Display prices are not connected to billing.
 */

import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

export const SITE_DESCRIPTION =
  "Vistrial pulls the calls, touches, and outcomes scattered across your CRM, phone, and calendar into one case file for every lead, and alerts you before a high-value lead slips.";

export const SECTIONS = {
  hero: true,
  problem: true,
  how: true,
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
  /** Chosen draft. The other two options are in HEADLINE_OPTIONS for review. */
  headline: "The acquisition record for high-ticket sales teams.",
  supporting: SITE_DESCRIPTION,
  primaryCta: "Request private access",
  secondaryCta: "See how it works",
  trust: "Works with the CRM you already use. Nothing sends without a person's approval. Each customer's data is kept separate.",
  exampleLabel: "Example with sample data",
} as const;

export const HEADLINE_OPTIONS = [
  "Every lead. Every call. One record.",
  "Stop piecing together your leads from five tools.",
  "The acquisition record for high-ticket sales teams.",
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
    { href: "/#agents", label: "Agents" },
    { href: "/#safety", label: "Safety" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#faq", label: "FAQ" },
  ],
} as const;

export const PROBLEM = {
  id: "problem",
  headline: "A slipped lead is real money.",
  opening:
    "When a single closed deal is worth thousands, a lead that waits too long or a call nobody wrote up properly is real money.",
  scattered:
    "The CRM has one version. The dialer has another. The calendar has a third. The call recordings sit there because nobody has time to replay them. A manager cannot see what is happening without asking. Follow-up depends on who remembers.",
  pains: [
    "I cannot see what is happening with a lead without listening to the call or asking the rep.",
    "Notes live in five places and none of them agree.",
    "Leads wait too long, and I only find out afterward.",
    "Follow-up depends on who remembers.",
  ],
} as const;

export const HOW = {
  id: "how",
  headline: "Centralize. Watch. Act.",
  steps: [
    {
      id: "centralize",
      title: "Centralize",
      body: "Connect your CRM, phone, calendar, and call recordings. Vistrial reads them and builds one case file per lead, kept up to date automatically. It does not change anything in your CRM unless you turn that on.",
    },
    {
      id: "watch",
      title: "Watch",
      body: "It tracks how fast each lead gets answered against the standard your team sets, flags leads that are slipping, and shows why deals stall: objections, readiness, and next steps pulled from calls and notes.",
    },
    {
      id: "act",
      title: "Act",
      body: "Follow-ups are drafted for you, and a person approves each one. Ask questions about your sales operation in plain language and get answers from your own data, with sources.",
    },
  ],
} as const;

export const AGENTS_SECTION = {
  id: "agents",
  headline: "Meet the agents",
  lead: "Four agents work the record. A person still approves anything that would reach a lead.",
} as const;

export const INDUSTRIES = {
  id: "industries",
  headline: "For teams that sell considered purchases.",
  lead: "The current setup templates match these sales motions. Other high-ticket businesses can request access.",
  cards: [
    {
      id: "med-spa",
      title: "Aesthetic and medical spa",
      motion: "Consultation requests and treatment plans, handled by a small team.",
      watches: [
        "Consultation requests",
        "Treatment plan follow-up",
        "No-shows and reschedules",
        "Objections about price and timing",
      ],
    },
    {
      id: "home-services",
      title: "Home services and remodeling",
      motion: "Estimates, site visits, and quotes that go quiet.",
      watches: [
        "Estimate requests",
        "Site visit scheduling",
        "Quote follow-up",
        "Projects that go quiet after the estimate",
      ],
    },
    {
      id: "coaches-consultants",
      title: "Coaches and consultants",
      motion: "Discovery calls, applications, and decisions that involve more than one person.",
      watches: [
        "Discovery and strategy calls",
        "Application follow-up",
        "Objections about investment and timing",
        "A decision-maker who was not on the call",
      ],
    },
  ],
  closing: "If you sell a considered purchase through real conversations, and your industry is not listed, request access and tell us what you sell.",
} as const;

export const SAFETY = {
  id: "safety",
  headline: "Safe by design",
  lead: "These are product behaviors, not badges.",
  items: [
    "Nothing is sent without a person's approval, and the same checks run again at the moment it is sent.",
    "Quiet hours are enforced: no messages between 8 pm and 8 am in the lead's local time.",
    "Opt-outs and do-not-contact markers are respected.",
    "Each customer's data is separate from every other customer's.",
    "Your CRM stays the source of truth. Vistrial reads from it and does not write to it unless you choose.",
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
      q: "Does it replace my CRM?",
      a: "No. Vistrial brings together the records from your CRM and your other tools, such as call tools, spreadsheets, and calendars, into one case file for each lead. Each of your tools stays the record for its own data.",
    },
    {
      q: "Which CRMs work with it?",
      a: "GoHighLevel works today. Other CRMs are coming. A calendar can be read when Google Calendar or the CRM calendar is connected. Call transcripts are read when a recording source is connected.",
    },
    {
      q: "Will it text my leads on its own?",
      a: "No. Relay drafts the follow-up. A person approves it before anything is sent, and the checks run again at send time. Quiet hours, opt-outs, and do-not-contact markers still apply.",
    },
    {
      q: "What does it do with my data?",
      a: "Each workspace is separate. Vistrial uses the record to build case files, watch response time, draft follow-ups, and answer questions from that workspace's own data. The Security overview describes the controls. The Privacy page is a draft for counsel and is not a finished policy.",
    },
    {
      q: "How long does setup take?",
      a: "[CONFIRM: how long setup usually takes after approval. The product has a guided onboarding inside the workspace. Do not invent a number of days here.]",
    },
    {
      q: "Who is Private Access for?",
      a: "Teams that sell considered purchases through calls or consultations, already use a CRM, and want a limited number of people set up properly. [CONFIRM: we onboard a limited number of teams at a time.]",
    },
    {
      q: "What happens after I request access?",
      a: "We review the request. You get a confirmation email, and a person replies about whether access is available. [CONFIRM: reply within 2 business days.]",
    },
    {
      q: "Can I cancel?",
      a: "[CONFIRM: cancellation terms. Billing starts only after approval and onboarding are agreed. This page does not take payment, and no contract length is stated here.]",
    },
  ],
} as const;

export const FINAL_CTA = {
  id: "final",
  headline: "Request access. We review each team.",
  body: "Private Access is for a limited number of teams at a time, so each one is set up properly. [CONFIRM: this matches how you want to operate.]",
  primary: "Request private access",
  secondary: "Contact us about Custom",
  secondaryHref: "/contact",
} as const;

export const PROOF = {
  id: "proof",
  headline: "[CONFIRM: real proof, only after you have it.]",
  body: "No testimonials, logos, or results are shown until you add real ones here.",
} as const;

export const FOOTER = {
  productLine: "The acquisition record for high-ticket sales teams.",
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
    { agent: "sentry" as const, line: "Sentry noticed this lead waiting past the team's standard." },
    { agent: "scribe" as const, line: "Scribe updated the case file from the call." },
    { agent: "relay" as const, line: "Relay prepared a draft. It waits for approval." },
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
      body: "[Counsel will replace this section.] The access form collects the name, work email, business, and answers the visitor types. A phone number is optional. The form also stores the time, the page it came from, and campaign parameters when they are present.",
    },
    {
      heading: "Why",
      body: "[Counsel will replace this section.] The purpose is to review a request for Private Access or a Custom conversation, and to reply about that request.",
    },
    {
      heading: "Who receives it",
      body: "[Counsel will replace this section.] Platform Admins can review requests. Service Team can see them only when a Platform Admin grants that. Request data is not copied into a customer workspace except the fields needed to start onboarding, and only when a Platform Admin converts the request.",
    },
    {
      heading: "How long it is kept",
      body: "[CONFIRM: 12 months for declined or inactive requests, then automatic deletion. Counsel should confirm the period.]",
    },
    {
      heading: "How to ask for deletion",
      body: "[Counsel will replace this section.] Email the contact address below and ask for the request to be deleted. A Platform Admin can delete it, and the deletion is recorded.",
    },
    {
      heading: "Contact",
      body: "[CONFIRM: the contact address for privacy requests. The product contact address is contact@vistrial.io until you replace it.]",
    },
  ],
} as const;

export const TERMS_PAGE = {
  title: "Terms",
  description: "A placeholder for the terms counsel will provide.",
  body: "[Counsel will replace this page.] No contract term, setup fee, or guarantee is stated here.",
} as const;

export const THANKS = {
  title: "Request received",
  access:
    "We have your request for Private Access. We will email the address you gave. [CONFIRM: we reply within 2 business days.] Reply to that email if something needs a correction.",
  custom:
    "We have your note. We will email the address you gave. [CONFIRM: we reply within 2 business days.] Reply to that email if something needs a correction.",
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
    subject: "We received your Vistrial request",
    body: "Hello {{name}},\n\nWe received your request for Private Access. A person on the Vistrial team will review it.\n\n[CONFIRM: we reply within 2 business days.]\n\nReply to this email if something you sent needs a correction. This note does not include the details you submitted.\n\nVistrial",
  },
  customConfirm: {
    id: "custom_confirm",
    label: "Custom confirmation",
    subject: "We received your note to Vistrial",
    body: "Hello {{name}},\n\nWe received your note. A person on the Vistrial team will read it.\n\n[CONFIRM: we reply within 2 business days.]\n\nReply to this email if something needs a correction. This note does not include the details you submitted.\n\nVistrial",
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
    subject: "Your Vistrial request is on the list",
    body: "Hello {{name}},\n\nWe are keeping your request on the list. We onboard a limited number of teams at a time.\n\n[CONFIRM: what you want this note to promise, if anything.]\n\nVistrial",
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
    statement: "Sentry watches response time and alerts the team. It does not message leads.",
    support: "Agent roster: Sentry catches missed follow-ups and only alerts the team.",
  },
  {
    statement: "Scribe builds the case file and does not contact a lead.",
    support: "Agent roster: Scribe builds case files from calls and context and never contacts a lead.",
  },
  {
    statement: "Relay drafts follow-ups and does not send them.",
    support: "Agent roster: Relay drafts for approval. A person sends from the CRM.",
  },
  {
    statement: "Compass answers from the workspace's own data and does not invent numbers.",
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
