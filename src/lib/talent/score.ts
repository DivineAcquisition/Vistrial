import {
  ACADEMY_MODULES,
  MAX_WEIGHTED,
  QUESTION_BY_ID,
  QUESTION_IDS,
  QUESTIONS,
  ROLEPLAY_CHECKS,
  TRAIT_QUESTIONS,
  type QuestionId,
  type RoleplayKey,
  type Trait,
} from "@/lib/talent/questions";

export type RoleplayChecks = Record<RoleplayKey, boolean>;

export type Precheck = {
  availability: string;
  timezone: string;
  quietSpace: boolean;
  reliableInternet: boolean;
  headset: boolean;
  computer: boolean;
  crm: string;
  canStartSoon: boolean;
};

export type ScoreInput = {
  scores: Record<QuestionId, number>;
  quotes: Record<QuestionId, string>;
  roleplay: RoleplayChecks;
  precheck: Precheck;
  dishonesty: boolean;
};

export type Decision = "advance" | "second" | "decline" | "hold";
export type Band = "strong" | "possible" | "do_not_advance";

export type QuestionResult = {
  id: QuestionId;
  score: number;
  weight: number;
  points: number;
  quote: string;
};

export type Scorecard = {
  questions: Record<QuestionId, QuestionResult>;
  roleplayPassed: number;
  weighted: number;
  finalScore: number;
  band: Band;
  bandAfterDowngrade: Band;
  downgraded: boolean;
  decision: Decision;
  gates: { q7: boolean; q8: boolean };
  dishonesty: boolean;
  holdFlags: string[];
  traits: Record<Trait, number>;
  strengths: string[];
  concerns: string[];
  academy: string[];
  placement: string;
  reason: string;
};

export type ScoreResult = { ok: true; card: Scorecard } | { ok: false; error: string };

const BAND_LABEL: Record<Band, string> = {
  strong: "Strong",
  possible: "Possible",
  do_not_advance: "Do not advance",
};

export const DECISION_LABEL: Record<Decision, string> = {
  advance: "Advance to the Academy",
  second: "Second conversation",
  decline: "Do not advance",
  hold: "Hold for the hiring manager",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function precheckFlags(precheck: Precheck): string[] {
  const flags: string[] = [];
  if (!precheck.availability.trim()) flags.push("No reliable availability.");
  if (!precheck.quietSpace) flags.push("No quiet space.");
  if (!precheck.reliableInternet) flags.push("No reliable internet.");
  return flags;
}

function bandFor(finalScore: number): Band {
  if (finalScore >= 84) return "strong";
  if (finalScore >= 68) return "possible";
  return "do_not_advance";
}

function downgrade(band: Band): Band {
  if (band === "strong") return "possible";
  if (band === "possible") return "do_not_advance";
  return "do_not_advance";
}

function decisionFor(band: Band): Decision {
  if (band === "strong") return "advance";
  if (band === "possible") return "second";
  return "decline";
}

export function roleplayPassed(checks: RoleplayChecks): number {
  return ROLEPLAY_CHECKS.filter((check) => checks[check.key]).length;
}

export function scoreInterview(input: ScoreInput): ScoreResult {
  for (const id of QUESTION_IDS) {
    const score = input.scores[id];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return { ok: false, error: `Score ${QUESTION_BY_ID[id].title} from 1 to 5. No half points.` };
    }
  }
  const passed = roleplayPassed(input.roleplay);
  const q6 = input.scores.q6;
  if (q6 >= 4 && passed < 4) {
    return { ok: false, error: "A 4 or 5 on the roleplay needs at least 4 of the 5 checks." };
  }
  return { ok: true, card: buildCard(input.scores, input.quotes, passed, input.precheck, input.dishonesty, false) };
}

