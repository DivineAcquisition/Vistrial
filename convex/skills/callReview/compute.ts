/**
 * What a call review knows before any model reads it, worked out in code: who spoke how much and asked how many
 * questions (from the transcript's own speaker labels), the sources it may quote, and the Playbook it may
 * draw on. Pure, so a test can read every case.
 */

import { REVIEW_LIMITS, type PlaybookRef, type ReviewRecord, type ReviewSource, type Speaker } from "./shapes";

/** "Jordan: text", "Jordan Lee (00:03:12): text", "[00:03] Jordan: text". A label is short and starts a line. */
const LINE = /^\s*(?:\[[\d:.]+\]\s*)?([A-Za-z][A-Za-z0-9 .'&-]{0,40}?)\s*(?:\([\d:.]+\))?\s*:\s+(.+)$/;

/** Each speaker's words, share of the words and questions, in order of how much they spoke. Null below two speakers. */
export function talkOf(transcript: string): Speaker[] | null {
  const words = new Map<string, number>();
  const questions = new Map<string, number>();
  let current: string | null = null;
  for (const line of transcript.split(/\r?\n/)) {
    const match = line.match(LINE);
    const name: string | null = match ? match[1].trim() : current;
    const said = match ? match[2] : line;
    if (!name) continue;
    current = name;
    const count = said.split(/\s+/).filter(Boolean).length;
    words.set(name, (words.get(name) ?? 0) + count);
    questions.set(name, (questions.get(name) ?? 0) + (said.match(/\?/g)?.length ?? 0));
  }
  const total = [...words.values()].reduce((sum, value) => sum + value, 0);
  if (words.size < 2 || total === 0) return null;
  return [...words.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, words: count, share: Math.round((count / total) * 100), questions: questions.get(name) ?? 0 }));
}

export type ReviewInput = {
  reviewId: string;
  projectId: string;
  leadName: string;
  callDate: string | null;
  crm: ReviewRecord["crm"];
  deal: ReviewRecord["deal"];
  stages: ReviewRecord["stages"];
  contactRef: string | null;
  transcript: { title: string; text: string } | null;
  notes: { by: string; outcome: string; nextStep: string | null; fit: { field: string; value: string }[]; objections: string[]; memo: string | null } | null;
  playbook: { id: string; folder: string; kind: string; stage: string | null; title: string; body: string; basis: string }[];
};

/** Script steps in the order a call runs: open, discover, pitch, close. */
const STAGE_ORDER = ["open", "discover", "pitch", "close"];

const PLAYBOOK_ORDER: Record<string, number> = { scriptStep: 0, question: 1, objection: 2, package: 3, price: 4, proof: 5, guarantee: 6 };

export function computeReview(input: ReviewInput): ReviewRecord {
  const sources: ReviewSource[] = [];
  const missing: string[] = [];
  if (input.transcript) {
    const cut = input.transcript.text.length > REVIEW_LIMITS.transcriptChars;
    sources.push({ id: "t1", type: "call", label: input.transcript.title, text: cut ? input.transcript.text.slice(0, REVIEW_LIMITS.transcriptChars) : input.transcript.text, cut });
    if (cut) missing.push("The call is long, so only its first part was read.");
  } else {
    missing.push(`${"Not enough data"}: no transcript of this call is linked, so nothing is the buyer's own words; the review rests on the closer's notes.`);
  }
  if (input.notes) {
    const lines = [
      `How it ended: ${input.notes.outcome}`,
      ...(input.notes.nextStep ? [`Next step: ${input.notes.nextStep}`] : []),
      ...input.notes.fit.map((row) => `${row.field}: ${row.value}`),
      ...(input.notes.objections.length ? [`Objections heard: ${input.notes.objections.join("; ")}`] : []),
      ...(input.notes.memo ? [`Voice memo: ${input.notes.memo}`] : []),
    ];
    sources.push({ id: "n1", type: "notes", label: `Call notes from ${input.notes.by}`, by: input.notes.by, text: lines.join("\n").slice(0, REVIEW_LIMITS.notesChars), cut: false });
  }
  if (!input.deal) missing.push("No CRM deal is linked to this call, so no CRM update is proposed.");
  const playbook: PlaybookRef[] = input.playbook
    .filter((row) => Object.hasOwn(PLAYBOOK_ORDER, row.kind))
    .sort((a, b) => PLAYBOOK_ORDER[a.kind] - PLAYBOOK_ORDER[b.kind] || STAGE_ORDER.indexOf(a.stage ?? "") - STAGE_ORDER.indexOf(b.stage ?? ""))
    .slice(0, REVIEW_LIMITS.playbookItems)
    .map((row, i) => ({ id: `p${i + 1}`, itemId: row.id, folder: row.folder, kind: row.kind, stage: row.stage, title: row.title, body: row.body.slice(0, 500), basis: row.basis }));
  if (!playbook.some((row) => row.kind === "scriptStep")) missing.push("The Playbook has no script steps, so script coverage is not shown.");
  const talk = input.transcript ? talkOf(input.transcript.text) : null;
  if (input.transcript && !talk) missing.push(`${"Not enough data"}: the transcript does not name its speakers, so talk time is not worked out.`);
  return {
    reviewId: input.reviewId,
    projectId: input.projectId,
    leadName: input.leadName,
    callDate: input.callDate,
    crm: input.crm,
    deal: input.deal,
    stages: input.stages,
    contactRef: input.contactRef,
    sources,
    playbook,
    talk,
    missing,
    refs: {},
  };
}
