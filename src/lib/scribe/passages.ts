/**
 * A transcript as ordered passages that keep who said what. Offsets point
 * into the original transcript so a quote can be traced back exactly.
 */

export type Speaker = "prospect" | "team" | "unknown";

export type Passage = {
  seq: number;
  speaker: Speaker;
  speakerLabel: string | null;
  body: string;
  charStart: number;
  charEnd: number;
};

export type SpeakerHints = {
  /** The lead's first and last name, and anything else that names them. */
  prospectNames?: string[];
  /** Team member names and the business name. */
  teamNames?: string[];
};

const MAX_PASSAGE_CHARS = 1500;
const LABEL_RE = /^([^:\n]{1,40}):[ \t]*(.*)$/;
const TIMESTAMP_RE = /^\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*/;

const TEAM_WORDS = ["agent", "rep", "sales", "closer", "setter", "host", "advisor", "consultant", "coordinator", "team", "staff", "me"];
const PROSPECT_WORDS = ["prospect", "customer", "client", "lead", "caller", "patient", "guest", "homeowner", "buyer"];

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function looksLikeLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return false;
  if (/https?$/i.test(trimmed)) return false;
  return words(trimmed).length <= 5;
}

type Turn = { label: string | null; start: number; end: number };

function turnsOf(transcript: string): Turn[] {
  const turns: Turn[] = [];
  let offset = 0;
  for (const raw of transcript.split("\n")) {
    const lineStart = offset;
    offset += raw.length + 1;
    const stamp = raw.match(TIMESTAMP_RE);
    const line = stamp ? raw.slice(stamp[0].length) : raw;
    const lineOffset = lineStart + (stamp ? stamp[0].length : 0);
    if (!line.trim()) continue;
    const match = line.match(LABEL_RE);
    if (match && looksLikeLabel(match[1]) && match[2].trim()) {
      const label = match[1].trim();
      const bodyStart = lineOffset + line.indexOf(match[2]);
      const last = turns[turns.length - 1];
      if (last && last.label === label) {
        last.end = bodyStart + match[2].trimEnd().length;
      } else {
        turns.push({ label, start: bodyStart, end: bodyStart + match[2].trimEnd().length });
      }
      continue;
    }
    const contentStart = lineOffset + (line.length - line.trimStart().length);
    const contentEnd = lineOffset + line.trimEnd().length;
    const last = turns[turns.length - 1];
    if (last) last.end = contentEnd;
    else turns.push({ label: null, start: contentStart, end: contentEnd });
  }
  return turns;
}

/** Split long text at sentence ends, keeping offsets. */
function chunk(transcript: string, start: number, end: number): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let cursor = start;
  while (end - cursor > MAX_PASSAGE_CHARS) {
    const window = transcript.slice(cursor, cursor + MAX_PASSAGE_CHARS);
    let cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("\n"));
    if (cut < MAX_PASSAGE_CHARS / 3) cut = window.lastIndexOf(" ");
    if (cut < MAX_PASSAGE_CHARS / 3) cut = MAX_PASSAGE_CHARS - 1;
    out.push({ start: cursor, end: cursor + cut + 1 });
    cursor += cut + 1;
    while (cursor < end && /\s/.test(transcript[cursor])) cursor += 1;
  }
  if (end > cursor) out.push({ start: cursor, end });
  return out;
}

function matchesAny(label: string, names: string[]): boolean {
  const labelWords = words(label);
  return names.some((name) => {
    const nameWords = words(name);
    return nameWords.length > 0 && nameWords.some((w) => w.length > 1 && labelWords.includes(w));
  });
}

/** prospect, team, or unknown for each distinct label. Never guesses beyond the rules. */
export function resolveSpeakers(labels: string[], hints: SpeakerHints = {}): Map<string, Speaker> {
  const result = new Map<string, Speaker>();
  const distinct = [...new Set(labels)];
  for (const label of distinct) {
    const team = matchesAny(label, hints.teamNames ?? []) || words(label).some((w) => TEAM_WORDS.includes(w));
    const prospect = matchesAny(label, hints.prospectNames ?? []) || words(label).some((w) => PROSPECT_WORDS.includes(w));
    result.set(label, team && !prospect ? "team" : prospect && !team ? "prospect" : "unknown");
  }
  if (distinct.length === 2) {
    const [a, b] = distinct;
    const sa = result.get(a)!;
    const sb = result.get(b)!;
    if (sa !== "unknown" && sb === "unknown") result.set(b, sa === "team" ? "prospect" : "team");
    if (sb !== "unknown" && sa === "unknown") result.set(a, sb === "team" ? "prospect" : "team");
  }
  return result;
}

export function splitPassages(transcript: string, hints: SpeakerHints = {}): Passage[] {
  const turns = turnsOf(transcript);
  const speakers = resolveSpeakers(
    turns.map((t) => t.label).filter((l): l is string => l != null),
    hints
  );
  const passages: Passage[] = [];
  for (const turn of turns) {
    for (const piece of chunk(transcript, turn.start, turn.end)) {
      const body = transcript.slice(piece.start, piece.end).trim();
      if (!body) continue;
      passages.push({
        seq: passages.length + 1,
        speaker: turn.label ? speakers.get(turn.label) ?? "unknown" : "unknown",
        speakerLabel: turn.label,
        body,
        charStart: piece.start,
        charEnd: piece.end,
      });
    }
  }
  return passages;
}

/** The passages that contain a quote, by normalized match. */
export function passagesForQuote(passages: Passage[], quote: string): Passage[] {
  const needle = normalize(quote);
  if (needle.length < 4) return [];
  const direct = passages.filter((p) => normalize(p.body).includes(needle));
  if (direct.length) return direct;
  for (let i = 0; i < passages.length - 1; i += 1) {
    if (normalize(`${passages[i].body} ${passages[i + 1].body}`).includes(needle)) return [passages[i], passages[i + 1]];
  }
  return [];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

/** Passages for a prompt, labelled, within a character budget (head and tail when long). */
export function passagesForPrompt(passages: Passage[], headChars: number, tailChars: number): { text: string; truncated: boolean } {
  const line = (p: Passage) => `[P${p.seq} ${p.speaker}${p.speakerLabel ? ` "${p.speakerLabel}"` : ""}] ${p.body}`;
  const total = passages.reduce((sum, p) => sum + p.body.length, 0);
  if (total <= headChars + tailChars) return { text: passages.map(line).join("\n"), truncated: false };
  const head: Passage[] = [];
  let used = 0;
  for (const p of passages) {
    if (used + p.body.length > headChars) break;
    head.push(p);
    used += p.body.length;
  }
  const tail: Passage[] = [];
  used = 0;
  for (let i = passages.length - 1; i >= head.length; i -= 1) {
    if (used + passages[i].body.length > tailChars) break;
    tail.unshift(passages[i]);
    used += passages[i].body.length;
  }
  return { text: [...head.map(line), "[...middle omitted...]", ...tail.map(line)].join("\n"), truncated: true };
}
