/** Scribe's case file as the screens see it. Client-safe. */

export type CaseFileStatus = "building" | "ready" | "needs_review" | "held";

export type CaseFieldView = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  state: "present" | "unclear" | "absent";
  quote: string | null;
  source: "scribe" | "person";
  locked: boolean;
  editedAt: string | null;
  suggestion: string | number | boolean | null;
  reviewNote: string | null;
  /** Where the quote came from: the call and who said it. */
  from: { callId: string; speaker: "prospect" | "team" | "unknown" } | null;
};

export type ScribeCaseFileView = {
  id: string;
  leadId: string;
  status: CaseFileStatus;
  summary: string | null;
  nextStep: string | null;
  readinessReason: string | null;
  score: number | null;
  band: string | null;
  bandMeaning: string | null;
  openQuestions: string[];
  reviewReasons: string[];
  heldReason: string | null;
  version: number;
  lastCallId: string | null;
  lastRunId: string | null;
  builtAt: string | null;
  fields: CaseFieldView[];
};

export const CASE_FILE_STATUS_LABEL: Record<CaseFileStatus, string> = {
  building: "Scribe is updating this",
  ready: "Up to date",
  needs_review: "Needs a look",
  held: "Held for review",
};

export function formatFieldValue(value: CaseFieldView["value"]): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null || value === "") return "Not known yet";
  return String(value);
}
