import type { Enums } from "@/types/database";

export type SpeakerRole = "rep" | "prospect" | "unknown";

export type TranscriptTurn = {
  speaker: SpeakerRole;
  label: string;
  text: string;
};

export type QuestionKind = "open" | "closed" | "unknown";

export type ObjectionHandlingState = "addressed" | "deflected" | "ignored";

export type CommitmentClarity = "specific" | "vague" | "none";

export type CallObjectionInput = {
  id: string;
  type: Enums<"objection_type"> | string;
  verbatim: string;
};

export type ExtractionInput = {
  timelineState: string | null;
  budgetState: string | null;
  decisionState: string | null;
  nextStepState: string | null;
  nextStepAgreed: string | null;
};

export type AnalyzeCallInput = {
  transcript: string;
  durationSeconds: number | null;
  typicalDurationSeconds: number | null;
  extraction: ExtractionInput | null;
  objections: CallObjectionInput[];
  priorOpenObjections: CallObjectionInput[];
  briefOpenedBeforeCall: boolean;
  painScoredOnThisCall: boolean;
};

export type AnalyzedObjection = {
  objectionId: string | null;
  objectionType: string;
  verbatim: string;
  handling: ObjectionHandlingState;
  evidenceSpan: string;
};

export type AnalyzedCall = {
  speakersAttributed: boolean;
  wordCountRep: number;
  wordCountProspect: number;
  wordCountUnknown: number;
  talkRatioRep: number | null;
  talkRatioProspect: number | null;
  questionCount: number;
  openQuestionCount: number;
  closedQuestionCount: number;
  longestRepMonologueWords: number | null;
  durationSeconds: number | null;
  typicalDurationSeconds: number | null;
  durationVsTypicalSeconds: number | null;
  nextStepStated: boolean;
  nextStepAgreed: boolean;
  commitmentClarity: CommitmentClarity;
  discoveryPain: boolean;
  discoveryTimeline: boolean;
  discoveryBudget: boolean;
  discoveryAuthority: boolean;
  openObjectionsPriorN: number;
  openObjectionsAddressedN: number;
  briefOpenedBeforeCall: boolean;
  objections: AnalyzedObjection[];
};

const REP_LABELS = new Set([
  "agent",
  "rep",
  "representative",
  "setter",
  "closer",
  "ae",
  "sdr",
  "bdr",
  "sales",
  "advisor",
  "coach",
  "specialist",
  "host",
  "account executive",
  "account manager",
]);

const PROSPECT_LABELS = new Set([
  "customer",
  "prospect",
  "client",
  "lead",
  "guest",
  "caller",
  "participant",
  "buyer",
  "contact",
]);

const OPEN_QUESTION =
  /^(what|why|how|where|who|which|when|tell me|walk me|describe|explain|talk to me|share|help me understand)\b/;
const CLOSED_QUESTION =
  /^(do|does|did|is|are|was|were|can|could|will|would|have|has|had|should|may|might|shall)\b/;

const SPECIFIC_TIME =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next week|this week|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}(:\d{2})?\s*(am|pm))\b/i;

