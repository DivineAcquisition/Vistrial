/**
 * The Objection Playbook's record, worked out in code before the model writes: the objections heard on the
 * business's calls (most heard first, from lib/dealmaker/objections.ts), the Offer folder a talk track may stand
 * on, the voice and the approved lessons. Ids in the prompt are short aliases; the items' own ids stay out of it.
 */

import type { ObjectionRow } from "../../lib/dealmaker/objections";
import { TRACK_LIMITS, type OfferRef, type TrackObjection, type TrackRecord } from "./shapes";

/** What a talk track may stand on, in this order. */
const OFFER_ORDER: Record<string, number> = { proof: 0, guarantee: 1, package: 2, price: 3 };

export type TrackInput = {
  playbookId: string;
  projectId: string;
  calls: number;
  rows: (Pick<ObjectionRow, "title" | "tag" | "heard" | "quotes" | "worked" | "workedWords"> & { itemId: string })[];
  items: { id: string; folder: string; kind: string; title: string; body: string }[];
  lessons: string[];
};

export function computeTracks(input: TrackInput): TrackRecord {
  const missing: string[] = [];
  const heard = input.rows.filter((row) => row.heard > 0);
  if (heard.length > TRACK_LIMITS.objections) missing.push(`Only the ${TRACK_LIMITS.objections} most heard objections get a talk track this time; ${heard.length - TRACK_LIMITS.objections} more wait for the next run.`);
  const objections: TrackObjection[] = heard.slice(0, TRACK_LIMITS.objections).map((row, i) => ({
    id: `o${i + 1}`,
    itemId: row.itemId,
    title: row.title,
    tag: row.tag,
    heard: row.heard,
    quotes: row.quotes.slice(0, TRACK_LIMITS.quotes).map((quote) => quote.quote),
    worked: row.worked.slice(0, TRACK_LIMITS.quotes).map((item) => item.answerQuote),
    workedWords: row.workedWords,
  }));
  const offer: OfferRef[] = input.items
    .filter((row) => row.folder === "offer" && Object.hasOwn(OFFER_ORDER, row.kind))
    .sort((a, b) => OFFER_ORDER[a.kind] - OFFER_ORDER[b.kind])
    .slice(0, TRACK_LIMITS.offerItems)
    .map((row, i) => ({ id: `f${i + 1}`, itemId: row.id, kind: row.kind, title: row.title, body: row.body.slice(0, TRACK_LIMITS.offerBody) }));
  if (!offer.length) missing.push("The Offer folder is empty, so the talk tracks cannot point to a package or proof. Add them in the Playbook.");
  else if (!offer.some((row) => row.kind === "proof")) missing.push("The Offer folder holds no proof, so no talk track names a result.");
  const voice = input.items.find((row) => row.kind === "voice");
  return {
    playbookId: input.playbookId,
    projectId: input.projectId,
    calls: input.calls,
    objections,
    offer,
    voice: voice ? `${voice.title}. ${voice.body}`.slice(0, 400) : null,
    lessons: input.lessons.slice(0, TRACK_LIMITS.lessons),
    missing,
    refs: {},
  };
}
