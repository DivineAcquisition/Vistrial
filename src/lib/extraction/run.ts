import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { processScribeQueue } from "@/lib/scribe/run";

/**
 * Extraction jobs are Scribe's work: it claims them fairly across workspaces,
 * writes the call extraction and the case file, and records each stage.
 */
export async function processExtractionQueue(db: GhlDb, max = 10): Promise<{
  jobs: number;
  failed: number;
  waiting: number;
}> {
  return processScribeQueue(db, max);
}
