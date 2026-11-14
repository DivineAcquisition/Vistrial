"use client";

import type { ObjectionData } from "@/components/work/objection-playbook";
import { PlaybookView, type PlaybookData } from "@/components/work/playbook-tab";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STARTER_OBJECTIONS, objectionPlaybook, type HeardCall } from "../../../../convex/lib/dealmaker/objections";
import { FOLDERS, FOLDER_LABEL, KIND_LABEL, SOURCE_LABEL, STAGE_LABEL, needsFrom, type Folder, type Kind, type SourceType, type Stage } from "../../../../convex/lib/playbook";

import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;
const BASIS: Record<string, string> = { firstParty: "Your data", observed: "Observed", inferred: "Inference", hypothesis: "Untested hypothesis" };

type Row = { folder: Folder; kind: Kind; stage?: Stage; tag?: "money" | "time" | "trust" | "fit"; title: string; body: string; source: SourceType; label?: string; basis: string };

/** A small agency that sells a 12-week growth sprint on booked calls. Sample data. */
const ROWS: Row[] = [
  { folder: "offer", kind: "package", title: "Growth Sprint", body: "Twelve weeks. Weekly strategy call, ads managed, monthly report.", source: "interview", basis: "firstParty" },
  { folder: "offer", kind: "price", title: "Growth Sprint: $4,500 a month", body: "Three-month minimum. No setup fee.", source: "upload", label: "Pricing sheet.pdf", basis: "firstParty" },
  { folder: "offer", kind: "guarantee", title: "30 booked calls or the next month is free", body: "", source: "website", label: "northlight.example/offer", basis: "observed" },
  { folder: "offer", kind: "proof", title: "Harbor Dental: 41 booked consultations in 60 days", body: "Case study, approved for quoting.", source: "upload", label: "Harbor case study.pdf", basis: "firstParty" },
  { folder: "prospect", kind: "buyer", title: "Owner-led clinics with 2 to 5 locations", body: "They have tried an agency before and were burned on reporting.", source: "interview", basis: "firstParty" },
  { folder: "prospect", kind: "question", title: "What happens to a lead after they fill in the form?", body: "", source: "video", label: "Discovery calls that close (YouTube)", basis: "observed" },
  { folder: "prospect", kind: "question", title: "Who else decides on a spend like this?", body: "", source: "person", basis: "firstParty" },
  { folder: "prospect", kind: "scriptStep", stage: "open", title: "Confirm the time and the goal of the call", body: "", source: "upload", label: "Sales script.docx", basis: "firstParty" },
  { folder: "prospect", kind: "scriptStep", stage: "discover", title: "Current lead flow, close rate, and what they have tried", body: "", source: "upload", label: "Sales script.docx", basis: "firstParty" },
  { folder: "objections", kind: "objection", tag: "money", title: "“It's more than we budgeted.”", body: "Heard on 3 calls. Talk track: tie the fee to one extra patient a month.", source: "call", label: "Call with Aster Coaching, Nov 3", basis: "firstParty" },
  { folder: "objections", kind: "objection", tag: "trust", title: "“Our last agency never showed results.”", body: "", source: "starter", basis: "hypothesis" },
  { folder: "closing", kind: "scriptStep", stage: "pitch", title: "Walk through the Harbor case in two minutes", body: "", source: "upload", label: "Sales script.docx", basis: "firstParty" },
  { folder: "closing", kind: "voice", title: "Plain, warm, signed “Nora”", body: "No exclamation marks. Never “just checking in”.", source: "interview", basis: "firstParty" },
];

function data(state: string): PlaybookData {
  const rows = state === "empty" ? [] : ROWS;
  const items = rows.map((row, index) => ({
    id: `i${index}`,
    folder: row.folder,
    kind: row.kind,
    kindLabel: KIND_LABEL[row.kind],
    stage: row.stage ?? null,
    stageLabel: row.stage ? STAGE_LABEL[row.stage] : null,
    tag: row.tag ?? null,
    title: row.title,
    body: row.body,
    quote: row.source === "call" ? "Honestly it's more than we budgeted for this quarter." : null,
    source: { type: row.source, label: row.label ?? null, ref: null, words: SOURCE_LABEL[row.source] },
    basis: row.basis as "firstParty",
    basisLabel: BASIS[row.basis],
    updatedAt: 1_763_000_000_000 - index,
  }));
  const lesson = (id: string, text: string, status: "proposed" | "approved", byDealmaker: boolean) => ({ id, text, source: byDealmaker ? ("draftEdit" as const) : ("person" as const), status, byDealmaker, proposedAt: 1_763_000_000_000, decidedAt: status === "approved" ? 1_763_000_000_000 : null });
  return {
    clientId: null,
    folders: FOLDERS.map((id) => ({ id, name: FOLDER_LABEL[id].name, holds: FOLDER_LABEL[id].holds, items: items.filter((row) => row.folder === id) })),
    lessons:
      state === "empty"
        ? { proposed: [], approved: [] }
        : {
            proposed: [lesson("l1", "Clinic owners answer a text within the hour; email waits a day.", "proposed", true)],
            approved: [lesson("l2", "Never mention the guarantee before the price.", "approved", false)],
          },
    studies:
      state === "empty"
        ? []
        : [
            { id: "st2", status: "running", sources: ["Call with Harbor Dental, Nov 10"], filed: null, dropped: null, missing: [], createdAt: 1_763_000_000_000 },
            { id: "st1", status: "done", sources: ["Call with Aster Coaching, Nov 3", "Sales script.docx"], filed: 6, dropped: 1, missing: [], createdAt: 1_762_900_000_000 },
          ],
    readable: {
      transcripts: [
        { id: "t1", title: "Call with Aster Coaching", callDate: "2026-11-03" },
        { id: "t2", title: "Call with Harbor Dental", callDate: "2026-11-10" },
      ],
      offerAnalysis: { id: "a1", title: "Offer analysis: Growth Sprint" },
    },
    needs: needsFrom(rows.map((row) => ({ kind: row.kind, stage: row.stage })), state === "empty" ? 0 : 2),
    canEdit: state !== "viewer",
  } as unknown as PlaybookData;
}

