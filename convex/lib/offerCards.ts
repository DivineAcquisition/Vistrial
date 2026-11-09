/**
 * Offer card content, compared and cleaned in code. Pure, so the server and the screen share it.
 */

export const OFFER_FIELDS = ["name", "price", "included", "guarantee", "terms", "targetCustomer"] as const;
export type OfferField = (typeof OFFER_FIELDS)[number];

export const FIELD_WORDS: Record<OfferField, string> = {
  name: "Name",
  price: "Price",
  included: "What's included",
  guarantee: "Guarantee",
  terms: "Terms",
  targetCustomer: "Target customer",
};

export type OfferContent = { name: string; price: string; included: string[]; guarantee: string; terms: string; targetCustomer: string };

export const MAX = { name: 120, price: 120, item: 160, items: 12, guarantee: 400, terms: 400, targetCustomer: 300, note: 300 } as const;

/** "Not stated" is how the analysis marks a blank; a card keeps it blank so the screen says so itself. */
export const NOT_STATED = /^not (stated|enough data)\b/i;

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim().slice(0, max);
  return NOT_STATED.test(flat) ? "" : flat;
}

/** Cleans what a person or an analysis wrote into card content. Empty items and repeats are dropped. */
export function cleanOffer(input: OfferContent): OfferContent {
  const seen = new Set<string>();
  const included = input.included
    .map((row) => clip(row, MAX.item))
    .filter((row) => row && !seen.has(row.toLowerCase()) && seen.add(row.toLowerCase()))
    .slice(0, MAX.items);
  return {
    name: clip(input.name, MAX.name),
    price: clip(input.price, MAX.price),
    included,
    guarantee: clip(input.guarantee, MAX.guarantee),
    terms: clip(input.terms, MAX.terms),
    targetCustomer: clip(input.targetCustomer, MAX.targetCustomer),
  };
}

export type FieldChange =
  | { field: Exclude<OfferField, "included">; label: string; before: string; after: string; changed: boolean }
  | { field: "included"; label: string; before: string[]; after: string[]; added: string[]; removed: string[]; changed: boolean };

/** What changed between two versions of a card, field by field. "What's included" lists items added and removed. */
export function compareOffers(before: OfferContent, after: OfferContent): FieldChange[] {
  return OFFER_FIELDS.map((field): FieldChange => {
    if (field === "included") {
      const was = new Set(before.included.map((row) => row.toLowerCase()));
      const now = new Set(after.included.map((row) => row.toLowerCase()));
      const added = after.included.filter((row) => !was.has(row.toLowerCase()));
      const removed = before.included.filter((row) => !now.has(row.toLowerCase()));
      return { field, label: FIELD_WORDS[field], before: before.included, after: after.included, added, removed, changed: added.length > 0 || removed.length > 0 };
    }
    return { field, label: FIELD_WORDS[field], before: before[field], after: after[field], changed: before[field].trim() !== after[field].trim() };
  });
}

export function sameOffer(a: OfferContent, b: OfferContent) {
  return compareOffers(a, b).every((row) => !row.changed);
}

