import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Finishes the agent rename (sales to growth-architect) on any deployment that still has old rows,
 * production included, without anyone running the migration by hand. A no-op once it is done.
 * Remove together with the old area fields after every deployment reports zero remaining.
 */
crons.interval("finish agent rename", { minutes: 10 }, internal.agentsMigration.backfillIfNeeded, {});

/**
 * Fills any kind of model work that has no route with the defaults (research and write on Opus, classify
 * and summarize on Sonnet). It never changes a route that exists, so a Platform Admin's choice stands, and
 * a deployment works without anyone running platform:ensureDefaultRoutes by hand.
 */
crons.interval("fill default model routes", { hours: 1 }, internal.platform.ensureDefaultRoutes, {});

/** Keeps connected Meta ad accounts' results fresh (read-only). */
crons.interval("refresh Meta ad results", { hours: 3 }, internal.metaAds.syncAll, {});

/** Resends any credit charge Autumn did not take the first time. Does nothing while billing is off. */
crons.interval("retry billing sync", { hours: 1 }, internal.billingActions.retryUnsynced, {});

/** Emails Owners and Managers the check-ins that came due. Each check-in is sent once. Does nothing without a Resend key. */
crons.interval("email check-ins due", { hours: 1 }, internal.emailReminders.sendCheckInsDue, {});

export default crons;
