import type { Enums } from "@/types/database";

export type TranscriptSource = Enums<"transcript_source">;
export type ExtractionSignalState = Enums<"extraction_signal_state">;
export type ExtractionJobStatus = Enums<"extraction_job_status">;
export type ExtractionStatus = "none" | "pending" | "ready" | "failed";

export type NormalizedTranscript = {
  source: TranscriptSource;
  providerEventId: string | null;
  providerCallId: string | null;
  occurredAt: string | null;
  scheduledAt: string | null;
  durationSeconds: number | null;
  participantEmails: string[];
  title: string | null;
  transcript: string;
};

export type TranscriptMatch =
  | { kind: "matched"; callId: string; method: "provider_id" | "time" | "email" }
  | { kind: "unmatched"; reason: "no_unique_call" };

export type VerbatimQuote = {
  text: string;
  topic: string;
};

export type ExtractedSignal = {
  state: ExtractionSignalState;
  text: string | null;
};

export type ExtractedObjection = {
  type: Enums<"objection_type">;
  verbatim: string;
};

export type ParsedExtraction = {
  summary: string | null;
  statedObjection: ExtractedSignal;
  budgetSignal: ExtractedSignal;
  timelineSignal: ExtractedSignal;
  decisionProcess: ExtractedSignal;
  nextStepAgreed: ExtractedSignal;
  quotes: VerbatimQuote[];
  objections: ExtractedObjection[];
};
