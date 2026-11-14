/**
 * The Playbook: what Dealmaker knows about how one business sells (docs/rebuild/dealmaker.md, 0.6 and 0.7).
 * Four folders, with the four stages of a sales call inside Prospect and Closing. Every item keeps where it
 * came from and an evidence label set here, in code, from its source, never by a model. One Playbook per
 * organization and one per client: a row with no `clientId` is the organization's own.
 *
 * The "What I've learned about how you sell" list holds lessons. A lesson is proposed (by Dealmaker, from a
 * person's edit or rejection, or by a person) and guides drafts only once a person approves it (doctrine VI).
 *
 * What it still needs is a count against a minimum, per skill. Never a score.
 */

import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Basis } from "./researchShapes";

export const FOLDERS = ["offer", "prospect", "objections", "closing"] as const;
export type Folder = (typeof FOLDERS)[number];

export const FOLDER_LABEL: Record<Folder, { name: string; holds: string }> = {
  offer: { name: "Offer", holds: "Packages, the prices proposals may use, guarantees and proof." },
  prospect: { name: "Prospect", holds: "Who buys, the discovery questions and the qualification fields. The Open and Discover stages of a call." },
  objections: { name: "Objections", holds: "Every objection you hear, the lead's own words, what worked and a talk track." },
  closing: { name: "Closing", holds: "The pitch, the close, proposal templates, past winning proposals and follow-up wording. The Pitch and Close stages of a call." },
};