function buildCard(
  scores: Record<QuestionId, number>,
  quotes: Record<QuestionId, string>,
  passed: number,
  precheck: Precheck,
  dishonesty: boolean,
  fromAverage: boolean,
): Scorecard {
  const questions = {} as Record<QuestionId, QuestionResult>;
  let weighted = 0;
  for (const question of QUESTIONS) {
    const score = scores[question.id];
    const points = round1(score * question.weight);
    weighted += points;
    questions[question.id] = {
      id: question.id,
      score,
      weight: question.weight,
      points,
      quote: quotes[question.id].trim(),
    };
  }
  weighted = round1(weighted);
  const finalScore = Math.round((weighted / MAX_WEIGHTED) * 100);
  const band = bandFor(finalScore);
  const speedOrRoleplayWeak = scores.q3 <= 2 || scores.q6 <= 2;
  const bandAfterDowngrade = speedOrRoleplayWeak ? downgrade(band) : band;
  const gates = { q7: scores.q7 >= 3, q8: scores.q8 >= 3 };
  const noHire = !gates.q7 || !gates.q8 || dishonesty;
  const holdFlags = precheckFlags(precheck);
  for (const id of QUESTION_IDS) {
    if (id === "q7" || id === "q8") continue;
    if (scores[id] === 1) holdFlags.push(`${QUESTION_BY_ID[id].title} scored 1.`);
  }
  let decision: Decision;
  if (noHire) decision = "decline";
  else if (holdFlags.length > 0) decision = "hold";
  else decision = decisionFor(bandAfterDowngrade);

  const traits = {} as Record<Trait, number>;
  for (const trait of Object.keys(TRAIT_QUESTIONS) as Trait[]) {
    const [left, right] = TRAIT_QUESTIONS[trait];
    traits[trait] = round1((scores[left] + scores[right]) / 2);
  }

  const ranked = [...QUESTIONS].sort((a, b) => scores[b.id] - scores[a.id] || b.weight - a.weight || a.number - b.number);
  const strengths = ranked.slice(0, 3).map((question) => `${question.title} (${scores[question.id]})`);
  const concerns = [...ranked].reverse().slice(0, 3).map((question) => `${question.title} (${scores[question.id]})`);

  const weak = (Object.keys(traits) as Trait[]).filter((trait) => traits[trait] < 3).sort((a, b) => traits[a] - traits[b]);
  const academy: string[] = [];
  for (const trait of weak) {
    for (const moduleName of ACADEMY_MODULES[trait]) {
      if (!academy.includes(moduleName)) academy.push(moduleName);
      if (academy.length === 2) break;
    }
    if (academy.length === 2) break;
  }

  let placement = "Client placement, if they advance.";
  if (traits.integrity >= 4 && traits.ownership >= 3.5 && traits.execution >= 3.5) {
    placement = "Integrity is 4 or higher, with solid ownership and execution. Worth a look for an internal slot as well as client placement.";
  } else if (traits.sales >= 4 && traits.execution >= 4) {
    placement = "High sales craft and execution. Fits a client-facing pool.";
  }

  const reasonParts = [
    `Final score ${finalScore} of 100 (${weighted} of ${MAX_WEIGHTED}), which is ${BAND_LABEL[band]}${speedOrRoleplayWeak && !noHire ? `, then ${BAND_LABEL[bandAfterDowngrade]} after the speed or roleplay downgrade` : ""}.`,
  ];
  if (!gates.q7 || !gates.q8) reasonParts.push("Integrity or logging scored 2 or lower, so this is a no-hire.");
  else if (dishonesty) reasonParts.push("An answer was marked dishonest, so this is a no-hire.");
  else if (decision === "hold") reasonParts.push("A flag needs the hiring manager before anyone advances.");
  else reasonParts.push(`Recommendation: ${DECISION_LABEL[decision]}.`);
  if (fromAverage) reasonParts.push("Question scores are the average across interviewers.");

  return {
    questions,
    roleplayPassed: passed,
    weighted,
    finalScore,
    band,
    bandAfterDowngrade,
    downgraded: speedOrRoleplayWeak && bandAfterDowngrade !== band,
    decision,
    gates,
    dishonesty,
    holdFlags,
    traits,
    strengths,
    concerns,
    academy,
    placement,
    reason: reasonParts.join(" "),
  };
}

export type CombinedInterviews = {
  card: Scorecard;
  disagreements: QuestionId[];
  gateFromAnyInterviewer: boolean;
};

/** Average question scores. A gate failure from any interviewer still blocks a hire. */
export function combineInterviews(inputs: ScoreInput[]): CombinedInterviews | { error: string } {
  if (inputs.length === 0) return { error: "No interviews to combine." };
  const scored: Scorecard[] = [];
  for (const input of inputs) {
    const result = scoreInterview(input);
    if (!result.ok) return { error: result.error };
    scored.push(result.card);
  }
  if (scored.length === 1) {
    return {
      card: scored[0],
      disagreements: [],
      gateFromAnyInterviewer: !scored[0].gates.q7 || !scored[0].gates.q8 || scored[0].dishonesty,
    };
  }

  const scores = {} as Record<QuestionId, number>;
  const quotes = {} as Record<QuestionId, string>;
  const disagreements: QuestionId[] = [];
  for (const id of QUESTION_IDS) {
    const values = scored.map((card) => card.questions[id].score);
    scores[id] = round1(values.reduce((sum, value) => sum + value, 0) / values.length);
    quotes[id] = scored.map((card) => card.questions[id].quote).find((quote) => quote.length > 0) ?? "";
    if (Math.max(...values) - Math.min(...values) >= 2) disagreements.push(id);
  }
  const anyOne = scored.some((card) =>
    QUESTION_IDS.some((id) => id !== "q7" && id !== "q8" && card.questions[id].score === 1),
  );
  const q7min = Math.min(...scored.map((card) => card.questions.q7.score));
  const q8min = Math.min(...scored.map((card) => card.questions.q8.score));
  const lied = scored.some((card) => card.dishonesty);
  const gateFromAnyInterviewer = q7min <= 2 || q8min <= 2 || lied;
  const precheck: Precheck = {
    availability: inputs.every((item) => item.precheck.availability.trim()) ? inputs[0].precheck.availability : "",
    timezone: inputs[0].precheck.timezone,
    quietSpace: inputs.every((item) => item.precheck.quietSpace),
    reliableInternet: inputs.every((item) => item.precheck.reliableInternet),
    headset: inputs.every((item) => item.precheck.headset),
    computer: inputs.every((item) => item.precheck.computer),
    crm: inputs[0].precheck.crm,
    canStartSoon: inputs.every((item) => item.precheck.canStartSoon),
  };
  const card = buildCard(scores, quotes, Math.max(...scored.map((item) => item.roleplayPassed)), precheck, lied, true);
  card.gates = { q7: q7min >= 3, q8: q8min >= 3 };
  if (gateFromAnyInterviewer) {
    card.decision = "decline";
    card.reason = `Final score ${card.finalScore} of 100 is the average across interviewers. At least one interviewer failed a gate, so this is a no-hire.`;
  } else if (anyOne || card.holdFlags.length > 0) {
    card.decision = "hold";
  }
  if (disagreements.length > 0) {
    card.reason = `${card.reason} Interviewers differ by 2 or more on ${disagreements.map((id) => QUESTION_BY_ID[id].title).join(", ")}. They review the quote together before the score is final.`;
  }
  return { card, disagreements, gateFromAnyInterviewer };
}
