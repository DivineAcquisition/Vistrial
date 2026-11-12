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
 * Gives every workspace from before accounts existed an account of its own and rewrites the old role
 * words (manager, rep) to the new ones, on any deployment that still has some. A no-op once it is done.
 * Remove together with the old role words after every deployment reports zero remaining.
 */
crons.interval("finish accounts and roles", { minutes: 10 }, internal.organizationsMigration.backfillIfNeeded, {});

/**
 * Turns each brand kit that was made "for a client" into a real client and links the two, on any
 * deployment that still has an unlinked one. A no-op once it is done.
 */
crons.interval("link client brand kits", { minutes: 10 }, internal.clientsMigration.backfillIfNeeded, {});

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

/** Emails Owners and Admins the check-ins that came due. Each check-in is sent once. Does nothing without a Resend key. */
crons.interval("email check-ins due", { hours: 1 }, internal.emailReminders.sendCheckInsDue, {});

/** Keeps connected calendars' booked-call counts fresh (read-only). Does nothing while none is connected. */
crons.interval("refresh calendar bookings", { hours: 6 }, internal.bookings.syncAll, {});

/** Removes export files a week after they were built. The record that an export was made stays. */
crons.interval("remove old exports", { hours: 6 }, internal.exports.removeExpired, {});

export default crons;
