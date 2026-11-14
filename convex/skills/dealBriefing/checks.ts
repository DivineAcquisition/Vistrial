/**
 * The completion checks for a pre-call brief, in code. No model call says a brief passed: each check reads the
 * structured answer against what the read step found. docs/rebuild/dealmaker.md, section 4.3.
 */

import { claimsResult } from "../../lib/agentTasks";
import { normal } from "../playbookStudy/tools";
import { BRIEF_LIMITS, type Brief, type BriefRecord, type ChecksRecord, type CheckResult } from "./shapes";

export const CHECK_NAMES = [
  [1, "Every quote is the source's own words"],
  [2, "Objections come from this lead's calls or the Playbook"],
  [3, "The package named is in the Offer folder"],
  [4, "No price beyond the offer"],
  [5, "Nothing guessed about the lead as a person"],
  [6, "No promise and no pressure"],
  [7, "Answers what to cover and how to open, each point grounded"],
] as const;

/** Guesses about a person that no kept field holds (age, family, income, health, beliefs). */
export const PERSONAL = /\b(\d+\s*years? old|in (his|her|their) (20s|30s|40s|50s|60s)|married|divorced|single (mom|mum|dad|parent)|wife|husband|kids|children|pregnan\w*|income|salary|net worth|religio\w*|church|disabilit\w*|illness|diagnos\w*)\b/i;

