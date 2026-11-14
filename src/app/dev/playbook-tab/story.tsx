"use client";

import { PlaybookView, type PlaybookData } from "@/components/work/playbook-tab";
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
    needs: needsFrom(rows.map((row) => ({ kind: row.kind, stage: row.stage })), state === "empty" ? 0 : 2),
    canEdit: state !== "viewer",
  } as unknown as PlaybookData;
}

export function PlaybookTabStory({ state, folder, theme }: { state: string; folder: string; theme: string }) {
  const editor = state !== "viewer";
  const open = (FOLDERS as readonly string[]).includes(folder) ? (folder as Folder) : "offer";
  return (
    <StoryFrame theme={theme} role={editor ? "owner" : "viewer"}>
      <PlaybookView
        data={data(state)}
        editor={editor}
        initialFolder={open}
        actions={{ addItem: noop, updateItem: noop, archiveItem: noop, addLesson: noop, decideLesson: noop, editLesson: noop, removeLesson: noop }}
      />
    </StoryFrame>
  );
}