const DAY = 86_400_000;
const AT = Date.UTC(2026, 10, 14);
const MONEY = "i9" as Id<"playbookItems">;
const TRUST = "i10" as Id<"playbookItems">;

/** Calls on the story's sample agency, read by the same code the server uses. Sample data. */
function heard(state: string): HeardCall[] {
  const money = (quote: string | null, answerQuote: string | null) => ({ title: "Over budget", itemId: MONEY, quote, answered: Boolean(answerQuote), answerQuote });
  const all: HeardCall[] = [
    { id: "r1", from: "review", at: AT - 1 * DAY, leadName: "Harbor Dental", dealRef: "d1", rep: "Nora", outcome: "won", objections: [money("honestly that is more than we set aside for marketing", "one extra patient a month covers the fee"), { title: "Wants to see reports first", itemId: null, quote: "can I see what the monthly report looks like before we commit", answered: true, answerQuote: "I'll send last month's Harbor report" }] },
    { id: "r2", from: "review", at: AT - 3 * DAY, leadName: "Aster Coaching", dealRef: "d2", rep: "Milo", outcome: "lost", objections: [money("it's more than we budgeted", null)] },
    { id: "n3", from: "notes", at: AT - 4 * DAY, leadName: "Bright Path Tutors", dealRef: "d3", rep: "Milo", outcome: "open", objections: [{ title: "Our last agency never showed results", itemId: TRUST, quote: null, answered: false, answerQuote: null }] },
    { id: "r4", from: "review", at: AT - 6 * DAY, leadName: "Cedar Physio", dealRef: "d4", rep: "Nora", outcome: "won", objections: [money("we were hoping for something closer to two thousand", "the three-month minimum is what gets the 30 booked calls")] },
    { id: "r5", from: "review", at: AT - 9 * DAY, leadName: "Lumen Studio", dealRef: "d5", rep: "Milo", outcome: "open", objections: [money(null, "one extra patient a month covers the fee")] },
  ];
  return state === "few" ? all.slice(0, 2) : state === "empty" ? [] : all;
}

function objections(state: string): ObjectionData {
  const items =
    state === "empty"
      ? []
      : [
          { id: MONEY, title: "“It's more than we budgeted.”", tag: "money" as const, starter: false },
          { id: TRUST, title: "“Our last agency never showed results.”", tag: "trust" as const, starter: true },
          { id: "i20" as Id<"playbookItems">, title: STARTER_OBJECTIONS[2].title, tag: STARTER_OBJECTIONS[2].tag, starter: true },
        ];
  const owner = state !== "viewer";
  return { ...objectionPlaybook({ items, calls: heard(state), showLeads: owner, showReps: owner }), starterMissing: state === "empty" ? STARTER_OBJECTIONS.length : 6, canEdit: owner, isOwner: owner };
}

export function PlaybookTabStory({ state, folder, theme }: { state: string; folder: string; theme: string }) {
  const editor = state !== "viewer";
  const open = (FOLDERS as readonly string[]).includes(folder) ? (folder as Folder) : "offer";
  return (
    <StoryFrame theme={theme} role={editor ? "owner" : "viewer"}>
      <PlaybookView
        data={data(state)}
        interview={
          state === "viewer"
            ? null
            : {
                data: {
                  questions: [
                    { id: "stages", title: "What each pipeline stage means", ask: "In your own words, what has happened when a deal reaches each stage?" },
                    { id: "proof", title: "Proof you may quote", ask: "Results, case studies or testimonials Dealmaker may quote to a lead." },
                  ],
                  total: 7,
                  stages: [
                    { ref: "s1", name: "New lead", meaning: "" },
                    { ref: "s2", name: "Call booked", meaning: "" },
                    { ref: "s3", name: "Proposal sent", meaning: "" },
                  ],
                  scriptStages: [],
                  quietDays: { value: 14, choices: [7, 14, 21, 30], suggested: 14 },
                  channels: [
                    { id: "sms", label: "Text messages", on: true },
                    { id: "email", label: "Email", on: true },
                    { id: "voice", label: "Voice notes", on: false },
                    { id: "dm", label: "Instagram and Facebook messages", on: false },
                  ],
                  consentTags: [],
                  canEdit: true,
                },
                actions: { stages: noop, quietDays: noop, script: noop, pkg: noop, proof: noop, voice: noop, consent: noop, skip: noop },
              }
        }
        editor={editor}
        objections={{ data: objections(state), actions: { addStarter: noop, addHeard: noop } }}
        initialFolder={open}
        actions={{ addItem: noop, updateItem: noop, archiveItem: noop, addLesson: noop, decideLesson: noop, editLesson: noop, removeLesson: noop, study: noop }}
      />
    </StoryFrame>
  );
}