/** Manufactured urgency or scarcity: the doctrine forbids it (IV). */
const PRESSURE = /\b(act (now|fast)|limited[- ]time|only \d+ (spots?|places?|seats?) left|before it'?s gone|last chance|price (goes|will go) up|expires? (today|tonight|soon)|fomo|create (some )?urgency|push (them|him|her) to (sign|decide|close))\b/i;

/** Money as written in a brief: $1,500, 1500 USD, £300, €2k. */
const MONEY = /(?:[$£€]\s?\d[\d,]*(?:\.\d+)?\s?[kK]?|\b\d[\d,]*(?:\.\d+)?\s?[kK]?\s?(?:USD|EUR|GBP|CAD|AUD|dollars|pounds|euros)\b)/g;

function amount(raw: string) {
  const digits = raw.replace(/[^\d.kK]/g, "");
  const thousands = /k$/i.test(digits);
  const value = Number(digits.replace(/[kK]/g, ""));
  return Number.isFinite(value) ? (thousands ? value * 1000 : value) : NaN;
}

/** Every amount of money a text names. */
export function moneyIn(text: string) {
  return [...text.matchAll(MONEY)].map((match) => amount(match[0])).filter((value) => Number.isFinite(value));
}

/** The amounts a brief may name: those in the Offer folder and those the CRM records (the deal's value). */
function allowedMoney(record: BriefRecord) {
  const texts = [...record.playbook.filter((row) => row.folder === "offer").map((row) => `${row.title} ${row.body}`), ...record.facts.map((row) => row.display)];
  return new Set(texts.flatMap((row) => moneyIn(row)));
}

/** Whether a quote is found in its source as written, case and spacing aside (the rule markText uses). */
export function quoted(quote: string, source: string) {
  const q = normal(quote);
  return q.length >= 3 && normal(source).includes(q);
}

export function runChecks(brief: Brief | null, record: BriefRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES[id - 1][1], passed, detail });
  if (!brief) {
    for (const [id] of CHECK_NAMES) add(id, false, "The brief could not be read.");
    return { passed: false, results };
  }
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  const items = new Map(record.playbook.map((row) => [row.id, row]));
  const facts = new Set(record.facts.map((row) => row.id));

  // 1. Each readiness finding and commitment quotes its source, and the quote is there.
  const quotedRows = [...brief.readiness, ...brief.commitments, ...brief.objections.filter((row) => sources.has(row.sourceId))];
  const bad = quotedRows.filter((row) => {
    const source = sources.get(row.sourceId);
    return !source || !quoted(row.quote, source.text);
  });
  add(1, bad.length === 0, bad.length === 0 ? `${quotedRows.length} quote(s), each found in its source.` : `${bad.length} quote(s) are not in the source they cite: "${bad[0].quote.slice(0, 60)}".`);

  // 2. An objection is the lead's own (a quote from their call) or one the Playbook holds; never invented.
  const strays = brief.objections.filter((row) => {
    const source = sources.get(row.sourceId);
    if (source) return source.type !== "call";
    return items.get(row.sourceId)?.kind !== "objection";
  });
  const tooMany = brief.objections.length > BRIEF_LIMITS.objections;
  add(2, strays.length === 0 && !tooMany, tooMany ? `At most ${BRIEF_LIMITS.objections} likely objections.` : strays.length ? `${strays.length} objection(s) come from neither this lead's calls nor the Playbook.` : `${brief.objections.length} likely objection(s), each with where it came from.`);

  // 3. The package that fits is one the Offer folder holds, or none is named.
  const fit = brief.offerFit.itemId;
  const fitOk = fit === "" ? true : items.get(fit)?.folder === "offer" && items.get(fit)?.kind === "package";
  add(3, fitOk, fitOk ? (fit ? `Names ${items.get(fit)!.title}, from the Offer folder.` : "Names no package.") : `"${fit}" is not a package in the Offer folder.`);

  // 4. Money only as the offer or the CRM states it (it never sets a price).
  const texts = [brief.summary, brief.openingQuestion, brief.offerFit.why, ...brief.cover.map((row) => row.point), ...brief.readiness.map((row) => row.finding), ...brief.commitments.map((row) => row.what), ...brief.objections.map((row) => row.objection), ...brief.disagreements.map((row) => row.what)];
  const allowed = allowedMoney(record);
  const prices = texts.flatMap((row) => moneyIn(row)).filter((value) => !allowed.has(value));
  add(4, prices.length === 0, prices.length === 0 ? "Names no price the offer or the CRM does not state." : `Names amounts the offer does not state: ${prices.slice(0, 4).join(", ")}.`);

  // 5. Nothing about the lead beyond kept fields and their own words.
  const personal = texts.find((row) => PERSONAL.test(row) && !record.sources.some((source) => quoted(row.match(PERSONAL)![0], source.text)));
  add(5, !personal, personal ? `Guesses about the lead as a person: "${personal.slice(0, 80)}".` : "Says nothing about the lead that a field or their own words do not.");

  // 6. No promise of a result, no manufactured urgency.
  const promise = texts.find((row) => claimsResult(row));
  const pressure = texts.find((row) => PRESSURE.test(row));
  add(6, !promise && !pressure, promise ? `Reads as a promise: "${promise.slice(0, 80)}".` : pressure ? `Manufactures urgency: "${pressure.slice(0, 80)}".` : "Promises nothing and invents no urgency.");

  // 7. The standard: a summary, one to five points to cover each citing something read, an opening question, and
  //    every commitment with its owner; a disagreement names at least two things.
  const known = (id: string) => facts.has(id) || sources.has(id) || items.has(id);
  const loose = brief.cover.filter((row) => !row.point || !row.refs.some(known));
  const split = brief.disagreements.filter((row) => row.refs.filter(known).length < 2);
  const coverOk = brief.cover.length >= 1 && brief.cover.length <= BRIEF_LIMITS.cover;
  const openOk = brief.openingQuestion.trim().endsWith("?");
  const ok = Boolean(brief.summary) && coverOk && loose.length === 0 && openOk && split.length === 0 && brief.commitments.every((row) => row.what);
  add(
    7,
    ok,
    ok
      ? `${brief.cover.length} point(s) to cover, each grounded, and an opening question.`
      : !brief.summary
        ? "The brief has no summary."
        : !coverOk
          ? `Give one to ${BRIEF_LIMITS.cover} points to cover.`
          : loose.length
            ? `${loose.length} point(s) to cover cite nothing the brief read.`
            : !openOk
              ? "The opening line is not a question."
              : split.length
                ? "A disagreement between records must name both records."
                : "A commitment says nothing.",
  );

  return { passed: results.every((row) => row.passed), results };
}
