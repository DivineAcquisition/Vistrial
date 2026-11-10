/**
 * Offer card content: cleaned, checked and compared in code. Pure, so the server and the screen share it.
 * The builder's fields (the outcome, a structured price, line items with values, bonuses, the guarantee
 * type, the call to action and the channel) extend the first card's six. `price` and `included` are kept as
 * plain text on every version, worked out from the structured fields, so anything that read a card before
 * the builder (the analysis, the chat, the PDF) still reads it.
 */

export const PRICE_KINDS = ["oneTime", "monthly", "tiered"] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];
export const PRICE_KIND_WORDS: Record<PriceKind, string> = { oneTime: "One-time", monthly: "Monthly", tiered: "Tiered" };

export const GUARANTEE_TYPES = ["none", "results", "moneyBack", "satisfaction", "custom"] as const;
export type GuaranteeType = (typeof GUARANTEE_TYPES)[number];
export const GUARANTEE_WORDS: Record<GuaranteeType, string> = {
  none: "No guarantee",
  results: "Results guarantee",
  moneyBack: "Money-back guarantee",
  satisfaction: "Satisfaction guarantee",
  custom: "Other guarantee",
};

export type OfferTier = { name: string; price: string };
export type OfferPricing = { kind: PriceKind; amount: string; was: string; tiers: OfferTier[] };
export type OfferItem = { text: string; value: string };

/** The first card's six fields. Every version has them. */
export type OfferBase = { name: string; price: string; included: string[]; guarantee: string; terms: string; targetCustomer: string };

/** What the builder adds. A version from before the builder, the chat or an analysis has none of it. */
export type OfferExtras = {
  outcome: string;
  /** Null when the price is only the plain text in `price`. */
  pricing: OfferPricing | null;
  items: OfferItem[];
  bonuses: string[];
  /** Empty when the guarantee's type was never chosen. */
  guaranteeType: GuaranteeType | "";
  cta: string;
  channel: string;
};

export type OfferContent = OfferBase & OfferExtras;
export type OfferInput = OfferBase & Partial<OfferExtras>;

export const MAX = { name: 120, price: 120, item: 160, items: 12, itemValue: 40, guarantee: 400, terms: 400, targetCustomer: 300, note: 300, outcome: 300, bonus: 160, bonuses: 6, tiers: 4, tierName: 40, amount: 40, cta: 80, channel: 80 } as const;

export const EMPTY_OFFER: OfferContent = { name: "", price: "", included: [], guarantee: "", terms: "", targetCustomer: "", outcome: "", pricing: null, items: [], bonuses: [], guaranteeType: "", cta: "", channel: "" };

/** "Not stated" is how the analysis marks a blank; a card keeps it blank so the screen says so itself. */
export const NOT_STATED = /^not (stated|enough data)\b/i;

function clip(text: string | null | undefined, max: number) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return NOT_STATED.test(flat) ? "" : flat;
}

function unique(rows: string[], max: number, count: number) {
  const seen = new Set<string>();
  return rows
    .map((row) => clip(row, max))
    .filter((row) => row && !seen.has(row.toLowerCase()) && seen.add(row.toLowerCase()))
    .slice(0, count);
}

