import type { Enums } from "@/types/database";
import type { ExtractionStatus } from "@/lib/transcripts/types";
import type { QueueCrmStatus } from "@/lib/queue/types";

export const CALL_PAGE_SIZE = 50;

export type CallListRow = {
  id: string;
  leadId: string;
  leadName: string;
  type: Enums<"call_type">;
  scheduledAt: string | null;
  occurredAt: string | null;
  durationSeconds: number | null;
  outcome: Enums<"call_outcome"> | null;
  ranByName: string | null;
  hasTranscript: boolean;
  extractionStatus: ExtractionStatus;
};

export type CallListPayload = {
  crmStatus: QueueCrmStatus;
  orgCallCount: number;
  rows: CallListRow[];
  hasMore: boolean;
};

export type CallExtractionView = {
  id: string;
  summary: string | null;
  statedObjection: string | null;
  statedObjectionState: Enums<"extraction_signal_state">;
  budgetSignal: string | null;
  budgetSignalState: Enums<"extraction_signal_state">;
  timelineSignal: string | null;
  timelineSignalState: Enums<"extraction_signal_state">;
  decisionProcess: string | null;
  decisionProcessState: Enums<"extraction_signal_state">;
  nextStepAgreed: string | null;
  nextStepState: Enums<"extraction_signal_state">;
  quotes: Array<{ text: string; topic: string }>;
  modelVersion: string | null;
  extractedAt: string;
};

export type CallDetailPayload = {
  call: {
    id: string;
    orgId: string;
    leadId: string;
    type: Enums<"call_type">;
    scheduledAt: string | null;
    occurredAt: string | null;
    durationSeconds: number | null;
    outcome: Enums<"call_outcome"> | null;
    ranByName: string | null;
    transcriptSource: Enums<"transcript_source"> | null;
    transcriptArrivedAt: string | null;
    rawTranscript: string | null;
  };
  lead: { id: string; name: string };
  extraction: CallExtractionView | null;
  objections: Array<{
    id: string;
    type: Enums<"objection_type">;
    verbatim: string;
    resolved: boolean;
    resolvedAt: string | null;
    resolvedNote: string | null;
  }>;
  job: {
    id: string;
    status: Enums<"extraction_job_status">;
    attemptCount: number;
    lastError: string | null;
    nextAttemptAt: string;
  } | null;
  scoreChange: {
    total: number;
    previousTotal: number | null;
    reasoning: string | null;
    createdAt: string;
  } | null;
  corrections: Array<{
    id: string;
    fieldName: string;
    actorName: string | null;
    createdAt: string;
  }>;
};
