import type { Regulated } from "../../lib/brandKits";
import { offerDetailsText } from "../../lib/offerCards";
import { containsPhrase, longestSharedRun, sharedPhraseShare, words } from "../../lib/similarity";
import { COPY_MAX, MAX_SHARED_RUN, MAX_SHARED_SHARE, VARIATIONS, allCopy, exampleFigures, factualCopy, referenceText, type CheckResult, type ChecksRecord, type CopyClaim, type CreativeContext, type CreativeSet } from "./shapes";

/**
 * The completion check for a creative. Code decides; no model call says a creative passed. Every check
 * reads the copy itself and the records it cites, never a model's opinion of its own writing.
 */
export type CheckInput = { creative: CreativeSet | null; context: CreativeContext; runCostCents: number; capCents: number };

export const CHECK_NAMES: [number, string][] = [
  [1, "Four complete variations"],
  [2, "New words, not the reference's"],
  [3, "On brand"],
  [4, "Fits the placements"],
  [5, "Claims are backed"],
  [6, "Used the business context"],
  [7, "Within the cost cap"],
];

/** Wording that states a result, a price or a promise as fact. A sentence with any of it needs backing. */
const CLAIM_WORDS = /\d+(\.\d+)?\s?%|[$£€]\s?\d|\b\d+(\.\d+)?x\b|\bguarantee[ds]?\b|\bmoney[- ]back\b|\bproven\b|#\s?1\b|\bnumber one\b|\b\d+\s+(day|days|week|weeks|month|months)\b/i;

/** More of the same for fields where ad claims are held to stricter rules. */
const REGULATED_WORDS: Record<Exclude<Regulated, "none">, RegExp> = {
  health: /\bcures?\b|\bcured\b|\bheals?\b|\btreats?\b|\bpain[- ]free\b|\blose\s+(weight|\d)|\bclinically\b|\bdoctor[- ]recommended\b|\bside effects?\b/i,
  finance: /\bearn(s|ed|ings)?\b|\bincome\b|\breturns?\b|\bprofits?\b|\bmake\s+(money|[$£€]?\d)|\brisk[- ]free\b|\bpassive\b|\bfinancial freedom\b/i,
  other: /\bcertified\b|\blicensed\b|\bapproved\b|\bcompliant\b/i,
};

/** Wording that turns an example into a claim about this business or its customers. */
const OWN_RESULT = /\b(our|we|my)\b|\bclients?\b|\bcustomers?\b|\bguarantee|\btestimonial|\breviews?\b|\brated\b/i;

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
}

/** The sentences of a piece of copy that state something as fact and so need a verified fact or the offer behind them. */
export function claimSentences(text: string, regulated: Regulated): string[] {
  const extra = regulated === "none" ? null : REGULATED_WORDS[regulated];
  return sentences(text).filter((row) => CLAIM_WORDS.test(row) || (extra !== null && extra.test(row)));
}

