/**
 * The live checklist for one booked call (build step 12c; docs/rebuild/dealmaker.md, 0.8 "Conversation
 * Intelligence"): the business's own script steps, in call order, and this lead's points from their brief,
 * marked apart; with the objections heard most often for reference. Code only: it does not listen to the call,
 * and nothing is prompted in real time. The closer ticks items as they go. Pure.
 */

import type { BriefView } from "./briefView";
import { STAGES, STAGE_LABEL, type Stage } from "../playbook";

export type ScriptStep = { id: string; stage: Stage | null; title: string };
export type HeardObjection = { title: string; heard: number; track: string | null };

export type ChecklistItem = { id: string; text: string; note: string | null };
export type Checklist = {
  script: { stage: string; items: ChecklistItem[] }[];
  lead: ChecklistItem[];
  objections: { title: string; heardWords: string; track: string | null }[];
  /** Why the lead's part is empty, when it is. */
  leadMissing: string | null;
  scriptMissing: string | null;
};

export const CHECKLIST_LIMITS = { lead: 10, objections: 3, text: 240 } as const;

export const CHECKLIST_TEXT = {
  noBrief: "No brief for this call yet. Ask for one in Calls, and its points appear here.",
  briefNotReady: "The brief for this call is still being written.",
  noScript: "No script steps in the Playbook yet. Add them in the Playbook interview, and they appear here in call order.",
} as const;

const clip = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, CHECKLIST_LIMITS.text);

/** A stable id per item, so a tick survives the list being drawn again. */
function idOf(prefix: string, text: string) {
  let hash = 0;
  for (const char of text.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `${prefix}:${(hash >>> 0).toString(36)}`;
}

export function buildChecklist(input: { steps: ScriptStep[]; brief: BriefView | null; briefState: "none" | "running" | "ready"; objections: HeardObjection[] }): Checklist {
  // The script, by stage in call order; steps with no stage go last.
  const order = [...STAGES, null] as (Stage | null)[];
  const script = order
    .map((stage) => ({
      stage: stage ? STAGE_LABEL[stage] : "Other steps",
      items: input.steps.filter((row) => row.stage === stage).map((row) => ({ id: `script:${row.id}`, text: clip(row.title), note: null })),
    }))
    .filter((group) => group.items.length);

  // This lead's points, from the brief: the opening question, what to cover, what is still open, likely objections.
  const lead: ChecklistItem[] = [];
  const add = (prefix: string, text: string, note: string | null) => {
    const value = clip(text);
    if (value && lead.length < CHECKLIST_LIMITS.lead && !lead.some((row) => row.text === value)) lead.push({ id: idOf(prefix, value), text: value, note });
  };
  const brief = input.briefState === "ready" ? input.brief : null;
  if (brief) {
    if (brief.openingQuestion) add("open", brief.openingQuestion, "Opening question");
    for (const row of brief.cover) add("cover", row.point, row.label);
    for (const row of brief.readiness.filter((item) => !item.established)) add("ask", `Find out: ${row.label.toLowerCase()}`, "Not established yet");
    for (const row of brief.objections) add("objection", `Be ready for: ${row.text}`, row.where ? `Heard ${row.where}` : row.label);
    for (const row of brief.commitments) add("promise", `Follow through: ${row.what}`, `Promised by ${row.owner}`);
  }

  const objections = input.objections
    .filter((row) => row.heard > 0)
    .sort((a, b) => b.heard - a.heard)
    .slice(0, CHECKLIST_LIMITS.objections)
    .map((row) => ({ title: clip(row.title), heardWords: `Heard on ${row.heard} call${row.heard === 1 ? "" : "s"}`, track: row.track ? clip(row.track) : null }));

  return {
    script,
    lead,
    objections,
    leadMissing: lead.length ? null : input.briefState === "running" ? CHECKLIST_TEXT.briefNotReady : CHECKLIST_TEXT.noBrief,
    scriptMissing: script.length ? null : CHECKLIST_TEXT.noScript,
  };
}

/** The ids that can be ticked: anything else sent is ignored. */
export function itemIds(list: Checklist) {
  return new Set([...list.script.flatMap((group) => group.items.map((row) => row.id)), ...list.lead.map((row) => row.id)]);
}
