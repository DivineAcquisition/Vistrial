import type { TrustSwitches } from "@/lib/trust/model";

/**
 * Live security copy. A line is included only when the behavior was found in
 * the product. Switch lines stay out until a Platform Admin turns them on.
 *
 * Rewritten 2026-11-13 for the product as it is now: agents that research and draft inside a customer's
 * organization. The earlier copy described lead follow-up, a CRM connection and quiet hours, none of which
 * this product does. Where each line comes from is noted beside it.
 */

export type SecurityCard = { title: string; body: string };

export function glanceCards(switches: TrustSwitches): SecurityCard[] {
  const cards: SecurityCard[] = [
    {
      // convex/lib/builders.ts checks membership on every function; convex/lib/clientGuard.ts limits clients.
      title: "Separate by design",
      body: "Each customer's organizations are private. Every read and write on our servers checks that the person belongs to that organization, and a person limited to certain clients sees only those clients.",
    },
    {
      // Work starts from a plan with its budget; reports and drafts carry approve and reject.
      title: "You approve the work",
      body: "Work you ask for shows its plan and budget first, and starts when a person presses Start. What an agent produces is a draft until a person approves it.",
    },
    {
      // convex/lib/caps.ts and convex/lib/approvals.ts.
      title: "A credit limit on every run",
      body: "Each piece of work has a credit limit and stops when it reaches it. Work above your organization's spending limit waits for an Owner or Admin.",
    },
    {
      // convex/metaAds.ts asks for ads_read only.
      title: "Connections only read",
      body: "A connected Meta ad account is read with read-only access. Vistrial never creates, edits, pauses or pays for ads.",
    },
    {
      // convex/lib/audit.ts, written from approvals, connections, deletions and staff actions.
      title: "Important actions are recorded",
      body: "Approvals, connection changes, deletions and staff actions write a record of who did it and when.",
    },
    {
      // convex/metaAds.ts disconnect, convex/bookings.ts disconnect.
      title: "Disconnecting deletes",
      body: "Disconnecting a Meta ad account or a calendar deletes its access token and everything saved from it, straight away.",
    },
  ];
  if (switches.staffMfa) {
    cards.push({
      title: "Staff sign-in",
      body: "Multi-factor sign-in is required for Vistrial staff.",
    });
  }
  return cards;
}

/** What Vistrial reads, and where it comes from. The Privacy Policy (parts E to J) has the detail. */
export function sourceLines(): string[] {
  return [
    "Public sources for research: public web pages, YouTube through its official API, the Meta Ad Library through Meta's official API where it is available, and public TikTok and Instagram posts through the platforms' link previews. Vistrial keeps links, titles, dates and short excerpts, not copies of images or videos.",
    "A Meta ad account, when an Owner connects one: its campaigns and results, read-only.",
    "A calendar, when one is connected: counts of booked calls.",
    "Results files your team uploads. A file is read once and deleted, and only its totals are kept.",
    "Call transcripts a person on your team adds.",
    "What your team types in Vistrial: your business details, offers, clients, notes and decisions.",
  ];
}

export function neverDo(switches: TrustSwitches): string[] {
  const lines = [
    "Publish, post, send a message or contact anyone on your behalf.",
    "Create, edit, pause or pay for ads in a connected ad account.",
    "Log in to another site to read private content, or get around a site's blocks, to do research.",
    "Keep copies of ad images or videos from public sources.",
    "Show access tokens or keys in the app or on this public site.",
    "Let one customer read another customer's organization.",
  ];
  if (switches.noSell) lines.push("Sell your data.");
  return lines;
}

export function aiLines(switches: TrustSwitches): string[] {
  const lines = [
    "An agent works inside the organization it was started in.",
    "Text from web pages, ads, uploaded files and transcripts is treated as material to read. The agent instructions say not to follow instructions found in that text.",
    "Agents do not publish, send or contact anyone. What they produce is a draft for a person to approve.",
    "Each new result shows which AI model made it. The Privacy Policy names the AI providers and what is sent to them.",
  ];
  if (switches.aiNoTraining) {
    lines.push("Your data is not used to train the model provider's models. This line is on because a Platform Admin confirmed the provider setting.");
  }
  return lines;
}

/** What a customer can do themselves. */
export function choiceLines(): string[] {
  return [
    "Disconnect a Meta ad account or a calendar in Connections. Its token and everything saved from it are deleted straight away.",
    "Delete a call transcript at any time. Owners, Admins and Members can.",
    "An Owner can export an organization's data from Settings.",
    "Delete your own account from your account's security settings.",
  ];
}

export function underTheHood(switches: TrustSwitches): string[] {
  const lines = [
    "The website and the app are served over HTTPS. Browsers are told to stay on HTTPS.",
    "Sign-in is handled by Clerk. Vistrial does not store passwords.",
    "Payments go through Stripe. Vistrial does not store card numbers.",
  ];
  if (switches.encryptionAtRest) {
    lines.unshift("Stored data is encrypted at rest. This line is on because a Platform Admin confirmed the provider setting.");
  }
  if (switches.backups) {
    lines.push("Backups are taken and a restore has been tested. This line is on because a Platform Admin confirmed that.");
  }
  return lines;
}
