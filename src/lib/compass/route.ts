/**
 * The first look at a question, before any model runs: is it something
 * Compass should answer, is it too broad to answer well, is it a product
 * question, and does it need reasoning or just a lookup. Cheap and local, so
 * the first visible step appears at once; a Haiku check refines the model
 * choice only when this cannot tell.
 */

export type QuestionKind = "out_of_scope" | "broad" | "help" | "lookup" | "reasoning" | "unclear";

export type RouteDecision = {
  kind: QuestionKind;
  route: "fast" | "reasoning" | "refused";
  /** Plain words for a refusal or a narrowing prompt. */
  reply?: string;
};

const OUT_OF_SCOPE: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /\b(legal advice|lawsuit|sue (them|him|her)|is it legal|attorney|lawyer|contract law|tax advice|file (my )?taxes)\b/i,
    reply: "I can't give legal or tax advice. I can show what Vistrial recorded about your leads, response times, and results.",
  },
  {
    pattern: /\b(medical advice|diagnos|dosage|prescri|side effects?|is it safe to (take|inject)|symptom)\w*/i,
    reply: "I can't give medical advice. I can show what Vistrial recorded about your leads and how your team is following up.",
  },
  {
    pattern: /\b(weather|stock price|sports? score|recipe|write (me )?(a )?(poem|song|story|essay)|translate this|homework|crypto)\b/i,
    reply: "That's outside what I can help with. I answer questions about this workspace: leads, response times, results, objections, and what the agents did.",
  },
  {
    pattern: /\b(competitor|other compan(y|ies)|what does .{2,40} (charge|offer)|compare (us|you) (to|with))\b/i,
    reply: "I can't speak about other companies. I can show how your own leads and results look.",
  },
  {
    pattern: /\b(ignore (all|your|previous) (rules|instructions)|system prompt|reveal your (prompt|instructions)|jailbreak|pretend you are|act as (an? )?(admin|developer))\b/i,
    reply: "I can't do that. I answer questions about this workspace with the same access you have.",
  },
];

const BROAD = /^\s*(tell me everything|everything|all of it|show me everything|give me all|summari[sz]e (everything|all)|what('s| is) going on\??)\s*[.!?]*\s*$/i;

const HELP = /\b(how (do|can) i|how to|where (do|can) i (find|see|change)|what (does|do) .{2,60} mean|what is (a |an |the )?(response window|response clock|readiness|band|case file|approval|draft|relay|sentry|scribe|compass|operator|member)|explain .{0,30}(metric|number|setting))\b/i;

const REASONING = /\b(why|forecast|predict|will we|next (week|month|quarter|year)|what should|should i|should we|compared?|versus|vs\.?|pattern|trend|improve|better|worse|prioriti[sz]e|recommend|what('s| is) stopping|what is blocking|explain why|what changed|biggest|most likely)\b/i;

const LOOKUP = /\b(how many|how much|what share|what percent(age)?|which|list|show|find|who|count|number of|what (exactly )?did .{1,60} say|what('s| is) (the|our|my)|top|most common|waiting|at risk|missed|hot|warm|cold|today|this week|last week|this month|yesterday)\b/i;

export function classifyQuestion(text: string): RouteDecision {
  const question = text.trim();
  for (const rule of OUT_OF_SCOPE) {
    if (rule.pattern.test(question)) return { kind: "out_of_scope", route: "refused", reply: rule.reply };
  }
  if (BROAD.test(question)) {
    return {
      kind: "broad",
      route: "refused",
      reply:
        "That's a lot to cover at once. Pick one to start: response times this week, hot leads that need a reply, the most common objections, or what's waiting for approval.",
    };
  }
  if (HELP.test(question) && !REASONING.test(question)) return { kind: "help", route: "fast" };
  if (REASONING.test(question) || question.length > 220) return { kind: "reasoning", route: "reasoning" };
  if (LOOKUP.test(question)) return { kind: "lookup", route: "fast" };
  return { kind: "unclear", route: "reasoning" };
}

/** Haiku's one-word answer, mapped to a route. Anything unexpected keeps the safer reasoning route. */
export function routeFromLabel(label: string): "fast" | "reasoning" {
  return /^\s*(lookup|simple|metric|help)\b/i.test(label) ? "fast" : "reasoning";
}