/** A bare number becomes dollars ("2500" reads "$2,500"); anything else is kept as the person wrote it. */
export function tidyAmount(text: string | null | undefined) {
  const flat = clip(text, MAX.amount);
  const bare = flat.match(/^(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?$/);
  if (!bare) return flat;
  return `$${Number(bare[1].replace(/,/g, "")).toLocaleString("en-US")}${bare[2] ?? ""}`;
}

/** The first number in an amount, for comparing a price with its "was" price. Null when there is none. */
export function amountNumber(text: string) {
  const match = text.match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value * (/\d\s?k\b/i.test(text) ? 1000 : 1) : null;
}

/** The structured price as one line of plain text. */
export function priceText(pricing: OfferPricing) {
  if (pricing.kind === "tiered") return pricing.tiers.map((tier) => `${tier.name} ${tier.price}`.trim()).join(" · ").slice(0, MAX.price);
  if (!pricing.amount) return "";
  if (pricing.kind === "monthly") return /\/|\bper\b|\bmo(nth(ly)?)?\b/i.test(pricing.amount) ? pricing.amount : `${pricing.amount}/mo`;
  return pricing.amount;
}

function cleanPricing(input: OfferPricing | null | undefined): OfferPricing | null {
  if (!input) return null;
  const kind = (PRICE_KINDS as readonly string[]).includes(input.kind) ? input.kind : "oneTime";
  const tiers = kind === "tiered" ? (input.tiers ?? []).map((tier) => ({ name: clip(tier.name, MAX.tierName), price: tidyAmount(tier.price) })).filter((tier) => tier.name || tier.price).slice(0, MAX.tiers) : [];
  return { kind, amount: kind === "tiered" ? "" : tidyAmount(input.amount), was: kind === "tiered" ? "" : tidyAmount(input.was), tiers };
}

/**
 * Cleans what a person, the chat or an analysis wrote into card content. Empty rows and repeats are dropped;
 * `price` and `included` follow the structured price and the line items when those are given.
 */
export function cleanOffer(input: OfferInput): OfferContent {
  const seen = new Set<string>();
  const given = (input.items ?? []).map((row) => ({ text: clip(row.text, MAX.item), value: tidyAmount(row.value).slice(0, MAX.itemValue) }));
  const items = (given.some((row) => row.text) ? given : input.included.map((row) => ({ text: clip(row, MAX.item), value: "" })))
    .filter((row) => row.text && !seen.has(row.text.toLowerCase()) && seen.add(row.text.toLowerCase()))
    .slice(0, MAX.items);
  const pricing = cleanPricing(input.pricing);
  const guaranteeType = (GUARANTEE_TYPES as readonly string[]).includes(input.guaranteeType ?? "") ? (input.guaranteeType as GuaranteeType) : "";
  return {
    name: clip(input.name, MAX.name),
    price: pricing ? priceText(pricing) || clip(input.price, MAX.price) : clip(input.price, MAX.price),
    included: items.map((row) => row.text),
    // "No guarantee" is a choice: it leaves no guarantee text behind.
    guarantee: guaranteeType === "none" ? "" : clip(input.guarantee, MAX.guarantee),
    terms: clip(input.terms, MAX.terms),
    targetCustomer: clip(input.targetCustomer, MAX.targetCustomer),
    outcome: clip(input.outcome, MAX.outcome),
    pricing,
    items,
    bonuses: unique(input.bonuses ?? [], MAX.bonus, MAX.bonuses),
    guaranteeType,
    cta: clip(input.cta, MAX.cta),
    channel: clip(input.channel, MAX.channel),
  };
}

/**
 * What is wrong with an offer as a person typed it, in words for that person, or null when it can be
 * saved. Checked on the server before anything is cleaned or stored, and again on the cleaned content.
 */
export function offerProblem(input: OfferInput): string | null {
  if (!clip(input.name, 10_000)) return "Give the offer a name.";
  if (input.name.trim().length > MAX.name) return `Keep the offer's name under ${MAX.name} characters.`;
  if ((input.outcome ?? "").trim().length > MAX.outcome) return `Keep the outcome under ${MAX.outcome} characters.`;
  const items = (input.items ?? []).filter((row) => row.text.trim() || row.value.trim());
  if (Math.max(items.length, input.included.filter((row) => row.trim()).length) > MAX.items) return `An offer can list up to ${MAX.items} line items.`;
  for (const item of items) {
    if (!item.text.trim()) return "A line item has a value but no name. Say what it is, or clear the value.";
    if (item.value.trim() && amountNumber(item.value) === null) return `The value of "${item.text.trim().slice(0, 40)}" should be an amount, for example $500.`;
  }
  if ((input.bonuses ?? []).filter((row) => row.trim()).length > MAX.bonuses) return `An offer can list up to ${MAX.bonuses} bonuses.`;
  const pricing = input.pricing;
  if (pricing) {
    if (!(PRICE_KINDS as readonly string[]).includes(pricing.kind)) return "Choose a one-time, monthly or tiered price.";
    if (pricing.kind === "tiered") {
      const tiers = pricing.tiers.filter((tier) => tier.name.trim() || tier.price.trim());
      if (tiers.length < 2) return "A tiered price needs at least two tiers. For one price, choose one-time or monthly.";
      if (tiers.length > MAX.tiers) return `A tiered price can have up to ${MAX.tiers} tiers.`;
      for (const tier of tiers) {
        if (!tier.name.trim()) return "Each tier needs a name, for example Starter.";
        if (amountNumber(tier.price) === null) return `The ${tier.name.trim().slice(0, 30)} tier needs a price with a number, for example $1,500.`;
      }
    } else {
      const amount = pricing.amount.trim();
      const was = pricing.was.trim();
      if (amount && amountNumber(amount) === null) return "The price needs a number, for example $2,500.";
      if (was && !amount) return 'Add the price before its "was" price.';
      if (was && amountNumber(was) === null) return 'The "was" price needs a number, for example $3,000.';
      if (was && amount && (amountNumber(was) ?? 0) <= (amountNumber(amount) ?? 0)) return 'The "was" price should be higher than the price now.';
    }
  }
  const type = input.guaranteeType ?? "";
  if (type && !(GUARANTEE_TYPES as readonly string[]).includes(type)) return "Choose a guarantee type from the list.";
  if (type && type !== "none" && !input.guarantee.trim()) return "Say what the guarantee covers, or choose No guarantee.";
  if (input.guarantee.trim().length > MAX.guarantee) return `Keep the guarantee under ${MAX.guarantee} characters.`;
  if (input.terms.trim().length > MAX.terms) return `Keep the terms under ${MAX.terms} characters.`;
  if ((input.cta ?? "").trim().length > MAX.cta) return `Keep the call to action under ${MAX.cta} characters.`;
  if ((input.channel ?? "").trim().length > MAX.channel) return `Keep the channel under ${MAX.channel} characters.`;
  return null;
}

/** The fields two versions are compared on, in the order the builder asks for them. */
export const OFFER_FIELDS = ["name", "targetCustomer", "outcome", "price", "was", "included", "bonuses", "guaranteeType", "guarantee", "terms", "cta", "channel"] as const;
export type OfferField = (typeof OFFER_FIELDS)[number];

export const FIELD_WORDS: Record<OfferField, string> = {
  name: "Name",
  targetCustomer: "Who it is for",
  outcome: "Outcome",
  price: "Price",
  was: '"Was" price',
  included: "What's included",
  bonuses: "Bonuses",
  guaranteeType: "Guarantee type",
  guarantee: "Guarantee",
  terms: "Terms",
  cta: "Call to action",
  channel: "Channel",
};

export type FieldChange =
  | { field: Exclude<OfferField, "included" | "bonuses">; label: string; before: string; after: string; changed: boolean }
  | { field: "included" | "bonuses"; label: string; before: string[]; after: string[]; added: string[]; removed: string[]; changed: boolean };

/** A line item as one line: its name, and its value when it has one. */
export function itemText(item: OfferItem) {
  return item.value ? `${item.text} (${item.value})` : item.text;
}

function textOf(offer: OfferContent, field: Exclude<OfferField, "included" | "bonuses">) {
  if (field === "was") return offer.pricing?.was ?? "";
  if (field === "guaranteeType") return offer.guaranteeType ? GUARANTEE_WORDS[offer.guaranteeType] : "";
  return offer[field];
}

function listOf(offer: OfferContent, field: "included" | "bonuses") {
  return field === "bonuses" ? offer.bonuses : offer.items.length ? offer.items.map(itemText) : offer.included;
}

/** What changed between two versions of a card, field by field. Lists show what was added and removed. */
export function compareOffers(beforeInput: OfferInput, afterInput: OfferInput): FieldChange[] {
  const before = cleanOffer(beforeInput);
  const after = cleanOffer(afterInput);
  return OFFER_FIELDS.map((field): FieldChange => {
    if (field === "included" || field === "bonuses") {
      const from = listOf(before, field);
      const to = listOf(after, field);
      const was = new Set(from.map((row) => row.toLowerCase()));
      const now = new Set(to.map((row) => row.toLowerCase()));
      const added = to.filter((row) => !was.has(row.toLowerCase()));
      const removed = from.filter((row) => !now.has(row.toLowerCase()));
      return { field, label: FIELD_WORDS[field], before: from, after: to, added, removed, changed: added.length > 0 || removed.length > 0 };
    }
    const from = textOf(before, field);
    const to = textOf(after, field);
    return { field, label: FIELD_WORDS[field], before: from, after: to, changed: from.trim() !== to.trim() };
  });
}

export function sameOffer(a: OfferInput, b: OfferInput) {
  return compareOffers(a, b).every((row) => !row.changed);
}

/** The total of the line items that carry a value, as "$4,300", or empty when none does. */
export function itemsTotal(items: OfferItem[]) {
  const values = items.map((row) => (row.value ? amountNumber(row.value) : null)).filter((row): row is number => row !== null);
  if (values.length === 0) return "";
  return `$${values.reduce((sum, row) => sum + row, 0).toLocaleString("en-US")}`;
}

/** The card as the offer analysis and the chat read it: one line of what is sold, at what price, with what promise. */
export function offerDetailsText(offer: OfferContent) {
  return [
    [offer.name, offer.price].filter(Boolean).join(", "),
    offer.outcome && `Outcome: ${offer.outcome}`,
    offer.targetCustomer && `For: ${offer.targetCustomer}`,
    offer.included.length ? `Includes: ${listOf(offer, "included").join(", ")}` : "",
    offer.bonuses.length ? `Bonuses: ${offer.bonuses.join(", ")}` : "",
    offer.guarantee && `Guarantee: ${offer.guarantee}`,
    offer.terms && `Terms: ${offer.terms}`,
    offer.cta && `Call to action: ${offer.cta}`,
    offer.channel && `Channel: ${offer.channel}`,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1500);
}

/**
 * A starting draft from the business profile: what it sells, to whom, and through which channel. The
 * price note becomes a structured price when it holds one amount.
 */
export function offerFromProfile(profile: { offer: string; priceNotes: string; audience: string; channels: string }): OfferContent {
  const amount = profile.priceNotes.match(/[$£€]\s?\d[\d,]*(?:\.\d+)?\s?k?/i)?.[0]?.replace(/\s/g, "") ?? "";
  const monthly = /\/\s?mo|per month|a month|monthly|retainer/i.test(profile.priceNotes);
  const name = profile.offer.split(/[.;\n]/)[0] ?? "";
  return cleanOffer({
    ...EMPTY_OFFER,
    name,
    price: profile.priceNotes,
    targetCustomer: profile.audience,
    pricing: amount ? { kind: monthly ? "monthly" : "oneTime", amount, was: "", tiers: [] } : null,
    channel: profile.channels.split(/[,;\n]/)[0] ?? "",
  });
}
