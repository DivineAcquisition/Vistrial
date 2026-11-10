/**
 * What an agent may do inside a customer's own account, decided in code. Nothing here drives a browser: it
 * is the rulebook the approval surface and any future driver must go through.
 *
 * Three kinds of step:
 *   read        Looks at something. Logged with a screenshot. No approval.
 *   change      Changes something the customer could undo. Shown first (what will be clicked or typed, and
 *               where), and nothing happens until an Owner or Manager approves that one step.
 *   restricted  Payments, passwords and security settings, deleting, sending a message to a person,
 *               publishing. Never part of a plan's ordinary flow: an Owner must approve each one separately
 *               and type the word shown. Declined by default.
 *
 * The kind a driver or a model gives a step is never trusted on its own. `classify` reads the step's own
 * words and takes the stricter of the two, so a "read" that clicks "Pay now" is still restricted.
 */

export const STEP_KINDS = ["read", "change", "restricted"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const VERBS = ["open", "read", "click", "type", "select", "upload"] as const;
export type Verb = (typeof VERBS)[number];

export type ProposedStep = {
  verb: Verb;
  /** The element, as a person would name it: "the Save button", "the Headline field". */
  target: string;
  /** The page it is on. */
  url: string;
  /** What will be typed or chosen. */
  value?: string;
  /** The kind the driver believes it is. */
  kind: StepKind;
  /** Why the agent wants to do it, in a sentence. */
  why: string;
};

export const RESTRICTED_REASONS = {
  payment: "It spends money or changes how you pay.",
  security: "It changes a password, a login or a security setting.",
  delete: "It deletes something.",
  message: "It sends a message to a person.",
  publish: "It publishes something where others can see it.",
} as const;
export type RestrictedReason = keyof typeof RESTRICTED_REASONS;

const RESTRICTED: [RestrictedReason, RegExp][] = [
  ["payment", /\b(pay(ment|ments|ing)?|purchase|buy|checkout|check out|billing|invoice|subscribe|subscription|upgrade|downgrade|refund|charge|card number|credit card|add funds|top[- ]?up|budget|bid|spend limit|payout|transfer|withdraw)\b/i],
  ["security", /\b(password|passcode|two[- ]factor|2fa|mfa|authenticator|recovery (code|email|phone)|security (settings?|question)|api key|access token|secret|permissions?|roles?|invite (a )?(user|member|admin)|add (a )?(user|member|admin)|remove (a )?(user|member|admin)|transfer ownership|log ?out everywhere|sign[- ]?in method)\b/i],
  ["delete", /\b(delete|remove|erase|destroy|trash|discard|archive|wipe|clear all|reset|unpublish|cancel (the )?(account|plan|subscription|campaign)|close (the )?account|deactivate)\b/i],
  ["message", /\b(send|reply|respond|email (them|him|her|the|a|all)|message (them|him|her|the|a|all)|text (them|him|her|the|a|all)|sms|dm|direct message|comment|post a (comment|reply|review)|broadcast|blast|notify|invite)\b/i],
  ["publish", /\b(publish|go live|goes live|make (it )?(public|live)|launch|activate|turn on|enable (the )?(campaign|ad|ads|automation|workflow|sequence)|start (the )?(campaign|ad|ads|automation|workflow|sequence)|schedule (the )?(post|campaign|email|send)|post (it|now|to)|submit for review|deploy|release)\b/i],
];

/** Why a step is restricted, from its own words, or null when nothing in it is. */
export function restrictedReason(step: Pick<ProposedStep, "verb" | "target" | "value">): RestrictedReason | null {
  // Reading is never restricted by what it reads. Everything else is judged by what it touches.
  if (step.verb === "read" || step.verb === "open") return null;
  const words = `${step.target} ${step.verb === "select" ? (step.value ?? "") : ""}`;
  for (const [reason, pattern] of RESTRICTED) if (pattern.test(words)) return reason;
  return null;
}

const RANK: Record<StepKind, number> = { read: 0, change: 1, restricted: 2 };

/** The kind a step really is: the stricter of what the driver said and what its words say. */
export function classify(step: ProposedStep): { kind: StepKind; reason: RestrictedReason | null } {
  const reason = restrictedReason(step);
  const fromWords: StepKind = reason ? "restricted" : step.verb === "read" || step.verb === "open" ? "read" : "change";
  const kind = RANK[fromWords] >= RANK[step.kind] ? fromWords : step.kind;
  return { kind, reason: kind === "restricted" ? reason : null };
}

/** Things no approval unlocks. A step that is one of these is blocked and the task stops. */
export type Blocked = "off_site" | "password_field" | "bad_address";

const SECRET_FIELD = /\b(password|passcode|pin|cvv|cvc|card number|security code|ssn|social security|one[- ]time code|verification code|otp)\b/i;

/**
 * The hard stops: leaving the site the session was approved for, an address that is not https, and typing
 * into a password, card or code field. The customer signs in themselves; the agent never handles a secret.
 */
export function blocked(step: ProposedStep, allowedHosts: readonly string[]): Blocked | null {
  let host: string;
  try {
    const url = new URL(step.url);
    if (url.protocol !== "https:") return "bad_address";
    host = url.hostname.toLowerCase();
  } catch {
    return "bad_address";
  }
  if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return "off_site";
  if ((step.verb === "type" || step.verb === "select") && SECRET_FIELD.test(step.target)) return "password_field";
  return null;
}

export const BLOCKED_WORDS: Record<Blocked, string> = {
  off_site: "The step would leave the site this session was approved for, so it was not taken.",
  password_field: "The step would type into a password, card or code field. The agent never does that.",
  bad_address: "The step's address is not a secure web address, so it was not taken.",
};

/** What a typed value looks like in the audit trail: kept short, and hidden if it looks like a secret. */
export function redact(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (/\b(\d[ -]?){13,19}\b/.test(text) || /(sk|pk|rk|key|token|secret)[-_][A-Za-z0-9_-]{12,}/i.test(text) || /^[A-Za-z0-9+/_-]{32,}={0,2}$/.test(text)) return "[hidden: looks like a secret]";
  return text.slice(0, 300);
}

/** The word an Owner types to approve a restricted step. Typing it is the separate, explicit approval. */
export const CONFIRM_WORD: Record<RestrictedReason, string> = { payment: "PAY", security: "SECURITY", delete: "DELETE", message: "SEND", publish: "PUBLISH" };

/** How long a signed-in session lasts before the customer must sign in again. */
export const SESSION_DAYS = 7;
/** A step waiting for approval is dropped after this long, and the task stops. Nothing is approved by silence. */
export const APPROVAL_HOURS = 24;
export const MAX_STEPS_PER_TASK = 40;

export type SiteMode = "api" | "browser" | "never" | "demo";

export type Site = {
  key: string;
  name: string;
  mode: SiteMode;
  hosts: string[];
  /** In plain words: what is used instead of a browser, or why a browser is or is not used. */
  note: string;
  /** What the agent may read and change in a browser session, when the mode allows one. */
  reads: string[];
  changes: string[];
};

/**
 * Where a browser is and is not the right tool. "api": an official API or connector covers the work, so no
 * browser is used. "never": the site's terms forbid automated access to an account, so Vistrial does not
 * do it even with the customer's sign-in. "browser": no adequate API and no clause found against it; still
 * off until the owner decides (see docs/rebuild/browser-with-approval.md). "demo": the built-in practice
 * site the approval surface runs against today. Nothing real is behind it.
 */
export const SITES: readonly Site[] = [
  { key: "demo-crm", name: "Practice CRM (dry run)", mode: "demo", hosts: ["practice-crm.vistrial.example"], note: "A made-up CRM for trying the approval steps. Nothing real is opened or changed.", reads: ["Pipeline and lead lists", "A funnel page's settings"], changes: ["Edit a funnel page's headline and button", "Move a lead between stages"] },
  { key: "meta", name: "Meta (Ads Manager, Business Suite)", mode: "api", hosts: ["facebook.com", "meta.com"], note: "Already connected through the Marketing API (read-only). Meta's terms forbid automated access without permission and sharing account access, so a browser is not used.", reads: [], changes: [] },
  { key: "google-ads", name: "Google Ads", mode: "api", hosts: ["ads.google.com"], note: "Use the Google Ads API. Google's terms forbid automated access against its machine-readable rules, and its sign-in resists automated browsers.", reads: [], changes: [] },
  { key: "ga4", name: "Google Analytics", mode: "api", hosts: ["analytics.google.com"], note: "Use the Analytics Data API.", reads: [], changes: [] },
  { key: "google-business", name: "Google Business Profile", mode: "api", hosts: ["business.google.com"], note: "Use the Business Profile APIs (approval from Google is required).", reads: [], changes: [] },
  { key: "linkedin", name: "LinkedIn", mode: "never", hosts: ["linkedin.com"], note: "LinkedIn's user agreement forbids bots and sharing log-in sessions. Vistrial does not automate LinkedIn accounts. Its Marketing API is the only route.", reads: [], changes: [] },
  { key: "tiktok-ads", name: "TikTok Ads Manager", mode: "api", hosts: ["ads.tiktok.com"], note: "Use the TikTok API for Business. TikTok's terms forbid automated scripts.", reads: [], changes: [] },
  { key: "shopify", name: "Shopify", mode: "api", hosts: ["shopify.com", "myshopify.com"], note: "Use the Admin API with a staff or app grant. Shopify's terms forbid automated access to the admin.", reads: [], changes: [] },
  { key: "hubspot", name: "HubSpot", mode: "api", hosts: ["hubspot.com"], note: "Use HubSpot's APIs. Its acceptable use policy forbids access other than through its interface or APIs.", reads: [], changes: [] },
  { key: "stripe", name: "Stripe", mode: "api", hosts: ["stripe.com"], note: "Use Stripe's API with a restricted key. A browser agent is never used on a payments account.", reads: [], changes: [] },
  { key: "calendly", name: "Calendly", mode: "api", hosts: ["calendly.com"], note: "Use Calendly's API. Its terms tie credentials to one authorised user.", reads: [], changes: [] },
  { key: "webflow", name: "Webflow", mode: "api", hosts: ["webflow.com"], note: "Use the Webflow Data API for pages and CMS items.", reads: [], changes: [] },
  { key: "highlevel", name: "HighLevel (GoHighLevel)", mode: "browser", hosts: ["gohighlevel.com", "leadconnectorhq.com"], note: "Its API covers contacts and pipelines but not building funnel pages. No clause against automation was found in its terms, but accounts are non-transferable. A browser would be for page building only, if the owner decides to allow it.", reads: ["Funnel and page lists", "A page's sections and settings"], changes: ["Edit a draft page's copy and sections"] },
  { key: "clickfunnels", name: "ClickFunnels", mode: "browser", hosts: ["clickfunnels.com", "myclickfunnels.com"], note: "Page building has no adequate API. Its terms forbid scraping and lending account access, so this is a moderate risk the owner must decide on.", reads: ["Funnel and page lists"], changes: ["Edit a draft page's copy and sections"] },
  { key: "wordpress", name: "WordPress (the customer's own site)", mode: "browser", hosts: [], note: "A self-hosted site is the customer's own. The REST API covers posts and pages; page builders often need the admin screens.", reads: ["Pages and their content"], changes: ["Edit a draft page"] },
];

export function siteFor(key: string): Site | null {
  return SITES.find((site) => site.key === key) ?? null;
}