/** The four stages of a sales call. Open and Discover live in Prospect, Pitch and Close in Closing. */
export const STAGES = ["open", "discover", "pitch", "close"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { open: "Open", discover: "Discover", pitch: "Pitch", close: "Close" };
export const STAGE_FOLDER: Record<Stage, Folder> = { open: "prospect", discover: "prospect", pitch: "closing", close: "closing" };

/** What can be filed in each folder. */
export const KINDS = {
  offer: ["package", "price", "guarantee", "proof"],
  prospect: ["buyer", "question", "qualification", "scriptStep"],
  objections: ["objection"],
  closing: ["scriptStep", "proposalTemplate", "winningProposal", "followUpWording", "voice"],
} as const satisfies Record<Folder, readonly string[]>;
export type Kind = (typeof KINDS)[Folder][number];

export const KIND_LABEL: Record<Kind, string> = {
  package: "Package",
  price: "Price",
  guarantee: "Guarantee",
  proof: "Proof",
  buyer: "Who buys",
  question: "Discovery question",
  qualification: "Qualification field",
  scriptStep: "Script step",
  objection: "Objection",
  proposalTemplate: "Proposal template",
  winningProposal: "Past winning proposal",
  followUpWording: "Follow-up wording",
  voice: "Voice and sign-off",
};

/** The five fit fields a deal's readiness is read against (0.8). */
export const QUALIFICATION_FIELDS = ["need", "budget", "decider", "timing", "fit"] as const;

/** An objection's tag (0.7). */
export const OBJECTION_TAGS = ["money", "time", "trust", "fit"] as const;
export type ObjectionTag = (typeof OBJECTION_TAGS)[number];

/** Where an item came from. */
export const SOURCE_TYPES = ["person", "interview", "upload", "call", "video", "website", "crm", "strategist", "learned", "starter"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABEL: Record<SourceType, string> = {
  person: "Added by a person",
  interview: "From the interview",
  upload: "From an upload",
  call: "From a call",
  video: "From a video",
  website: "From your website",
  crm: "From your CRM",
  strategist: "From Strategist's approved offer analysis",
  learned: "Learned from an edit",
  starter: "Starter set: not yet heard on your calls",
};

/**
 * The evidence label each source carries. What the business says or records about itself is its own data;
 * what was read on a public page or video was observed there; Strategist's analysis is an inference; the
 * starter set is untested until it is heard on a call. A reader working from a source may only lower it
 * (to an inference, or an untested hypothesis), never raise it.
 */
export const SOURCE_BASIS: Record<SourceType, Basis> = {
  person: "firstParty",
  interview: "firstParty",
  upload: "firstParty",
  call: "firstParty",
  crm: "firstParty",
  learned: "firstParty",
  video: "observed",
  website: "observed",
  strategist: "inferred",
  starter: "hypothesis",
};

const LOWER: Record<Basis, readonly Basis[]> = {
  firstParty: ["firstParty", "inferred", "hypothesis"],
  observed: ["observed", "inferred", "hypothesis"],
  inferred: ["inferred", "hypothesis"],
  hypothesis: ["hypothesis"],
  insufficient: ["insufficient"],
};

/** The label for an item from this source, lowered when asked; a request to raise it is ignored. */
export function basisFor(type: SourceType, asked?: Basis): Basis {
  const top = SOURCE_BASIS[type];
  return asked && LOWER[top].includes(asked) ? asked : top;
}

export const folder = v.union(...FOLDERS.map((row) => v.literal(row)));
export const stage = v.union(...STAGES.map((row) => v.literal(row)));
export const kind = v.union(...[...new Set(Object.values(KINDS).flat())].map((row) => v.literal(row)));
export const objectionTag = v.union(...OBJECTION_TAGS.map((row) => v.literal(row)));
export const sourceType = v.union(...SOURCE_TYPES.map((row) => v.literal(row)));
export const itemSource = v.object({
  type: sourceType,
  /** A file, transcript, asset or video id, or a link. */
  ref: v.optional(v.string()),
  /** What a person recognises it by: a file name or a video title. */
  label: v.optional(v.string()),
});
export type ItemSource = Infer<typeof itemSource>;
export const itemStatus = v.union(v.literal("active"), v.literal("archived"));

export const LESSON_STATUSES = ["proposed", "approved", "rejected", "removed"] as const;
export const lessonStatus = v.union(...LESSON_STATUSES.map((row) => v.literal(row)));
export const lessonSource = v.union(v.literal("draftEdit"), v.literal("draftRejected"), v.literal("person"));

export const LIMITS = {
  title: 120,
  body: 4000,
  sourceLabel: 160,
  sourceRef: 500,
  lesson: 600,
  /** Live items in one Playbook (one organization or one client). */
  items: 500,
  /** Lessons kept in one Playbook, any status but removed. */
  lessons: 200,
} as const;

export const PLAYBOOK_TEXT = {
  wrongFolder: "That kind of item does not belong in this folder.",
  wrongStage: "That stage does not belong in this folder.",
  stageOnlyForScript: "Only a script step has a call stage.",
  tagOnlyForObjection: "Only an objection has a tag.",
  emptyTitle: "Give it a short title.",
  full: `This Playbook holds ${LIMITS.items} items. Archive some before adding more.`,
  lessonsFull: `The learned list holds ${LIMITS.lessons} lessons. Remove some before adding more.`,
  emptyLesson: "Write the lesson in a sentence.",
  notProposed: "This lesson has already been decided.",
} as const;

export function clean(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keeps paragraphs, trims the rest. */
export function cleanBody(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIMITS.body);
}

export type ItemInput = {
  folder: Folder;
  kind: Kind;
  stage?: Stage;
  tag?: ObjectionTag;
  title: string;
  body: string;
};

/** Checks an item's shape: the kind fits the folder, a stage only on a script step in its folder, a tag only on an objection. */
export function checkItem(input: ItemInput): string | null {
  if (!(KINDS[input.folder] as readonly string[]).includes(input.kind)) return PLAYBOOK_TEXT.wrongFolder;
  if (input.stage && input.kind !== "scriptStep") return PLAYBOOK_TEXT.stageOnlyForScript;
  if (input.stage && STAGE_FOLDER[input.stage] !== input.folder) return PLAYBOOK_TEXT.wrongStage;
  if (input.tag && input.kind !== "objection") return PLAYBOOK_TEXT.tagOnlyForObjection;
  if (!clean(input.title, LIMITS.title)) return PLAYBOOK_TEXT.emptyTitle;
  return null;
}

/* ---------------------------------------------------------------------------
 * What it still needs: per skill, a count against a minimum (0.6). Never a score.
 * ------------------------------------------------------------------------- */

type Counts = { kinds: Partial<Record<Kind, number>>; scriptStages: Partial<Record<Stage, number>>; transcripts: number };

type Need = { id: string; what: string; min: number; count: (counts: Counts) => number };

const kindCount = (kindName: Kind) => (counts: Counts) => counts.kinds[kindName] ?? 0;

/** What each skill needs from the Playbook before it can do its best work. Order is the skills' order. */
export const NEEDS: readonly { skill: string; name: string; needs: readonly Need[] }[] = [
  {
    skill: "deal-briefing",
    name: "Deal Briefing",
    needs: [
      { id: "package", what: "packages in Offer", min: 1, count: kindCount("package") },
      { id: "question", what: "discovery questions in Prospect", min: 3, count: kindCount("question") },
    ],
  },
  {
    skill: "conversation-intelligence",
    name: "Conversation Intelligence",
    needs: [{ id: "script", what: "script steps across the four call stages", min: 4, count: (counts) => STAGES.filter((row) => (counts.scriptStages[row] ?? 0) > 0).length }],
  },
  {
    skill: "follow-up-engine",
    name: "Follow-up Engine",
    needs: [
      { id: "voice", what: "a voice and sign-off in Closing", min: 1, count: kindCount("voice") },
      { id: "proof", what: "pieces of proof in Offer", min: 1, count: kindCount("proof") },
    ],
  },
  {
    skill: "objection-playbook",
    name: "Objection Playbook",
    needs: [{ id: "calls", what: "call transcripts shared with Dealmaker", min: 5, count: (counts) => counts.transcripts }],
  },
  {
    skill: "proposal-architect",
    name: "Proposal Architect",
    needs: [
      { id: "price", what: "prices proposals may use in Offer", min: 1, count: kindCount("price") },
      { id: "winning", what: "past winning proposals in Closing", min: 1, count: kindCount("winningProposal") },
    ],
  },
];

export type NeedView = { skill: string; name: string; needs: { id: string; what: string; have: number; min: number; met: boolean; line: string }[]; ready: boolean };

/** "Objection Playbook needs 5 call transcripts shared with Dealmaker; you have 2." */
export function needsFrom(items: Pick<Doc<"playbookItems">, "kind" | "stage">[], transcripts: number): NeedView[] {
  const counts: Counts = { kinds: {}, scriptStages: {}, transcripts };
  for (const item of items) {
    counts.kinds[item.kind] = (counts.kinds[item.kind] ?? 0) + 1;
    if (item.kind === "scriptStep" && item.stage) counts.scriptStages[item.stage] = (counts.scriptStages[item.stage] ?? 0) + 1;
  }
  return NEEDS.map((row) => {
    const needs = row.needs.map((need) => {
      const have = need.count(counts);
      const met = have >= need.min;
      return { id: need.id, what: need.what, have, min: need.min, met, line: met ? `Has ${need.what}: ${have}.` : `Needs ${need.min} ${need.what}; you have ${have}.` };
    });
    return { skill: row.skill, name: row.name, needs, ready: needs.every((need) => need.met) };
  });
}

/* ---------------------------------------------------------------------------
 * Reading one Playbook (for screens and, later, for skills)
 * ------------------------------------------------------------------------- */

export type PlaybookScope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

/** Live items of one Playbook. A client's Playbook holds only that client's rows; the organization's only its own. */
export async function itemsOf(ctx: Pick<QueryCtx, "db">, scope: PlaybookScope): Promise<Doc<"playbookItems">[]> {
  const rows = await ctx.db
    .query("playbookItems")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .take(LIMITS.items * 2);
  return rows.filter((row) => row.status === "active");
}

export async function lessonsOf(ctx: Pick<QueryCtx, "db">, scope: PlaybookScope): Promise<Doc<"playbookLessons">[]> {
  const rows = await ctx.db
    .query("playbookLessons")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .take(LIMITS.lessons * 3);
  return rows.filter((row) => row.status !== "removed");
}

/** What a skill may use: live items and approved lessons only. A proposed lesson never guides a draft. */
export async function playbookForSkill(ctx: Pick<QueryCtx, "db">, scope: PlaybookScope) {
  const [items, lessons] = await Promise.all([itemsOf(ctx, scope), lessonsOf(ctx, scope)]);
  return { items, lessons: lessons.filter((row) => row.status === "approved") };
}
