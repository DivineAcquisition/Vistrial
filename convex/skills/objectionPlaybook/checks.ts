/**
 * The completion checks for the objection playbook's talk tracks, in code. No model call says a track passed.
 * docs/rebuild/dealmaker.md, 4.5: answers grounded in the approved offer and its proof; an answer that claims a
 * result is refused.
 */

import { claimsResult } from "../../lib/agentTasks";
import { PERSONAL, PRESSURE, moneyIn } from "../dealBriefing/checks";
import { TRACK_LIMITS, type ChecksRecord, type CheckResult, type TrackRecord, type Tracks } from "./shapes";

export const CHECK_NAMES = [
  [1, "Each talk track answers one objection heard on the calls"],
  [2, "Every objection heard has a talk track"],
  [3, "Every offer item named is in the Offer folder"],
  [4, "No price beyond the offer"],
  [5, "No promised result; every figure comes from the offer item it names"],
  [6, "No pressure and nothing guessed about a person"],
  [7, "Short enough to say on a call"],
] as const;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Figures that are not money: "41 booked consultations", "30 days", "3x". */
function figuresIn(text: string) {
  const withoutMoney = text.replace(/(?:[$£€]\s?\d[\d,]*(?:\.\d+)?\s?[kK]?|\b\d[\d,]*(?:\.\d+)?\s?[kK]?\s?(?:USD|EUR|GBP|CAD|AUD|dollars|pounds|euros)\b)/g, " ");
  return [...withoutMoney.matchAll(/\d[\d,.]*/g)].map((match) => match[0].replace(/[,.]+$/, "").replace(/,/g, ""));
}

export function runChecks(draft: Tracks | null, record: TrackRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES.find((row) => row[0] === id)![1], passed, detail });
  if (!draft) {
    for (const [id] of CHECK_NAMES) add(id, false, "No talk tracks were written.");
    return { passed: false, results };
  }
  const objections = new Set(record.objections.map((row) => row.id));
  const offer = new Map(record.offer.map((row) => [row.id, row]));
  const tracks = draft.tracks.filter((row) => row.track);

  // 1. Each track answers one objection shown, once.
  const ids = tracks.map((row) => row.objectionId);
  const strays = ids.filter((id) => !objections.has(id));
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  add(1, strays.length === 0 && twice.length === 0, strays.length ? `${strays.length} talk track(s) answer no objection heard on the calls.` : twice.length ? "An objection has more than one talk track." : `${tracks.length} talk track(s), one per objection.`);

  // 2. Every objection heard has one.
  const without = record.objections.filter((row) => !ids.includes(row.id));
  add(2, without.length === 0, without.length ? `No talk track for: ${without.map((row) => row.title).slice(0, 3).join("; ")}.` : "Every objection heard has a talk track.");

  // 3. Offer items named exist.
  const unknown = tracks.flatMap((row) => row.offerIds.filter((id) => !offer.has(id)));
  add(3, unknown.length === 0, unknown.length ? `Names offer items that are not in the Offer folder: ${[...new Set(unknown)].slice(0, 3).join(", ")}.` : "Every offer item named is in the Offer folder.");

  // 4. Money only as the Offer folder states it.
  const allowed = new Set(record.offer.flatMap((row) => moneyIn(`${row.title} ${row.body}`)));
  const prices = tracks.flatMap((row) => moneyIn(row.track).filter((value) => !allowed.has(value)));
  add(4, prices.length === 0, prices.length ? `Names amounts the Offer folder does not state: ${prices.slice(0, 3).join(", ")}.` : "No price beyond the offer.");

  // 5. No promise; a figure only from the offer item the track names.
  const promising = tracks.find((row) => claimsResult(row.track));
  const ungrounded = tracks.flatMap((row) => {
    const cited = row.offerIds.map((id) => offer.get(id)).filter(Boolean).map((item) => `${item!.title} ${item!.body}`);
    const known = new Set(cited.flatMap((text) => figuresIn(text)));
    return figuresIn(row.track).filter((figure) => !known.has(figure));
  });
  add(5, !promising && ungrounded.length === 0, promising ? `Reads as a promise of a result: "${promising.track.slice(0, 80)}".` : ungrounded.length ? `Figures not found in the offer items named: ${[...new Set(ungrounded)].slice(0, 3).join(", ")}.` : "Promises nothing; every figure is from the offer item named.");

  // 6. No pressure, nothing about a person.
  const pushy = tracks.find((row) => PRESSURE.test(row.track));
  const personal = tracks.find((row) => PERSONAL.test(row.track));
  add(6, !pushy && !personal, pushy ? "A talk track invents urgency." : personal ? "A talk track guesses about the lead as a person." : "No pressure and nothing personal.");

  // 7. Short.
  const long = tracks.filter((row) => words(row.track) > TRACK_LIMITS.trackWords);
  add(7, long.length === 0 && tracks.length > 0, tracks.length === 0 ? "No talk tracks were written." : long.length ? `${long.length} talk track(s) are longer than ${TRACK_LIMITS.trackWords} words.` : `Each is at most ${TRACK_LIMITS.trackWords} words.`);

  return { passed: results.every((row) => row.passed), results };
}
