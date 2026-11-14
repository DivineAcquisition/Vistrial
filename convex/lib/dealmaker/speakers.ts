/**
 * Who said a quote on a call, from the transcript's own speaker labels (doctrine 0.0: the buyer's words and a
 * rep's words are different evidence). A quote is the buyer's only when the line it sits on is labelled with
 * the lead's name; a line labelled with anyone else is our side's words; a quote on an unlabelled line, or in a
 * transcript where no label is the lead's, has no known speaker and is never counted as the buyer's.
 */

import { normal } from "../../skills/playbookStudy/tools";

/** "Jordan: text", "Jordan Lee (00:03:12): text", "[00:03] Jordan: text". */
const LINE = /^\s*(?:\[[\d:.]+\]\s*)?([A-Za-z][A-Za-z0-9 .'&-]{0,40}?)\s*(?:\([\d:.]+\))?\s*:\s+(.+)$/;

export type QuoteSpeaker = { kind: "buyer" | "rep" | "unknown"; speaker: string | null };

/** The label of the line a quote starts on, carrying a label down to the unlabelled lines that follow it. */
export function speakerOf(quote: string, transcript: string): string | null {
  const q = normal(quote);
  if (q.length < 3) return null;
  const lines = transcript.split(/\r?\n/).map((line) => {
    const match = line.match(LINE);
    return { label: match ? match[1].trim() : null, text: normal(match ? match[2] : line) };
  });
  let current: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].label) current = lines[i].label;
    if (!lines[i].text) continue;
    if (lines[i].text.includes(q)) return current;
    // A quote that runs over into the next line belongs to the line it starts on.
    const joined = `${lines[i].text} ${lines[i + 1]?.text ?? ""}`;
    const at = joined.indexOf(q);
    if (at >= 0 && at < lines[i].text.length) return current;
  }
  return null;
}

/** Whether a speaker label names the lead: the same first name, or one name containing the other. */
export function isLead(speaker: string, leadName: string) {
  const a = speaker.toLowerCase().trim();
  const b = leadName.toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.split(/\s+/)[0] === b.split(/\s+/)[0] || b.includes(a) || a.includes(b);
}

/** Who said a quote from a call, by the transcript's labels and the lead's name. */
export function quoteSpeaker(quote: string, transcript: string, leadName: string): QuoteSpeaker {
  const speaker = speakerOf(quote, transcript);
  if (!speaker) return { kind: "unknown", speaker: null };
  return { kind: isLead(speaker, leadName) ? "buyer" : "rep", speaker };
}

/** The words a screen shows for a quote from a call. */
export function speakerWords(who: QuoteSpeaker): string {
  if (who.kind === "buyer") return "Buyer's words";
  if (who.kind === "rep") return `Rep's words, ${who.speaker}`;
  return "Said on the call (speaker not named)";
}
