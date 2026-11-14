/**
 * The Objection Playbook's figures, worked out in code from the business's own calls (docs/rebuild/dealmaker.md,
 * 0.8 "Objection Playbook" and 4.5): how often each objection in the Objections folder is heard, the lead's own
 * words, what was said back on calls that later closed against ones that did not, and per rep. No model and no
 * credits: the counts and quotes update as calls are reviewed or noted.
 *
 * Evidence rules (doctrine 0.0):
 * - A quote is shown only when it is the buyer's words on the call (its speaker line is the lead's). A quote a rep
 *   said, or one with no named speaker, is counted but never shown as the lead's.
 * - The closer's notes count as the closer's account: heard, with no quote.
 * - "What worked" compares the business's own calls. Below `MIN_CALLS` calls it says "Not enough data" and
 *   draws no comparison.
 * - The starter set is labelled "not yet heard on your calls" until a call hears it.
 */

import type { Id } from "../../_generated/dataModel";
import type { ObjectionTag } from "../playbook";
import type { ReviewView } from "./reviewView";

/** An objection's title for matching: case, quotes and punctuation do not count. Kept here so screens can import this file. */
export function titleKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/(^|\s)'|'(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Calls needed before the playbook compares what was said back (4.5: "at least 5, else Not enough data"). */
export const MIN_CALLS = 5;

export const OBJECTION_LIMITS = {
  /** Calls read, newest first. */
  calls: 400,
  /** Quotes kept per objection. */
  quotes: 5,
  /** Answers shown per objection from calls that later closed. */
  worked: 3,
  /** Objections heard on calls that are not in the Playbook yet. */
  unmatched: 12,
} as const;

export type CallOutcome = "won" | "lost" | "open";

export const OUTCOME_WORDS: Record<CallOutcome, string> = { won: "later won", lost: "later lost", open: "still open" };

/** A starter objection for agencies, consultants, coaches and course sellers: what it is, never what to say. */
export const STARTER_OBJECTIONS: readonly { tag: ObjectionTag; title: string; body: string }[] = [
  { tag: "money", title: "It costs more than I expected", body: "The price is above what they had in mind, or above what they think the result is worth to them." },
  { tag: "money", title: "No budget for this right now", body: "The money is not set aside yet, or is tied up until a later month or quarter." },
  { tag: "time", title: "I need to think about it", body: "No decision on the call. Often a question they have not said out loud yet." },
  { tag: "time", title: "Not the right time", body: "Something else comes first for them right now: a launch, a busy season, a hire." },
  { tag: "trust", title: "I tried something like this before and it did not work", body: "A past agency, coach or course let them down, and they expect the same again." },
  { tag: "trust", title: "I need to talk to my partner first", body: "Someone else decides or shares the decision: a business partner, a spouse, a board." },
  { tag: "fit", title: "Not sure this works for a business like mine", body: "They doubt the offer fits their market, their size or the way they work." },
  { tag: "fit", title: "I could do this myself", body: "They think they or their team could do it without paying for help." },
];

/** A Playbook objection, as the counting needs it. */
export type ObjectionItem = { id: Id<"playbookItems">; title: string; tag: ObjectionTag | null; starter: boolean };

/** One call the business reviewed or noted, with what was heard on it. */
export type HeardCall = {
  /** The review's or the notes' id. */
  id: string;
  from: "review" | "notes";
  at: number;
  leadName: string;
  dealRef: string | null;
  /** The rep, by name, when known: the deal's owner, else the closer who wrote the notes. */
  rep: string | null;
  outcome: CallOutcome;
  objections: {
    title: string;
    itemId: Id<"playbookItems"> | null;
    /** The buyer's own words, only when the transcript's speaker line is the lead's. */
    quote: string | null;
    answered: boolean;
    /** What our side said back, from the transcript. */
    answerQuote: string | null;
  }[];
};

export type Tally = { calls: number; won: number; lost: number; open: number };

export type ObjectionRow = {
  itemId: Id<"playbookItems">;
  title: string;
  tag: ObjectionTag | null;
  starter: boolean;
  heard: number;
  lastHeard: number | null;
  /** "Heard on 4 calls", "Not yet heard on your calls". */
  heardWords: string;
  quotes: { quote: string; at: number; leadName: string | null }[];
  answered: Tally;
  unanswered: Tally;
  /** "Answered on 3 calls: 2 later won, 1 still open." or "Not enough data: …". */
  workedWords: string;
  /** What our side said back on calls that later closed. Only once there are enough calls. */
  worked: { answerQuote: string; at: number }[];
  /** Per rep, for the Owner only. */
  reps?: { name: string; heard: number; answered: number; won: number }[];
};

export type UnmatchedRow = { title: string; heard: number; quote: string | null; lastHeard: number; reviewId: string | null };

const empty = (): Tally => ({ calls: 0, won: 0, lost: 0, open: 0 });

function add(tally: Tally, outcome: CallOutcome) {
  tally.calls += 1;
  tally[outcome] += 1;
}

export function tallyWords(tally: Tally) {
  const parts = (["won", "lost", "open"] as const).filter((key) => tally[key] > 0).map((key) => `${tally[key]} ${OUTCOME_WORDS[key]}`);
  return parts.length ? parts.join(", ") : "none closed yet";
}

const calls = (count: number) => `${count} call${count === 1 ? "" : "s"}`;

/** A deal's state from the CRM, else from how the closer said the call ended. */
export function outcomeOf(dealStatus: string | null | undefined, noteOutcome?: string | null): CallOutcome {
  if (dealStatus === "won") return "won";
  if (dealStatus === "lost" || dealStatus === "abandoned") return "lost";
  if (dealStatus) return "open";
  if (noteOutcome === "yes") return "won";
  if (noteOutcome === "no" || noteOutcome === "notFit") return "lost";
  return "open";
}

/** The objections a passing call review heard: the buyer's words, or the closer's account. A rep's own line is not an objection. */
export function reviewObjections(view: Pick<ReviewView, "objections">): HeardCall["objections"] {
  return view.objections
    .filter((row) => !row.kind.startsWith("Rep's words"))
    .map((row) => ({
      title: row.text,
      itemId: row.itemId ?? null,
      quote: row.kind === "Buyer's words" ? row.quote : null,
      answered: row.answered,
      answerQuote: row.answered && row.answerQuote ? row.answerQuote : null,
    }));
}

/** Matches an objection to a Playbook item: the item the review or the notes named, else the same title. */
function matcher(items: ObjectionItem[]) {
  const ids = new Set(items.map((row) => row.id));
  const byTitle = new Map(items.map((row) => [titleKey(row.title), row.id]));
  return (row: { title: string; itemId: Id<"playbookItems"> | null }) => (row.itemId && ids.has(row.itemId) ? row.itemId : (byTitle.get(titleKey(row.title)) ?? null));
}

/**
 * The Objection Playbook from the calls: one row per Playbook objection (heard first, most heard first, then the
 * starter set not yet heard), and the objections heard that the Playbook does not hold yet.
 */
export function objectionPlaybook(input: { items: ObjectionItem[]; calls: HeardCall[]; showLeads: boolean; showReps: boolean }) {
  const match = matcher(input.items);
  const callsHeard = input.calls.length;
  const enough = callsHeard >= MIN_CALLS;
  type Acc = { row: ObjectionRow; reps: Map<string, { heard: number; answered: number; won: number }> };
  const acc = new Map<string, Acc>(
    input.items.map((item) => [
      item.id,
      {
        row: { itemId: item.id, title: item.title, tag: item.tag, starter: item.starter, heard: 0, lastHeard: null, heardWords: "", quotes: [], answered: empty(), unanswered: empty(), workedWords: "", worked: [] },
        reps: new Map(),
      },
    ]),
  );
  const unmatched = new Map<string, UnmatchedRow>();
  const sorted = [...input.calls].sort((a, b) => b.at - a.at);
  for (const call of sorted) {
    // One count per objection per call, however often it came up on that call.
    const seen = new Set<string>();
    for (const said of call.objections) {
      const itemId = match(said);
      if (!itemId) {
        const key = titleKey(said.title);
        if (!key) continue;
        const row = unmatched.get(key);
        if (row) {
          if (!seen.has(`u:${key}`)) row.heard += 1;
          if (!row.quote && said.quote) row.quote = said.quote;
        } else unmatched.set(key, { title: said.title, heard: 1, quote: said.quote, lastHeard: call.at, reviewId: call.from === "review" ? call.id : null });
        seen.add(`u:${key}`);
        continue;
      }
      const entry = acc.get(itemId)!;
      const row = entry.row;
      if (said.quote && row.quotes.length < OBJECTION_LIMITS.quotes && !row.quotes.some((item) => item.quote === said.quote)) row.quotes.push({ quote: said.quote, at: call.at, leadName: input.showLeads ? call.leadName : null });
      if (said.answered && said.answerQuote && call.outcome === "won" && row.worked.length < OBJECTION_LIMITS.worked && !row.worked.some((item) => item.answerQuote === said.answerQuote)) row.worked.push({ answerQuote: said.answerQuote, at: call.at });
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      row.heard += 1;
      row.lastHeard = row.lastHeard ?? call.at;
      add(said.answered ? row.answered : row.unanswered, call.outcome);
      const rep = call.rep ?? "Not known";
      const mine = entry.reps.get(rep) ?? { heard: 0, answered: 0, won: 0 };
      mine.heard += 1;
      if (said.answered) mine.answered += 1;
      if (call.outcome === "won") mine.won += 1;
      entry.reps.set(rep, mine);
    }
  }
  const rows = [...acc.values()].map(({ row, reps }) => {
    row.heardWords = row.heard ? `Heard on ${calls(row.heard)}` : row.starter ? "Starter set: not yet heard on your calls" : "Not yet heard on a reviewed call";
    if (!row.heard) row.workedWords = "";
    else if (!enough) row.workedWords = `Not enough data: ${callsHeard} of ${MIN_CALLS} calls reviewed or noted, so what worked is not compared yet.`;
    else
      row.workedWords = [row.answered.calls ? `Answered on ${calls(row.answered.calls)}: ${tallyWords(row.answered)}.` : "", row.unanswered.calls ? `Not answered on ${calls(row.unanswered.calls)}: ${tallyWords(row.unanswered)}.` : ""]
        .filter(Boolean)
        .join(" ");
    if (!enough) row.worked = [];
    if (input.showReps && reps.size) row.reps = [...reps.entries()].map(([name, figures]) => ({ name, ...figures })).sort((a, b) => b.heard - a.heard || a.name.localeCompare(b.name));
    return row;
  });
  rows.sort((a, b) => b.heard - a.heard || Number(a.starter) - Number(b.starter) || (b.lastHeard ?? 0) - (a.lastHeard ?? 0) || a.title.localeCompare(b.title));
  return {
    calls: callsHeard,
    enough,
    callsWords: enough ? `From ${calls(callsHeard)} reviewed or noted.` : `Not enough data: ${callsHeard} of ${MIN_CALLS} calls reviewed or noted. Counts and quotes show now; what worked is compared from ${MIN_CALLS}.`,
    rows,
    unmatched: [...unmatched.values()].sort((a, b) => b.heard - a.heard || b.lastHeard - a.lastHeard).slice(0, OBJECTION_LIMITS.unmatched),
  };
}
