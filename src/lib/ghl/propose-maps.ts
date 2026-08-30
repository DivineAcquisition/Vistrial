import type { ScoreFactor } from "@/lib/scoring/compute";

/**
 * A field as it exists in the connected CRM, with whatever real answers we
 * found on recent contacts. The samples are the whole point: a mapping the
 * user cannot see an example of is a mapping they cannot check.
 */
export type LiveField = {
  id: string;
  name: string;
  key?: string;
  samples: string[];
};

export type ProposedMap = {
  fieldId: string;
  fieldKey: string | null;
  /** The CRM's own name for the field. Never our name for it. */
  fieldName: string;
  factor: ScoreFactor;
  /** A real answer someone gave, or null when no contact has answered yet. */
  example: string | null;
  /** How sure we are, which decides whether it is pre-checked. */
  confident: boolean;
};

/**
 * Words that mean each factor, in the language a form actually uses. Ordered
 * so the most specific phrase wins: "how soon" is a timeline question, but
 * "how much" is a budget one, and both contain "how".
 */
const FACTOR_HINTS: Array<{ factor: ScoreFactor; phrases: string[] }> = [
  {
    factor: "timeline",
    phrases: [
      "timeline",
      "time frame",
      "timeframe",
      "how soon",
      "when do you",
      "when are you",
      "start date",
      "urgency",
      "ready to start",
    ],
  },
  {
    factor: "investment_capacity",
    phrases: [
      "budget",
      "invest",
      "investment",
      "spend",
      "afford",
      "price range",
      "revenue",
      "how much",
      "capital",
      "financ",
    ],
  },
  {
    factor: "decision_authority",
    phrases: [
      "decision",
      "decide",
      "decision maker",
      "who else",
      "partner",
      "spouse",
      "authority",
      "sign off",
      "approve",
      "owner",
    ],
  },
  {
    factor: "pain_severity",
    phrases: [
      "pain",
      "problem",
      "struggle",
      "challenge",
      "biggest issue",
      "frustrat",
      "why now",
      "goal",
      "what is stopping",
      "bottleneck",
    ],
  },
];

/** Money-looking answers point at budget even when the question does not. */
const MONEY = /(^|\s)(\$|usd|eur|gbp)\s?\d|(\d[\d,.]*\s?(k|m)\b)|\b\d{3,}\b/i;

/** Answers that read like a period of time point at timeline. */
const DURATION =
  /\b(day|days|week|weeks|month|months|quarter|asap|immediately|right away|next \d+)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function factorFromName(name: string, key: string | null): ScoreFactor | null {
  const haystack = `${normalize(name)} ${normalize(key ?? "")}`;
  for (const hint of FACTOR_HINTS) {
    for (const phrase of hint.phrases) {
      if (haystack.includes(phrase)) return hint.factor;
    }
  }
  return null;
}

function factorFromSamples(samples: string[]): ScoreFactor | null {
  if (samples.length === 0) return null;
  const money = samples.filter((value) => MONEY.test(value)).length;
  const duration = samples.filter((value) => DURATION.test(value)).length;
  const half = Math.ceil(samples.length / 2);
  if (money >= half && money > duration) return "investment_capacity";
  if (duration >= half && duration > money) return "timeline";
  return null;
}

/**
 * Propose one mapping per field we can place. A field whose name we recognise
 * is pre-checked; one placed only by the shape of its answers is proposed but
 * left for the user to confirm, because guessing from values is weaker
 * evidence than the question itself.
 */
export function proposeFieldMaps(fields: LiveField[]): ProposedMap[] {
  const out: ProposedMap[] = [];
  const claimed = new Set<ScoreFactor>();

  const byName: ProposedMap[] = [];
  const bySample: ProposedMap[] = [];

  for (const field of fields) {
    const key = field.key ?? null;
    const example = field.samples.find((value) => value.trim().length > 0) ?? null;
    const named = factorFromName(field.name, key);
    if (named) {
      byName.push({
        fieldId: field.id,
        fieldKey: key,
        fieldName: field.name,
        factor: named,
        example,
        confident: true,
      });
      continue;
    }
    const sampled = factorFromSamples(field.samples);
    if (sampled) {
      bySample.push({
        fieldId: field.id,
        fieldKey: key,
        fieldName: field.name,
        factor: sampled,
        example,
        confident: false,
      });
    }
  }

  // One field per factor. A name match beats a value match every time.
  for (const proposal of [...byName, ...bySample]) {
    if (claimed.has(proposal.factor)) continue;
    claimed.add(proposal.factor);
    out.push(proposal);
  }
  return out;
}

/**
 * The mapping as a sentence, which is the only form most people will read.
 * Deliberately says what it is used for rather than naming the factor.
 */
export function mappingSentence(map: ProposedMap): string {
  const use: Record<ScoreFactor, string> = {
    timeline: "judge how soon they are ready",
    investment_capacity: "judge what they can spend",
    decision_authority: "judge whether they can decide",
    pain_severity: "judge how badly they need this",
  };
  const base = `We'll use “${map.fieldName}” to ${use[map.factor]}.`;
  return map.example ? `${base} Example answer: “${map.example}”.` : base;
}

/** Which factors nothing was proposed for, so the screen can say so plainly. */
export function unmappedFactors(maps: ProposedMap[]): ScoreFactor[] {
  const claimed = new Set(maps.map((map) => map.factor));
  return (["timeline", "investment_capacity", "decision_authority", "pain_severity"] as const).filter(
    (factor) => !claimed.has(factor)
  );
}
