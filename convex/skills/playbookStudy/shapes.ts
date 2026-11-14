/**
 * Playbook study: Dealmaker reads what a business gives it (call transcripts shared with Dealmaker, pasted
 * or uploaded text, Strategist's approved offer analysis) and files what it learns into the Playbook's four
 * folders (docs/rebuild/dealmaker.md, 0.6). Not one of the six skills: it is the fuel they run on.
 *
 * Every item it files quotes the source's own words, and code checks that quote is really there. An item is
 * labelled an inference (Dealmaker's reading of the source), never higher; a person's edit makes it theirs.
 */

import { FOLDERS, KINDS, OBJECTION_TAGS, STAGES } from "../../lib/playbook";

export const SKILL_SLUG = "playbook-study";
export const AGENT_SLUG = "sales-conversion";

export const PHASE = { site: "pbsSite", gather: "pbsGather", extract: "pbsExtract", check: "pbsCheck", save: "save" } as const;

/** What one study may read and file. */
export const STUDY_LIMITS = {
  sources: 8,
  /** Characters of one source given to the model. Longer sources are cut, and the item says so. */
  sourceChars: 24_000,
  /** Characters of pasted text a person may give in one source. */
  pastedChars: 60_000,
  label: 120,
  /** Website pages one study reads. */
  pages: 4,
  items: 30,
  quote: 400,
} as const;

/** The kinds of source a study reads, and the Playbook source each becomes. */
export const STUDY_SOURCE_TYPES = ["transcript", "text", "strategist", "website"] as const;
export type StudySourceType = (typeof STUDY_SOURCE_TYPES)[number];
export const PLAYBOOK_SOURCE = { transcript: "call", text: "upload", strategist: "strategist", website: "website" } as const satisfies Record<StudySourceType, string>;

/** One source as the model sees it: an id to cite, what it is, and its text. */
export type GatheredSource = { id: string; type: StudySourceType; ref: string; label: string; text: string; cut: boolean };
export type GatherRecord = { sources: GatheredSource[]; missing: string[]; existing: string[] };

const str = { type: "string" };

export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          folder: { type: "string", enum: [...FOLDERS] },
          kind: { type: "string", enum: [...new Set(Object.values(KINDS).flat())] },
          stage: { type: "string", enum: ["", ...STAGES] },
          tag: { type: "string", enum: ["", ...OBJECTION_TAGS] },
          title: str,
          body: str,
          sourceId: str,
          quote: str,
        },
        required: ["folder", "kind", "stage", "tag", "title", "body", "sourceId", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export type ExtractedItem = { folder: string; kind: string; stage: string; tag: string; title: string; body: string; sourceId: string; quote: string };

/** The model's answer, read defensively: anything not shaped right is dropped here, the rest is checked in code. */
export function readExtract(value: unknown): ExtractedItem[] {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const text = (row: Record<string, unknown>, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return items
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({ folder: text(row, "folder"), kind: text(row, "kind"), stage: text(row, "stage"), tag: text(row, "tag"), title: text(row, "title"), body: text(row, "body"), sourceId: text(row, "sourceId"), quote: text(row, "quote") }));
}

export type CheckedItem = ExtractedItem & { accepted: boolean; why: string };
export type StudyChecks = { accepted: number; dropped: number; items: CheckedItem[] };
