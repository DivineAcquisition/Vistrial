import type { TrustSwitches } from "@/lib/trust/model";

/**
 * Live security copy. A line is included only when the behavior was found in
 * the product. Switch lines stay out until a Platform Admin turns them on.
 */

export type SecurityCard = { title: string; body: string };

export function glanceCards(switches: TrustSwitches): SecurityCard[] {
  const cards: SecurityCard[] = [
    {
      title: "Separate by design",
      body: "Every customer has a private workspace. Row level security in the database keeps one workspace from reading another.",
    },
    {
      title: "Nothing sends without approval",
      body: "Relay drafts follow-ups. A person approves each one. Opt-outs, do-not-contact markers, and quiet hours are checked again at send time.",
    },
    {
      title: "Read first",
      body: "Vistrial reads the CRM you connect. It does not change that CRM unless you turn a write on and a person approves the action.",
    },
    {
      title: "Quiet hours",
      body: "The default quiet hours are 8 pm to 8 am in the lead's local time. A message waits until quiet hours end.",
    },
    {
      title: "Important actions are recorded",
      body: "Approvals, status changes, and staff actions write an audit row with who did it and when.",
    },
    {
      title: "You can disconnect",
      body: "A source can be disconnected from the workspace. Ask the team if you want imported data deleted. Deletion is not automatic.",
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

export function neverDo(switches: TrustSwitches): string[] {
  const lines = [
    "Send a follow-up to a lead without a person's approval.",
    "Message a lead between 8 pm and 8 am in that lead's local time, under the default quiet hours.",
    "Change your CRM unless you turn that on.",
    "Show connection keys on this public site.",
    "Let one customer read another customer's workspace.",
  ];
  if (switches.noSell) lines.push("Sell your data.");
  return lines;
}

export function aiLines(switches: TrustSwitches): string[] {
  const lines = [
    "Scribe, Relay, and Compass run against the workspace they are opened in.",
    "Text inside a lead record is treated as data to read. The agent instructions say not to follow instructions found in that text.",
    "Those agents do not send, change, or delete on their own. A person approves anything that would reach a lead.",
  ];
  if (switches.aiNoTraining) {
    lines.push("Your data is not used to train the model provider's models. This line is on because a Platform Admin confirmed the provider setting.");
  }
  return lines;
}

export function underTheHood(switches: TrustSwitches): string[] {
  const lines = [
    "The website and the app are served over HTTPS. Browsers are told to stay on HTTPS.",
    "Payments go through Stripe. Vistrial stores a Stripe customer reference, not a full card number.",
  ];
  if (switches.encryptionAtRest) {
    lines.unshift("Stored data is encrypted at rest. This line is on because a Platform Admin confirmed the provider setting.");
  }
  if (switches.backups) {
    lines.push("Backups are taken and a restore has been tested. This line is on because a Platform Admin confirmed that.");
  }
  return lines;
}
