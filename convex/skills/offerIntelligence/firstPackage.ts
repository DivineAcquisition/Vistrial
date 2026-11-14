/**
 * Offer Intelligence in the first package's mode: exactly two offer ideas, one to win customers and one to
 * keep them, each built on an offer the business itself states. It never stops to ask (nobody is waiting at
 * a chat), and code checks the result like every other rule. docs/rebuild/onboarding-and-first-package.md 3.4.
 */
import type { OfferAnalysis } from "./shapes";

/** A run's inputRef in this mode: "first-package:<package id>". */
export const FIRST_PACKAGE_REF = "first-package:";

export function isFirstPackageRef(inputRef: string) {
  return inputRef.startsWith(FIRST_PACKAGE_REF);
}

export const FOCUS_PREFIX = { acquisition: "Win customers:", retention: "Keep customers:" } as const;
export type Focus = keyof typeof FOCUS_PREFIX;

export const FOCUS_WORDS: Record<Focus, string> = { acquisition: "To win customers", retention: "To keep customers" };

/** Which idea a change is, from its title. Null when the title does not say. */
export function focusOf(title: string): Focus | null {
  const text = title.trim().toLowerCase();
  if (text.startsWith(FOCUS_PREFIX.acquisition.toLowerCase())) return "acquisition";
  if (text.startsWith(FOCUS_PREFIX.retention.toLowerCase())) return "retention";
  return null;
}

/** The title without its prefix, for a screen or an email that labels the focus itself. */
export function bareTitle(title: string) {
  return title.replace(/^\s*(win|keep) customers:\s*/i, "").trim();
}

export type StatedOffer = { id: string; name: string; price: string };

export function firstPackageRules(offers: StatedOffer[]) {
  return [
    "This is the business's first package. Instead of two or three changes, write exactly two:",
    `- The first is about winning new customers. Its title starts with "${FOCUS_PREFIX.acquisition}".`,
    `- The second is about keeping and growing the customers the business already has (repeat purchases, renewals, referrals, upgrades). Its title starts with "${FOCUS_PREFIX.retention}".`,
    offers.length
      ? `Build each on this business's own offers, as its website states them, and name the offer you build on in fit.text exactly as it is named here. Quote a price in fit.text only as stated here. The offers: ${offers.map((row) => `"${row.name}"${row.price ? ` (${row.price})` : " (no price stated)"}`).join("; ")}.`
      : "No offers are stated on record; build on the profile's offer and say so in limits.",
    "Never write a generic idea that would fit any business: each must say why it fits this one, from its offers, audience, proof and the research.",
    "Do not stop to ask a question. Where something is not on record, record it as an assumption in limits.",
  ];
}

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9$€£.,]+/g, " ").replace(/\s+/g, " ").trim();
}

const PRICE = /[$€£]\s?\d[\d,]*(\.\d+)?\s?[kK]?/g;

/** The extra check in this mode. Null when it passes, else what is wrong in words the revision step can act on. */
export function firstPackageProblem(analysis: OfferAnalysis, offers: StatedOffer[]): string | null {
  const changes = analysis.changes;
  if (changes.length !== 2) return `Write exactly two offer ideas; there are ${changes.length}.`;
  const focuses = changes.map((row) => focusOf(row.title));
  if (!focuses.includes("acquisition") || !focuses.includes("retention")) return `One title must start with "${FOCUS_PREFIX.acquisition}" and the other with "${FOCUS_PREFIX.retention}".`;
  if (offers.length) {
    const names = offers.map((row) => norm(row.name));
    const unbuilt = changes.filter((row) => !names.some((name) => name && norm(`${row.fit.text} ${row.proposedChange}`).includes(name)));
    if (unbuilt.length) return `Each idea must name the offer it builds on, as the business names it: ${unbuilt.map((row) => row.title).join("; ")}.`;
    const stated = new Set(offers.flatMap((row) => (row.price.match(PRICE) ?? []).map((price) => price.replace(/\s/g, ""))));
    const wrong = changes.flatMap((row) => (row.fit.text.match(PRICE) ?? []).map((price) => price.replace(/\s/g, ""))).filter((price) => !stated.has(price));
    if (wrong.length) return `fit.text quotes prices the business does not state: ${[...new Set(wrong)].join(", ")}.`;
  }
  return null;
}
