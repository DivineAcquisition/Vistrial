import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Finishes the agent rename (sales to growth-architect) on any deployment that still has old rows,
 * production included, without anyone running the migration by hand. A no-op once it is done.
 * Remove together with the old area fields after every deployment reports zero remaining.
 */
crons.interval("finish agent rename", { minutes: 10 }, internal.agentsMigration.backfillIfNeeded, {});

/** Keeps connected Meta ad accounts' results fresh (read-only). */
crons.interval("refresh Meta ad results", { hours: 3 }, internal.metaAds.syncAll, {});

export default crons;
