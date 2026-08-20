import "server-only";

import { processExtractionQueue } from "@/lib/extraction/run";
import { processTranscriptWebhookQueue } from "@/lib/transcripts/process";
import { pullRecorderTranscripts } from "@/lib/transcripts/pull";
import { transcriptLog } from "@/lib/transcripts/log";
import type { GhlDb } from "@/lib/ghl/tokens";

export async function runTranscriptJobs(db: GhlDb): Promise<{
  pulled: number;
  events: number;
  extractions: number;
  failed: number;
}> {
  const pulled = await pullRecorderTranscripts(db);
  const events = await processTranscriptWebhookQueue(db);
  const extractions = await processExtractionQueue(db);
  transcriptLog("transcript.jobs.ran", {
    pulled: pulled.pulled,
    stored: pulled.stored,
    events: events.events,
    extractions: extractions.jobs,
    failed: events.failed + extractions.failed,
  });
  return {
    pulled: pulled.stored,
    events: events.events,
    extractions: extractions.jobs,
    failed: events.failed + extractions.failed,
  };
}
