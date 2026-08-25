import type { Enums } from "@/types/database";
import type { ExtractionSignalState } from "@/lib/transcripts/types";

export type BriefSignal = {
  state: ExtractionSignalState | "not_established";
  text: string | null;
};

export type BriefPayload = {
  lead: {
    id: string;
    name: string;
    source: string | null;
    campaign: string | null;
    offerName: string | null;
    leadType: Enums<"lead_type"> | null;
    status: Enums<"lead_status"> | null;
    optedInAt: string;
    assignedSetterName: string | null;
    assignedCloserName: string | null;
    applicationAnswers: Record<string, unknown>;
  };
  score: {
    id: string;
    total: number;
    timeline: number | null;
    investmentCapacity: number | null;
    decisionAuthority: number | null;
    painSeverity: number | null;
    triggeredBy: Enums<"score_trigger">;
  } | null;
  setterFacts: Array<{ label: string; value: string }>;
  openObjections: Array<{
    id: string;
    type: Enums<"objection_type">;
    verbatim: string;
    callId: string | null;
    callType: Enums<"call_type"> | null;
    callOccurredAt: string | null;
  }>;
  lastCall: {
    id: string;
    type: Enums<"call_type">;
    summary: string | null;
    nextStepAgreed: string | null;
    nextStepState: ExtractionSignalState | null;
  } | null;
  quotes: Array<{ text: string; topic: string }>;
  history: {
    noShowCount: number;
    rescheduleCount: number;
    daysInPipeline: number;
    lastInboundAt: string | null;
    lastInboundChannel: string | null;
  };
  suggestedOpening: string | null;
  cacheKey: string;
  whatWorks: Array<{
    statement: string;
    sampleClosed: number;
    sampleLost: number;
    leadQualityCaveat: string | null;
  }>;
};