const PAIN_RE =
  /\b(pain|struggle|struggling|problem|problems|frustrated|frustrating|hardest|hurting|what's not working|how is that affecting)\b/i;
const TIMELINE_RE =
  /\b(when do you|when would you|timeline|timeframe|deadline|how soon|start date|by when|solved by)\b/i;
const BUDGET_RE =
  /\b(budget|invest|investment|afford|price range|what range|planned to (spend|invest)|how much (were|are|had) you)\b/i;
const AUTHORITY_RE =
  /\b(who else|who('s| is) involved|who decides|decision authority|sign off|final say|who has to approve)\b/i;

const DEFLECT_RE =
  /\b(anyway|moving on|we'll send|i'll send|send you (the )?(info|brochure|deck|pdf)|think (it )?over|not a big deal|we can talk later|let's park|besides that|circle back later)\b/i;
const ADDRESS_RE =
  /\b(what i hear|so you('re| are) saying|the concern is|help me understand|tell me more about that|what would need|the reason that|fair[,.]|what's behind that)\b/i;

const TIMESTAMP_LABEL = /^(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d+)?$/;
const SPEAKER_LINE = /^([A-Za-z][A-Za-z0-9 .'\-]{0,79}):\s*(.*)$/;

export function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

export function classifySpeakerLabel(label: string): SpeakerRole {
  const key = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "unknown";
  if (REP_LABELS.has(key)) return "rep";
  if (PROSPECT_LABELS.has(key)) return "prospect";
  return "unknown";
}

export function parseTurns(transcript: string): TranscriptTurn[] {
  const lines = transcript.replace(/\r\n/g, "\n").split("\n");
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(SPEAKER_LINE);
    const label = match?.[1]?.trim() ?? "";
    if (match && label && !TIMESTAMP_LABEL.test(label) && !/https?/i.test(label)) {
      const role = classifySpeakerLabel(label);
      current = { speaker: role, label, text: match[2] ?? "" };
      turns.push(current);
      continue;
    }
    if (current) {
      current.text = `${current.text} ${line}`.trim();
    } else {
      current = { speaker: "unknown", label: "", text: line };
      turns.push(current);
    }
  }

  return turns;
}

export function classifyQuestion(sentence: string): QuestionKind {
  const withoutLabels = sentence.replace(/^[A-Za-z][A-Za-z0-9 .'\-]{0,79}:\s*/gm, "");
  const clauses = withoutLabels
    .trim()
    .toLowerCase()
    .replace(/[?]+/g, "?")
    .split(/[,;]\s+/);
  const last = (clauses[clauses.length - 1] ?? withoutLabels)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[?]+$/, "")
    .trim();
  if (!last) return "unknown";
  if (OPEN_QUESTION.test(last)) return "open";
  if (CLOSED_QUESTION.test(last)) return "closed";
  return "unknown";
}

export function questionsFromText(text: string): Array<{ text: string; kind: QuestionKind }> {
  const stripped = text.replace(/^[A-Za-z][A-Za-z0-9 .'\-]{0,79}:\s*/gm, " ");
  const sentences = stripped
    .split(/(?<=[?])(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.includes("?"));
  return sentences.map((part) => ({ text: part, kind: classifyQuestion(part) }));
}

function attributed(turns: TranscriptTurn[]): boolean {
  let rep = 0;
  let prospect = 0;
  for (const turn of turns) {
    const n = wordCount(turn.text);
    if (turn.speaker === "rep") rep += n;
    if (turn.speaker === "prospect") prospect += n;
  }
  return rep > 0 && prospect > 0;
}

function longestRepMonologue(turns: TranscriptTurn[]): number | null {
  if (!attributed(turns)) return null;
  let best = 0;
  let run = 0;
  for (const turn of turns) {
    if (turn.speaker === "rep") {
      run += wordCount(turn.text);
      if (run > best) best = run;
    } else if (turn.speaker === "prospect") {
      run = 0;
    }
  }
  return best;
}

function commitmentFromNextStep(
  extraction: ExtractionInput | null,
  transcript: string
): { stated: boolean; agreed: boolean; clarity: CommitmentClarity } {
  const state = extraction?.nextStepState ?? "absent";
  const agreedText = extraction?.nextStepAgreed?.trim() || "";
  const stated = state === "present" || agreedText.length > 0 || /\bnext step\b/i.test(transcript);
  const agreed = state === "present" || agreedText.length > 0;
  if (!stated && !agreed) {
    return { stated: false, agreed: false, clarity: "none" };
  }
  const haystack = `${agreedText} ${transcript}`;
  if (SPECIFIC_TIME.test(haystack)) {
    return { stated: true, agreed, clarity: "specific" };
  }
  if (agreed || stated) {
    return { stated: true, agreed, clarity: "vague" };
  }
  return { stated: false, agreed: false, clarity: "none" };
}

function exploredByRep(
  turns: TranscriptTurn[],
  extractionState: string | null | undefined,
  pattern: RegExp,
  extra = false
): boolean {
  if (extractionState === "present") return true;
  if (extra) return true;
  const labeled = turns.some((turn) => turn.speaker === "rep");
  if (labeled) {
    return turns.some((turn) => turn.speaker === "rep" && pattern.test(turn.text));
  }
  return turns.some((turn) => pattern.test(turn.text));
}

function normalizeHay(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function objectionTokens(objection: CallObjectionInput): string[] {
  const fromVerbatim = normalizeHay(objection.verbatim)
    .split(" ")
    .filter((token) => token.length > 3);
  const typeTokens: Record<string, string[]> = {
    price: ["price", "expensive", "cost", "budget", "spend"],
    timing: ["timing", "later", "not now", "busy"],
    spouse_partner: ["wife", "husband", "spouse", "partner"],
    trust: ["trust", "skeptic", "scam"],
    fit: ["fit", "not for me", "not sure this"],
    competitor: ["already have", "other company", "competitor"],
    other: [],
  };
  return [...new Set([...fromVerbatim.slice(0, 8), ...(typeTokens[objection.type] ?? [])])];
}

function findObjectionTurnIndex(turns: TranscriptTurn[], objection: CallObjectionInput): number {
  const verbatim = normalizeHay(objection.verbatim);
  if (verbatim.length >= 8) {
    const joined = turns.map((turn) => normalizeHay(turn.text));
    for (let i = 0; i < joined.length; i += 1) {
      if (joined[i].includes(verbatim) || verbatim.includes(joined[i])) return i;
    }
  }
  const tokens = objectionTokens(objection).filter((token) => token.length > 3);
  if (tokens.length === 0) return -1;
  for (let i = 0; i < turns.length; i += 1) {
    const hay = normalizeHay(turns[i].text);
    if (tokens.some((token) => hay.includes(token))) return i;
  }
  return -1;
}

function followingRepText(turns: TranscriptTurn[], fromIndex: number): string {
  const start = Math.max(0, fromIndex);
  const slice = turns.slice(start, start + 10);
  return slice
    .filter((turn) => turn.speaker === "rep" || turn.speaker === "unknown")
    .map((turn) => turn.text)
    .join(" ");
}

export function classifyObjectionHandling(
  turns: TranscriptTurn[],
  objection: CallObjectionInput
): AnalyzedObjection {
  const idx = findObjectionTurnIndex(turns, objection);
  const following = idx >= 0 ? followingRepText(turns, idx + 1) : followingRepText(turns, 0);
  const hay = normalizeHay(following);
  const tokens = objectionTokens(objection);
  const related = tokens.some((token) => hay.includes(token));
  const addressedCue = ADDRESS_RE.test(following);
  const deflectedCue = DEFLECT_RE.test(following);
  const hasQuestion = following.includes("?");

  let handling: ObjectionHandlingState = "ignored";
  if (idx < 0 && !related && !addressedCue) {
    handling = "ignored";
  } else if (deflectedCue && !addressedCue && !hasQuestion) {
    handling = "deflected";
  } else if (addressedCue || (related && hasQuestion) || (related && addressedCue)) {
    handling = "addressed";
  } else if (related && !deflectedCue) {
    handling = "addressed";
  } else if (deflectedCue) {
    handling = "deflected";
  }

  const evidence = (idx >= 0 ? following : following).trim().slice(0, 240);
  return {
    objectionId: objection.id,
    objectionType: objection.type,
    verbatim: objection.verbatim,
    handling,
    evidenceSpan: evidence,
  };
}

export function analyzeCall(input: AnalyzeCallInput): AnalyzedCall {
  const turns = parseTurns(input.transcript);
  const speakersAttributed = attributed(turns);
  let wordCountRep = 0;
  let wordCountProspect = 0;
  let wordCountUnknown = 0;
  for (const turn of turns) {
    const n = wordCount(turn.text);
    if (turn.speaker === "rep") wordCountRep += n;
    else if (turn.speaker === "prospect") wordCountProspect += n;
    else wordCountUnknown += n;
  }
  const attributedWords = wordCountRep + wordCountProspect;
  const talkRatioRep =
    speakersAttributed && attributedWords > 0
      ? Math.round((wordCountRep / attributedWords) * 1000) / 1000
      : null;
  const talkRatioProspect =
    speakersAttributed && attributedWords > 0
      ? Math.round((wordCountProspect / attributedWords) * 1000) / 1000
      : null;

  const questionList = questionsFromText(input.transcript);
  const openQuestionCount = questionList.filter((item) => item.kind === "open").length;
  const closedQuestionCount = questionList.filter((item) => item.kind === "closed").length;

  const next = commitmentFromNextStep(input.extraction, input.transcript);
  const objections = input.objections.map((objection) => classifyObjectionHandling(turns, objection));

  const prior = input.priorOpenObjections;
  let openObjectionsAddressedN = 0;
  for (const priorObjection of prior) {
    const handling = classifyObjectionHandling(turns, priorObjection).handling;
    if (handling === "addressed") openObjectionsAddressedN += 1;
  }

  const typical =
    input.typicalDurationSeconds && input.typicalDurationSeconds > 0
      ? input.typicalDurationSeconds
      : null;
  const duration = input.durationSeconds;

  return {
    speakersAttributed,
    wordCountRep,
    wordCountProspect,
    wordCountUnknown,
    talkRatioRep,
    talkRatioProspect,
    questionCount: questionList.length,
    openQuestionCount,
    closedQuestionCount,
    longestRepMonologueWords: longestRepMonologue(turns),
    durationSeconds: duration,
    typicalDurationSeconds: typical,
    durationVsTypicalSeconds:
      duration != null && typical != null ? duration - typical : null,
    nextStepStated: next.stated,
    nextStepAgreed: next.agreed,
    commitmentClarity: next.clarity,
    discoveryPain: exploredByRep(turns, null, PAIN_RE, input.painScoredOnThisCall),
    discoveryTimeline: exploredByRep(turns, input.extraction?.timelineState, TIMELINE_RE),
    discoveryBudget: exploredByRep(turns, input.extraction?.budgetState, BUDGET_RE),
    discoveryAuthority: exploredByRep(turns, input.extraction?.decisionState, AUTHORITY_RE),
    openObjectionsPriorN: prior.length,
    openObjectionsAddressedN,
    briefOpenedBeforeCall: input.briefOpenedBeforeCall,
    objections,
  };
}

const FORBIDDEN_RESULT_KEYS = [
  "personality",
  "enthusiasm",
  "confidence",
  "grade",
  "score",
  "rating",
  "rank",
];

export function analyzedCallHasForbiddenKeys(result: AnalyzedCall): boolean {
  const blob = JSON.stringify(result).toLowerCase();
  return FORBIDDEN_RESULT_KEYS.some((key) =>
    new RegExp(`"${key}"\\s*:`).test(blob)
  );
}