function numbersIn(text: string) {
  return (text.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((row) => row.replace(/,/g, ""));
}

/** Whether a listed claim stands: its facts are verified ones on record, or the offer card says what it says. */
export function claimStands(claim: CopyClaim, context: CreativeContext): boolean {
  if (!claim.text) return false;
  if (claim.support === "fact") {
    const verified = new Set(context.facts.filter((row) => row.status === "verified").map((row) => row.id));
    return claim.factIds.length > 0 && claim.factIds.every((id) => verified.has(id));
  }
  if (!context.offer) return false;
  const offer = offerDetailsText(context.offer.content);
  const offerNumbers = new Set(numbersIn(offer));
  // Every figure in the claim must be one the offer card states, and a guarantee must be one the card gives.
  if (!numbersIn(claim.text).every((value) => offerNumbers.has(value))) return false;
  if (/\bguarantee|\bmoney[- ]back/i.test(claim.text) && !context.offer.content.guarantee.trim()) return false;
  return true;
}

function norm(value: string) {
  return words(value).join(" ");
}

export function runChecks(input: CheckInput): ChecksRecord {
  const { creative, context } = input;
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES[id - 1][1], passed, detail });
  if (!creative) {
    for (const [id] of CHECK_NAMES) add(id, false, "The creative could not be read.");
    return { passed: false, results };
  }
  const kit = context.kit.content;

  // 1. Four variations, each whole, each with its own hook and something it tests.
  const whole = creative.variations.filter((row) => row.hook && row.primaryText && row.headline && row.cta && row.imageDirection && row.hypothesis && row.design.visual);
  const hooks = new Set(creative.variations.map((row) => norm(row.hook)));
  const fourOk = creative.variations.length === VARIATIONS && whole.length === VARIATIONS && hooks.size === VARIATIONS;
  add(
    1,
    fourOk,
    creative.variations.length !== VARIATIONS
      ? `There are ${creative.variations.length} variations. A set has ${VARIATIONS}.`
      : whole.length !== VARIATIONS
        ? "A variation is missing its hook, text, headline, call to action, image direction, designed-ad visual or what it tests."
        : hooks.size !== VARIATIONS
          ? "Two variations open with the same hook."
          : "Four variations, each with its own hook and what it tests.",
  );

  // 2. Structure may be modelled; wording may not. Compared in code against the reference's own words.
  const reference = referenceText(context.reference);
  const copy = allCopy(creative);
  const shared = reference ? longestSharedRun(copy, reference) : [];
  const share = reference ? sharedPhraseShare(copy, reference) : 0;
  const newWords = shared.length <= MAX_SHARED_RUN && share <= MAX_SHARED_SHARE;
  add(
    2,
    newWords,
    !reference
      ? "There is no reference ad, so there is nothing to compare against."
      : shared.length > MAX_SHARED_RUN
        ? `The copy repeats the reference's wording: "${shared.join(" ")}". Say it in new words.`
        : share > MAX_SHARED_SHARE
          ? `${Math.round(share * 100)}% of the copy's phrases also appear in the reference. Say it in new words.`
          : "The wording is new. Only the structure follows the reference.",
  );

  // 3. The brand's own rules: words it avoids, topics it stays away from, and no competitor or reference advertiser by name.
  const avoided = kit.avoidWords.filter((word) => containsPhrase(copy, word));
  const banned = kit.bannedTopics.filter((topic) => containsPhrase(copy, topic));
  const named = context.blockedNames.filter((name) => containsPhrase(copy, name));
  add(
    3,
    avoided.length + banned.length + named.length === 0,
    avoided.length
      ? `The copy uses words this brand avoids: ${avoided.join(", ")}.`
      : banned.length
        ? `The copy touches topics this brand stays away from: ${banned.join(", ")}.`
        : named.length
          ? `The copy names another business: ${named.join(", ")}.`
          : "The copy keeps to the brand's rules and names no other business.",
  );

  // 4. Lengths the ad platforms show without cutting off.
  const long: string[] = [];
  for (const row of creative.variations) {
    if (row.hook.length > COPY_MAX.hook) long.push(`${row.key} hook`);
    if (row.headline.length > COPY_MAX.headline) long.push(`${row.key} headline`);
    if (row.primaryText.length > COPY_MAX.primaryText) long.push(`${row.key} text`);
    if (row.cta.length > COPY_MAX.cta) long.push(`${row.key} call to action`);
    if (row.design.eyebrow.length > COPY_MAX.eyebrow) long.push(`${row.key} top bar`);
    if (row.design.kicker.length > COPY_MAX.kicker) long.push(`${row.key} line above the headline`);
    if (row.design.subline.length > COPY_MAX.subline) long.push(`${row.key} line under the picture`);
    if (row.design.labels.length > COPY_MAX.labels || row.design.labels.some((label) => label.length > COPY_MAX.label)) long.push(`${row.key} labels`);
  }
  creative.captions.forEach((caption, index) => {
    if (caption.length > COPY_MAX.caption) long.push(`caption ${index + 1}`);
  });
  add(4, long.length === 0, long.length ? `Too long to show in full: ${long.join(", ")}.` : "Every field fits its placement.");

  // 5. A sentence that states a result, a price or a promise must be a listed claim backed by a verified fact or the offer card.
  const standing = creative.claims.filter((claim) => claimStands(claim, context));
  // Example figures on a designed ad's visual are the one exception: marked as examples in the picture, never in a
  // regulated field, and never worded as this business's own result.
  const examples = creative.variations.filter(exampleFigures);
  const ownResult = examples.filter((row) => row.design.labels.some((label) => OWN_RESULT.test(label)));
  const unbacked = claimSentences(factualCopy(creative), kit.regulated).filter((sentence) => !standing.some((claim) => containsPhrase(sentence, claim.text) || containsPhrase(claim.text, sentence)));
  const fallen = creative.claims.length - standing.length;
  add(
    5,
    unbacked.length === 0 && fallen === 0 && (examples.length === 0 || kit.regulated === "none") && ownResult.length === 0,
    examples.length > 0 && kit.regulated !== "none"
      ? "This brand is in a regulated field, so example figures are not allowed on its ads. Remove them from the labels."
      : ownResult.length > 0
        ? `Example figures cannot be worded as this business's own results (${ownResult.map((row) => row.key).join(", ")}). Reword the labels.`
        : fallen > 0
      ? `${fallen} listed claim(s) cite no verified fact, or state something the offer card does not.`
      : unbacked.length
        ? `These state a result, a price or a promise with nothing on record behind them: ${unbacked.slice(0, 3).map((row) => `"${row}"`).join("; ")}. Back each with a verified fact or the offer, or reword it.`
        : examples.length > 0
          ? `Every result, price and promise in the copy is backed. The figures on the visual of ${examples.map((row) => row.key).join(", ")} are examples, and the picture says so.`
          : "Every result, price and promise in the copy is backed by a verified fact or the offer card.",
  );

  // 6. The context it says it used is real, and it used some when there is any.
  const factIds = new Set(context.facts.map((row) => row.id));
  const usedProfileOk = creative.contextUsed.profileVersionId === null || creative.contextUsed.profileVersionId === context.profile?.versionId;
  const usedFactsOk = creative.contextUsed.factIds.every((id) => factIds.has(id));
  const usedSomething = creative.contextUsed.profileVersionId !== null || creative.contextUsed.factIds.length > 0;
  const mustUse = context.profile !== null || context.facts.length > 0;
  add(
    6,
    usedProfileOk && usedFactsOk && (!mustUse || usedSomething) && Boolean(creative.brief.audience && creative.brief.promise),
    !usedProfileOk || !usedFactsOk
      ? "The creative lists context that is not on record."
      : mustUse && !usedSomething
        ? "The workspace has business context, but the creative lists none as used."
        : !creative.brief.audience || !creative.brief.promise
          ? "The brief does not say who the creative is for or what it promises."
          : "The brief names its audience and promise, and the context used is real.",
  );

  // 7. Cost.
  add(7, input.runCostCents <= input.capCents, input.runCostCents <= input.capCents ? "The run stayed within its cost cap." : "The run went over its cost cap.");

  return { passed: results.every((row) => row.passed), results };
}
