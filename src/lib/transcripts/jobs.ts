import "server-only";

import { processExtractionQueue } from "@/lib/extraction/run";
import { processFollowUpQueue } from "@/lib/follow-up/generate";
import { processTranscriptWebhookQueue } from "@/lib/transcripts/process";
import { pullRecorderTranscripts } from "@/lib/transcripts/pull";
import { transcriptLog } from "@/lib/transcripts/log";
import { backfillScribeEmbeddings, scribeDb } from "@/lib/scribe/store";
import type { GhlDb } from "@/lib/ghl/tokens";

export async function runTranscriptJobs(db: GhlDb): Promise<{
  pulled: number;
  events: number;
  extractions: number;
  followUps: number;
  embedded: number;
  failed: number;
}> {
  const pulled = await pullRecorderTranscripts(db);
  const events = await processTranscriptWebhookQueue(db);
  const extractions = await processExtractionQueue(db);
  const followUps = await processFollowUpQueue(db);
  const embeddings = await backfillScribeEmbeddings(scribeDb()).catch(() => ({ embedded: 0, waiting: true }));
  transcriptLog("transcript.jobs.ran", {
    pulled: pulled.pulled,
    stored: pulled.stored,
    events: events.events,
    extractions: extractions.jobs,
    followUps: followUps.jobs,
    extractionsWaiting: extractions.waiting,
    embedded: embeddings.embedded,
    failed: events.failed + extractions.failed + followUps.failed,
  });
  return {
    pulled: pulled.stored,
    events: events.events,
    extractions: extractions.jobs,
    followUps: followUps.jobs,
    embedded: embeddings.embedded,
    failed: events.failed + extractions.failed + followUps.failed,
  };
}
